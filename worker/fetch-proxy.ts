/**
 * CORS fetch proxy for the on-page audit.
 *
 * The audit runs in the browser, but browsers refuse cross-origin fetches to
 * arbitrary sites. This Worker relays exactly one request and returns the HTML.
 * It is deliberately dumb — no parsing, no caching, no auth — because the
 * parsing and report generation both happen client-side.
 *
 * Cost model: one audit = one Worker invocation. That is the only metered
 * operation in the product, which is why plans are metered in audits rather
 * than in page views.
 *
 * Deploy:  npx wrangler deploy worker/fetch-proxy.ts --name pagelens-fetch
 * Route:   /api/fetch
 */

export interface Env {
  ALLOWED_ORIGIN?: string;
}

const ALLOW: string[] = [
  "Mozilla/5.0 (compatible; PageLens/0.1; +https://pagelens.pages.dev)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
];

const PRIVATE_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
];

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowOrigin = env.ALLOWED_ORIGIN ?? origin ?? "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": allowOrigin,
          "access-control-allow-methods": "GET,OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    const target = new URL(request.url).searchParams.get("url");
    if (!target) return json({ error: "missing url" }, 400, { "access-control-allow-origin": allowOrigin });

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return json({ error: "invalid url" }, 400, { "access-control-allow-origin": allowOrigin });
    }

    if (!/^https?:$/.test(parsed.protocol)) {
      return json({ error: "only http(s) urls are supported" }, 400, { "access-control-allow-origin": allowOrigin });
    }

    const host = parsed.hostname.toLowerCase();
    if (PRIVATE_HOSTS.includes(host) || host.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      // Block direct IP literals and internal hosts so the Worker cannot be
      // used to reach a private network through the proxy.
      return json({ error: "host not allowed" }, 400, { "access-control-allow-origin": allowOrigin });
    }

    try {
      const upstream = await fetch(parsed.href, {
        redirect: "follow",
        headers: {
          "User-Agent": ALLOW[1],
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        // Cloudflare Workers have no browser fetch timeout knob; rely on the
      });

      const contentType = upstream.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml/i.test(contentType)) {
        return json(
          { error: `that url is not an html page (${contentType.split(";")[0] || "unknown type"})` },
          415,
          { "access-control-allow-origin": allowOrigin },
        );
      }

      const html = await upstream.text();

      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "access-control-allow-origin": allowOrigin,
          "x-pagelens-final-url": upstream.url,
          "cache-control": "public, max-age=300",
        },
      });
    } catch (err) {
      return json(
        { error: `could not fetch that host: ${String(err)}` },
        502,
        { "access-control-allow-origin": allowOrigin },
      );
    }
  },
};