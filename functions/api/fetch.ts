/**
 * Pages Function: CORS fetch relay for the on-page audit.
 *
 * The audit runs in the browser, but browsers refuse cross-origin fetches to
 * arbitrary sites. This relays exactly one request and returns the HTML.
 * It is deliberately dumb — no parsing, no caching, no auth — because the
 * parsing and the report generation both happen client-side.
 *
 * Cost model: one audit = one invocation. That is the only metered operation
 * in the product, which is why plans are metered in audits rather than in
 * page views.
 *
 * Living here rather than in a separate Worker means it deploys with the
 * Pages project, so there is no second wrangler login and no route to wire.
 * `vite.config.ts` implements the same relay for local development.
 *
 * The response header name must match that plugin.
 */

const FINAL_URL_HEADER = "x-sitetrace-final-url";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Hosts the relay must never reach. Without this the function could be used to
// probe a private network from the edge.
const BLOCKED = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata",
];

interface Env {
  ALLOWED_ORIGIN?: string;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    BLOCKED.includes(h) ||
    h.endsWith(".internal") ||
    h.endsWith(".localhost") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h) // bare IPv4 literal
  );
}

export const onRequest = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;
  const allowOrigin = env.ALLOWED_ORIGIN ?? request.headers.get("Origin") ?? "*";
  const cors = { "access-control-allow-origin": allowOrigin };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  }

  const target = new URL(request.url).searchParams.get("url");
  if (!target) return json({ error: "missing url" }, 400, cors);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return json({ error: "invalid url" }, 400, cors);
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return json({ error: "only http(s) urls are supported" }, 400, cors);
  }

  if (isBlockedHost(parsed.hostname)) {
    return json({ error: "host not allowed" }, 400, cors);
  }

  try {
    const upstream = await fetch(parsed.href, {
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      return json(
        { error: `that url is not an html page (${contentType.split(";")[0] || "unknown type"})` },
        415,
        cors,
      );
    }

    return new Response(await upstream.text(), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        [FINAL_URL_HEADER]: upstream.url,
        // Short cache: repeated audits of the same URL are cheap to serve,
        // but a crawl-bait pattern should not pin results for long.
        "cache-control": "public, max-age=300",
        ...cors,
      },
    });
  } catch (err) {
    return json({ error: `could not fetch that host: ${String(err)}` }, 502, cors);
  }
};