import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Response header carrying the URL the target site actually resolved to
 * (after its own redirects). Must stay identical in the dev plugin below and
 * in worker/fetch-proxy.ts, which is the production implementation.
 */
export const FINAL_URL_HEADER = "x-sitetrace-final-url";

/**
 * Dev/preview stand-in for the Cloudflare Worker that ships to production.
 *
 * The audit has to fetch an arbitrary third-party URL, which browsers block on
 * CORS. In production that is `worker/fetch-proxy.ts` bound to /api/fetch.
 * Locally this middleware does the same job so `npm run dev` and
 * `npm run preview` behave exactly like the deployed site.
 *
 * The audit itself still runs in the browser — this only relays one request.
 */
function fetchProxy(): Plugin {
  return {
    name: "sitetrace-seo-fetch-proxy",
    configureServer(server) {
      server.middlewares.use("/api/fetch", async (req, res) => {
        const target = new URL(req.url ?? "", "http://localhost").searchParams.get("url");
        if (!target) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "missing url" }));
          return;
        }
        try {
          const upstream = await fetch(target, {
            redirect: "follow",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; SiteTrace-SEO/0.1; +https://sitetrace.it.com)",
              Accept: "text/html,application/xhtml+xml",
            },
          });
          const html = await upstream.text();
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader(FINAL_URL_HEADER, upstream.url);
          res.end(html);
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fetchProxy()],
  build: { outDir: "dist", sourcemap: true },
});