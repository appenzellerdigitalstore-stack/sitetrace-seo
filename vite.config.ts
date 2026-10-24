import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import {
  consumeQuota,
  peekQuota,
  quotaHeaders,
  quotaKey,
  quotaMessage,
  today,
  type QuotaStore,
} from "./functions/api/_quota";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * Response header carrying the URL the target site actually resolved to
 * (after its own redirects). Must stay identical in the dev plugin below and
 * in worker/fetch-proxy.ts, which is the production implementation.
 */
export const FINAL_URL_HEADER = "x-sitetrace-final-url";

/**
 * Dev stand-in for the Cloudflare Worker that ships to production.
 *
 * The audit has to fetch an arbitrary third-party URL, which browsers block on
 * CORS. In production that is the Pages Function in functions/api/fetch.ts.
 * Locally this middleware does the same job so `npm run dev` and
 * `npm run preview` behave exactly like the deployed site.
 *
 * It uses the same shared quota module, so the free allowance a visitor sees
 * locally is the same one they will see in production. Set DEV_QUOTA=1 to
 * exercise the "you have used today's free audit" path without waiting for
 * midnight.
 *
 * The audit itself still runs in the browser — this only relays one request.
 */
function fetchProxy(): Plugin {
  // The free allowance in dev. Generous by default so local work is not
  // interrupted; DEV_QUOTA=1 mirrors production exactly.
  const limit = Number(process.env.DEV_QUOTA ?? "20");

  // A counter that lives as long as the dev server, standing in for KV.
  const counters = new Map<string, string>();
  const store: QuotaStore = {
    get: async (key) => counters.get(key) ?? null,
    put: async (key, value) => {
      counters.set(key, value);
    },
  };

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

        const key = quotaKey(req.socket.remoteAddress ?? "dev", today());
        const quota = await peekQuota(store, key, limit);

        if (!quota.allowed) {
          res.statusCode = 429;
          res.setHeader("content-type", "application/json");
          for (const [name, value] of Object.entries(quotaHeaders(quota, limit))) {
            res.setHeader(name, value);
          }
          res.end(JSON.stringify({ error: quotaMessage(limit), code: "quota_exceeded", limit }));
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
          const state = await consumeQuota(store, key, quota.used, limit);
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader(FINAL_URL_HEADER, upstream.url);
          for (const [name, value] of Object.entries(quotaHeaders(state, limit))) {
            res.setHeader(name, value);
          }
          res.end(html);
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

/**
 * Dev stand-in for the /api/subscribe Pages Function.
 *
 * There is no KV binding in local development, so leads are appended to
 * .dev/leads.json instead. That keeps the signup path testable without a
 * Cloudflare account and without pretending something was stored remotely.
 */
function devSubscribe(): Plugin {
  return {
    name: "sitetrace-seo-dev-subscribe",
    configureServer(server) {
      server.middlewares.use("/api/subscribe", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "use POST" }));
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);

        let body: { email?: string; source?: string; company?: string } = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "invalid body" }));
          return;
        }

        // Mirror the production endpoint exactly, otherwise a dev test passes
        // while the deployed function would have rejected the same payload.
        if (typeof body.company === "string" && body.company.trim() !== "") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true, stored: false }));
          return;
        }

        const email = String(body.email ?? "").trim().toLowerCase();
        if (email.length === 0 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "that email address does not look right" }));
          return;
        }

        const dir = join(projectRoot, ".dev");
        const file = join(dir, "leads.json");
        mkdirSync(dir, { recursive: true });

        let leads: unknown[] = [];
        if (existsSync(file)) {
          try {
            leads = JSON.parse(readFileSync(file, "utf8"));
          } catch {
            leads = [];
          }
        }
        // One record per address, matching the production KV key scheme.
        const kept = leads.filter((row) => (row as { email?: string }).email !== email);
        kept.push({ email, source: body.source ?? "landing", ts: new Date().toISOString() });
        writeFileSync(file, JSON.stringify(kept, null, 2), "utf8");

        console.log(`[dev] lead captured: ${email}`);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, stored: true }));
      });
    },
  };
}

/**
 * Serves the test fixtures from test/fixtures during development.
 *
 * The client-render detection needs a page that is deliberately an empty
 * shell. Keeping that file in test/ rather than public/ means it can never
 * be deployed, while this route keeps it testable locally at
 * /__fixtures/spa-fixture.html.
 */
function devFixtures(): Plugin {
  return {
    name: "sitetrace-seo-dev-fixtures",
    configureServer(server) {
      server.middlewares.use("/__fixtures", (req, res) => {
        const name = (req.url ?? "").split("?")[0].replace(/^\/+/, "");
        if (!/^[\w.-]+\.html$/.test(name)) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }

        const file = join(projectRoot, "test", "fixtures", name);
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }

        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(readFileSync(file, "utf8"));
      });
    },
  };
}

/**
 * Injects the Cloudflare Web Analytics beacon, but only when a token is
 * configured. Leaving the tag out entirely is better than shipping a beacon
 * with an empty token — it would fire requests to Cloudflare for nothing.
 *
 * Set VITE_CF_ANALYTICS_TOKEN in the Pages build environment.
 */
function cloudflareAnalytics(): Plugin {
  return {
    name: "pagelens-cf-analytics",
    transformIndexHtml(html) {
      const token = process.env.VITE_CF_ANALYTICS_TOKEN;
      if (!token) return html;
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              defer: true,
              src: "https://static.cloudflareinsights.com/beacon.min.js",
              "data-cf-beacon": JSON.stringify({ token }),
            },
            injectTo: "head",
          },
        ],
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), fetchProxy(), devSubscribe(), devFixtures(), cloudflareAnalytics()],
  build: { outDir: "dist", sourcemap: true },
});