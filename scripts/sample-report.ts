/**
 * Generates a sample report to disk so the PDF layout can be eyeballed
 * without going through a browser download.
 *
 * Run: npx esbuild scripts/sample-report.ts --bundle --platform=node \
 *        --format=esm --outfile=dist-tools/sample-report.mjs
 *      node dist-tools/sample-report.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReportPdf } from "../src/pdf";
import { DEFAULT_BRAND, setDefaultLogo } from "../src/brand";
import type { AuditResult, Brand, Check, CheckGroup } from "../src/types";

const c = (
  group: CheckGroup,
  id: string,
  label: string,
  status: Check["status"],
  detail: string,
  extra: { why?: string; fix?: string } = {},
): Check => ({ group, id, label, status, detail, ...extra });

const checks: Check[] = [
  c("Search basics", "title", "Title tag", "pass", "Title is 39 characters — within the recommended range."),
  c("Search basics", "description", "Meta description", "pass", "Meta description is 117 characters."),
  c(
    "Search basics",
    "canonical",
    "Canonical URL",
    "warn",
    "No canonical tag found.",
    {
      why: "Canonical tells Google which URL is the real one. Without it duplicate URLs can split your ranking signal.",
      fix: '<link rel="canonical" href="https://sitetrace.it.com/">',
    },
  ),
  c("Search basics", "robots", "Robots meta", "pass", 'Robots meta is "index, follow, noai".'),
  c("Search basics", "lang", "Language attribute", "pass", 'Language set to "en".'),
  c("Search basics", "viewport", "Mobile viewport", "pass", "Viewport meta tag present."),
  c("Headings", "h1", "H1 heading", "pass", 'One <h1>: "Clarity in every connection".'),
  c("Headings", "hierarchy", "Heading hierarchy", "pass", "Heading levels descend without skipping."),
  c("Social & sharing", "og", "Open Graph tags", "pass", "All five Open Graph properties present."),
  c("Social & sharing", "twitter", "X / Twitter card", "pass", 'twitter:card is "summary_large_image".'),
  c(
    "Structured data",
    "schema",
    "Schema.org JSON-LD",
    "fail",
    "No JSON-LD structured data found.",
    {
      why: "Structured data is what makes rich results (ratings, FAQs, breadcrumbs) possible in Google.",
      fix: '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "SiteTrace — Clarity in every connection",\n  "url": "https://sitetrace.it.com/"\n}\n</script>',
    },
  ),
  c("Content & links", "wordcount", "Word count", "pass", "438 words of body text."),
  c("Content & links", "alt", "Image alt text", "info", "No images on this page."),
  c("Content & links", "emptylinks", "Empty links", "pass", "29 links checked, none empty."),
];

const result: AuditResult = {
  url: "https://sitetrace.it.com/",
  finalUrl: "https://sitetrace.it.com/",
  fetchedAt: new Date().toISOString(),
  title: "SiteTrace — Clarity in every connection",
  description:
    "Trace an IP resolve a domain understand your network. Discover 21 focused internet diagnostic tools with SiteTrace.",
  ogImage: "https://sitetrace.it.com/og-image.png",
  checks,
  score: 78,
  counts: { pass: 11, warn: 1, fail: 1, info: 2 },
};

// The browser preloads this at startup; here we load it from disk so the
// sample PDFs carry the real SiteTrace mark rather than the vector fallback.
const markPath = resolve(process.cwd(), "public", "brand", "sitetrace-mark-white.png");
setDefaultLogo(`data:image/png;base64,${readFileSync(markPath).toString("base64")}`);

const brand: Brand = { ...DEFAULT_BRAND };

const doc = buildReportPdf(result, brand);
const bytes = doc.output("arraybuffer");
writeFileSync("sample-report-default.pdf", Buffer.from(bytes));

// The same report, wearing an agency's brand — this is the whole point.
const clientBrand: Brand = {
  logo: "default",
  name: "Northlight Studio",
  site: "northlight.studio",
  accent: "#db2777",
  tagline: "Web design & performance — Manchester",
};
writeFileSync("sample-report-agency.pdf", Buffer.from(buildReportPdf(result, clientBrand).output("arraybuffer")));

console.log(`wrote sample-report-default.pdf (${bytes.byteLength} bytes, ${doc.getNumberOfPages()} pages)`);