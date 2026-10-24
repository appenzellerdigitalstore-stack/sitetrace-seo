import type { Check, CheckGroup, CheckStatus, AuditResult } from "./types";

/**
 * On-page audit engine. Runs entirely in the browser against a fetched HTML
 * string — no LLM, no API call, deterministic. Same input always produces the
 * same report, which is what makes it citable evidence rather than an opinion.
 */

const attr = (el: Element | null, name: string): string =>
  el?.getAttribute(name)?.trim() ?? "";

const metaContent = (doc: Document, selector: string): string => {
  const el = doc.querySelector(selector);
  return el?.getAttribute("content")?.trim() ?? "";
};

const titleOf = (doc: Document): string => doc.querySelector("title")?.textContent?.trim() ?? "";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function metaTag(attrs: Record<string, string>): string {
  const pairs = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
    .join(" ");
  return `<meta ${pairs}>`;
}

const weights: Record<CheckStatus, number> = { pass: 1, info: 0.5, warn: 0.25, fail: 0 };

/**
 * Decides whether the fetched HTML is the real page or an empty shell that
 * JavaScript fills in later.
 *
 * Signals for a client-rendered app: no title, no description, no headings,
 * a root mount node, and a framework marker in the markup.
 */
function detectRenderMode(doc: Document): "server" | "client" | "unknown" {
  const hasTitle = !!doc.querySelector("title")?.textContent?.trim();
  const hasDescription = !!doc.querySelector('meta[name="description" i]');
  const hasHeadings = doc.querySelectorAll("h1,h2,h3").length > 0;
  const hasMeaningfulText = (doc.body?.textContent?.trim().length ?? 0) > 120;

  if (hasTitle || hasDescription || hasHeadings || hasMeaningfulText) {
    return "server";
  }

  const markers = [
    'div#root',
    'div#app',
    'div#__next',
    'div#__nuxt',
    'script#__NEXT_DATA__',
    'script#__NUXT_DATA__',
    'script[type="application/json" i][data-reactroot]',
  ];
  const hasMount = markers.some((sel) => !!doc.querySelector(sel));
  const hasModuleScript = !!doc.querySelector('script[type="module" i]');

  if (hasMount || (hasModuleScript && !hasMeaningfulText)) {
    return "client";
  }

  return "unknown";
}

export function runAudit(html: string, requestedUrl: string, finalUrl: string): AuditResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const checks: Check[] = [];

  const add = (
    group: CheckGroup,
    id: string,
    label: string,
    status: CheckStatus,
    detail: string,
    extra: { why?: string; fix?: string } = {},
  ) => checks.push({ group, id, label, status, detail, ...extra });

  // ---------------------------------------------------------------- render
  // A client-rendered page sends near-empty HTML and fills in the tags with
  // JavaScript. Reporting "missing meta description" for such a page is a
  // false claim, so the mode is detected up front and every tag-related
  // finding carries a caveat.
  const rendered = detectRenderMode(doc);
  const clientRendered = rendered === "client";

  if (clientRendered) {
    add(
      "Search basics",
      "rendering",
      "Page rendering",
      "warn",
      "This page builds its content in the browser, so the server returns an empty shell.",
      {
        why: "The audit only sees the HTML the server sends. Tags injected by JavaScript are invisible to it, so any 'missing' finding below may be a false alarm. The page still needs server-rendered tags for search engines to read it.",
      },
    );
  }

  // ---------------------------------------------------------------- search
  const title = titleOf(doc);
  const isHomepage = /\/(index\.html?)?$/.test(new URL(finalUrl).pathname);

  if (!title) {
    add("Search basics", "title", "Title tag", "fail", "No <title> element found.", {
      why: "The title is the clickable headline in Google. Without it the page cannot rank well and may show a raw URL.",
      fix: `<title>${escapeHtml(isHomepage ? "Your Brand — what you do" : "Page topic — Your Brand")}</title>`,
    });
  } else if (isHomepage && title.length < 30) {
    // The rule from the Gemini thread, applied properly: a short brand-only
    // title is legitimate on a homepage, so this is information, not a defect.
    add("Search basics", "title", "Title tag", "info", `Title is ${title.length} characters ("${title}").`, {
      why: "Homepages often use a short brand-only title. That is acceptable — the 50–60 character target applies to pages competing for non-brand searches.",
      fix: title.length < 50
        ? `<title>${escapeHtml(title)} — one clause explaining what the site does</title>`
        : undefined,
    });
  } else if (title.length < 30) {
    add("Search basics", "title", "Title tag", "warn", `Title is only ${title.length} characters.`, {
      why: "Short titles waste the most valuable space on the results page.",
      fix: `<title>${escapeHtml(title)}</title>`,
    });
  } else if (title.length > 60) {
    add("Search basics", "title", "Title tag", "warn", `Title is ${title.length} characters and will be truncated in Google.`, {
      why: "Google truncates around 580px, roughly 60 characters. Anything past that is cut.",
      fix: `<title>${title.slice(0, 57).trimEnd()}…</title>`,
    });
  } else {
    add("Search basics", "title", "Title tag", "pass", `Title is ${title.length} characters — within the recommended range.`);
  }

  const description = metaContent(doc, 'meta[name="description" i]');
  if (!description) {
    add("Search basics", "description", "Meta description", "fail", "No meta description found.", {
      why: "This is the grey snippet under your title in Google. Without it Google writes one, and it rarely sells the click.",
      fix: metaTag({ name: "description", content: "A 120–160 character summary that makes the click worth making." }),
    });
  } else if (description.length < 70 || description.length > 160) {
    add("Search basics", "description", "Meta description", "warn", `Meta description is ${description.length} characters (target 120–160).`, {
      fix: metaTag({ name: "description", content: description }),
    });
  } else {
    add("Search basics", "description", "Meta description", "pass", `Meta description is ${description.length} characters.`);
  }

  const canonical = doc.querySelector('link[rel="canonical" i]')?.getAttribute("href")?.trim() ?? "";
  if (!canonical) {
    add("Search basics", "canonical", "Canonical URL", "warn", "No canonical tag found.", {
      why: "Canonical tells Google which URL is the real one. Without it duplicate URLs can split your ranking signal.",
      fix: `<link rel="canonical" href="${escapeHtml(finalUrl)}">`,
    });
  } else {
    let canonicalHost = "";
    try {
      canonicalHost = new URL(canonical, finalUrl).host;
    } catch {
      /* leave blank; reported below */
    }
    if (!canonicalHost) {
      add("Search basics", "canonical", "Canonical URL", "fail", `Canonical tag has an unparseable href: "${canonical}".`, {
        fix: `<link rel="canonical" href="${escapeHtml(finalUrl)}">`,
      });
    } else if (canonicalHost !== new URL(finalUrl).host) {
      add("Search basics", "canonical", "Canonical URL", "warn", `Canonical points to a different host (${canonicalHost}).`, {
        why: "This may be intentional, but it tells Google to rank that other URL instead of this one.",
      });
    } else {
      add("Search basics", "canonical", "Canonical URL", "pass", "Canonical tag present and points at this host.");
    }
  }

  const robots = metaContent(doc, 'meta[name="robots" i]');
  if (/noindex/i.test(robots)) {
    add("Search basics", "robots", "Robots meta", "fail", `Robots meta contains "noindex" (${robots}).`, {
      why: "This page is explicitly excluded from search results.",
      fix: metaTag({ name: "robots", content: "index, follow" }),
    });
  } else if (!robots) {
    add("Search basics", "robots", "Robots meta", "info", "No robots meta tag — Google defaults to index, follow.");
  } else {
    add("Search basics", "robots", "Robots meta", "pass", `Robots meta is "${robots}".`);
  }

  if (!doc.documentElement.getAttribute("lang")) {
    add("Search basics", "lang", "Language attribute", "warn", "<html> has no lang attribute.", {
      why: "Screen readers and Google both use it to pick the right pronunciation and locale.",
      fix: `<html lang="en">`,
    });
  } else {
    add("Search basics", "lang", "Language attribute", "pass", `Language set to "${doc.documentElement.getAttribute("lang")}".`);
  }

  const viewport = metaContent(doc, 'meta[name="viewport" i]');
  if (!viewport) {
    add("Search basics", "viewport", "Mobile viewport", "warn", "No viewport meta tag found.", {
      why: "Without it Google assesses the desktop layout on a phone.",
      fix: metaTag({ name: "viewport", content: "width=device-width, initial-scale=1" }),
    });
  } else {
    add("Search basics", "viewport", "Mobile viewport", "pass", "Viewport meta tag present.");
  }

  // -------------------------------------------------------------- headings
  const h1s = Array.from(doc.querySelectorAll("h1"));
  if (h1s.length === 0) {
    add("Headings", "h1", "H1 heading", "fail", "No <h1> found on the page.", {
      why: "The H1 tells both Google and screen readers what this page is about.",
      fix: `<h1>The single main heading for this page</h1>`,
    });
  } else if (h1s.length > 1) {
    add("Headings", "h1", "H1 heading", "warn", `${h1s.length} <h1> elements found.`, {
      why: "Multiple H1s dilute the signal about what the page is for.",
    });
  } else {
    add("Headings", "h1", "H1 heading", "pass", `One <h1>: "${h1s[0].textContent?.trim().slice(0, 70) ?? ""}".`);
  }

  const allHeadings = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) => ({
    level: Number(h.tagName.slice(1)),
    text: h.textContent?.trim() ?? "",
  }));
  const skips = allHeadings.filter((h, i) => i > 0 && h.level - allHeadings[i - 1].level > 1);
  if (skips.length > 0) {
    add("Headings", "hierarchy", "Heading hierarchy", "warn", `${skips.length} heading level(s) skipped, e.g. h${allHeadings[0]?.level} → h${skips[0]?.level}.`, {
      why: "Skipped levels break the document outline that screen readers navigate by.",
    });
  } else if (allHeadings.length > 1) {
    add("Headings", "hierarchy", "Heading hierarchy", "pass", "Heading levels descend without skipping.");
  }

  // --------------------------------------------------------- social/sharing
  const ogTitle = metaContent(doc, 'meta[property="og:title" i]');
  const ogDesc = metaContent(doc, 'meta[property="og:description" i]');
  const ogImage = metaContent(doc, 'meta[property="og:image" i]');
  const ogUrl = metaContent(doc, 'meta[property="og:url" i]');
  const ogType = metaContent(doc, 'meta[property="og:type" i]');

  if (!ogTitle && !ogImage) {
    add("Social & sharing", "og", "Open Graph tags", "fail", "No Open Graph tags found.", {
      why: "Without them, sharing your link on WhatsApp, Facebook, LinkedIn or X shows a bare URL.",
      fix: [
        metaTag({ property: "og:type", content: ogType || "website" }),
        metaTag({ property: "og:title", content: title || "Page title" }),
        metaTag({ property: "og:description", content: description || "Page description" }),
        metaTag({ property: "og:url", content: finalUrl }),
        metaTag({ property: "og:image", content: "https://example.com/og-image.jpg" }),
      ].join("\n"),
    });
  } else {
    const missing = [
      !ogTitle && "og:title",
      !ogDesc && "og:description",
      !ogImage && "og:image",
      !ogUrl && "og:url",
      !ogType && "og:type",
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      add("Social & sharing", "og", "Open Graph tags", "warn", `Missing: ${missing.join(", ")}.`, {
        fix: missing.map((m) => metaTag({ property: m, content: "…" })).join("\n"),
      });
    } else {
      add("Social & sharing", "og", "Open Graph tags", "pass", "All five Open Graph properties present.");
    }
  }

  const twCard = metaContent(doc, 'meta[name="twitter:card" i]');
  if (!twCard) {
    add("Social & sharing", "twitter", "X / Twitter card", "warn", "No twitter:card tag found.", {
      why: "X renders a small text link without it, and a large image card with it.",
      fix: `<meta name="twitter:card" content="summary_large_image">`,
    });
  } else {
    add("Social & sharing", "twitter", "X / Twitter card", "pass", `twitter:card is "${twCard}".`);
  }

  // ------------------------------------------------------ structured data
  const jsonLd = Array.from(doc.querySelectorAll('script[type="application/ld+json" i]'));
  if (jsonLd.length === 0) {
    add("Structured data", "schema", "Schema.org JSON-LD", "warn", "No JSON-LD structured data found.", {
      why: "Structured data is what makes rich results (ratings, FAQs, breadcrumbs) possible in Google.",
      fix: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "${escapeHtml(title)}",\n  "url": "${escapeHtml(finalUrl)}"\n}\n</script>`,
    });
  } else {
    let valid = 0;
    for (const el of jsonLd) {
      try {
        JSON.parse(el.textContent ?? "");
        valid++;
      } catch {
        /* counted below */
      }
    }
    if (valid === 0) {
      add("Structured data", "schema", "Schema.org JSON-LD", "fail", `${jsonLd.length} JSON-LD block(s) found but none parse as valid JSON.`, {
        why: "Invalid JSON-LD is silently ignored by Google.",
      });
    } else {
      add("Structured data", "schema", "Schema.org JSON-LD", "pass", `${valid} valid JSON-LD block(s).`);
    }
  }

  // -------------------------------------------------------- content/links
  const body = doc.body;
  const text = (body?.textContent ?? "").replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  if (words < 300) {
    add("Content & links", "wordcount", "Word count", "warn", `Only ${words} words of body text.`, {
      why: "Thin pages rarely rank for competitive terms. Aim for 600+ on a normal content page.",
    });
  } else {
    add("Content & links", "wordcount", "Word count", "pass", `${words.toLocaleString()} words of body text.`);
  }

  const images = Array.from(doc.querySelectorAll("img"));
  const missingAlt = images.filter((img) => !attr(img, "alt"));
  if (images.length === 0) {
    add("Content & links", "alt", "Image alt text", "info", "No images on this page.");
  } else if (missingAlt.length > 0) {
    add("Content & links", "alt", "Image alt text", "warn", `${missingAlt.length} of ${images.length} images have no alt attribute.`, {
      why: "Alt text is how Google image search and screen readers understand an image.",
      fix: missingAlt
        .slice(0, 3)
        .map((img) => `<img src="${escapeHtml(attr(img, "src"))}" alt="Describe what the image shows">`)
        .join("\n"),
    });
  } else {
    add("Content & links", "alt", "Image alt text", "pass", `All ${images.length} images have alt text.`);
  }

  const links = Array.from(doc.querySelectorAll("a[href]"));
  const emptyLinks = links.filter((a) => !attr(a, "href"));
  if (emptyLinks.length > 0) {
    add("Content & links", "emptylinks", "Empty links", "warn", `${emptyLinks.length} <a href=""> elements found.`, {
      why: "Empty hrefs do nothing and are treated as a page-quality signal.",
    });
  } else if (links.length > 0) {
    add("Content & links", "emptylinks", "Empty links", "pass", `${links.length} links checked, none empty.`);
  }

  // --------------------------------------------------------------- scoring
  // On a client-rendered page, "missing" findings are probably wrong, so the
  // affected checks are weighted as notes rather than failures. The score is
  // still returned, but callers show it as unavailable (see AuditResult.rendered).
  if (clientRendered) {
    const caveat =
      "This page renders client-side, so the server HTML may not contain this tag even though the live page has it.";
    const affected = new Set([
      "title",
      "description",
      "canonical",
      "og",
      "twitter",
      "h1",
      "hierarchy",
      "schema",
      "wordcount",
      "alt",
    ]);
    for (const c of checks) {
      if (affected.has(c.id) && (c.status === "fail" || c.status === "warn")) {
        c.caveat = caveat;
        c.status = "info";
      }
    }
  }

  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, info: 0 };
  let total = 0;
  for (const c of checks) {
    counts[c.status]++;
    total += weights[c.status];
  }
  const score = checks.length ? Math.round((total / checks.length) * 100) : 0;

  return {
    url: requestedUrl,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    title,
    description,
    ogImage,
    checks,
    score,
    counts,
    rendered,
  };
}

export const GROUP_ORDER: CheckGroup[] = [
  "Search basics",
  "Headings",
  "Social & sharing",
  "Structured data",
  "Content & links",
];