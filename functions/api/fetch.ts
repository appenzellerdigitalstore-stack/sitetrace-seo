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
  /** Cloudflare KV namespace used for per-IP daily quotas. Optional. */
  QUOTA?: {
    get(key: string, type: "text"): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  };
}

/**
 * Daily allowance per client IP, applied when the QUOTA namespace is bound.
 *
 * One audit is one invocation, so this is the only thing standing between a
 * crawler (or a bored person) and the account's daily request budget. The
 * number is deliberately generous for a normal visitor and stingy enough to
 * stop abuse; plan limits replace it once licences exist.
 */
const FREE_DAILY_AUDITS = 5;

/**
 * Largest HTML document the relay will buffer. A page bigger than this is
 * almost certainly not a marketing site, and buffering it would spend the
 * worker's memory on a single request.
 */
const MAX_BYTES = 5 * 1024 * 1024;

/** KV keys expire after this many seconds, so counters self-reset. */
const DAY_SECONDS = 60 * 60 * 24;

function clientId(request: Request): string {
  // CF-Connecting-IP is set by Cloudflare and cannot be spoofed by the
  // client, unlike X-Forwarded-For.
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface QuotaState {
  allowed: boolean;
  used: number;
  remaining: number;
  /** False when no KV binding exists, so the limit is not actually applied. */
  enforced: boolean;
}

async function peekQuota(env: Env, request: Request): Promise<QuotaState> {
  if (!env.QUOTA) {
    // No binding configured yet — do not block traffic, but say so in the
    // headers so it is visible in the response.
    return { allowed: true, used: 0, remaining: -1, enforced: false };
  }

  const raw = await env.QUOTA.get(quotaKey(request), "text");
  const used = Number.parseInt(raw ?? "0", 10) || 0;

  return {
    allowed: used < FREE_DAILY_AUDITS,
    used,
    remaining: FREE_DAILY_AUDITS - used,
    enforced: true,
  };
}

/**
 * Counts the request against the quota.
 *
 * Called only after a successful fetch: a typo'd URL, a host that times out or
 * a file that turns out not to be HTML should not cost the visitor an audit.
 */
async function consumeQuota(env: Env, request: Request, current: number): Promise<QuotaState> {
  if (!env.QUOTA) return { allowed: true, used: 0, remaining: -1, enforced: false };

  const used = current + 1;
  await env.QUOTA.put(quotaKey(request), String(used), { expirationTtl: DAY_SECONDS });
  return { allowed: true, used, remaining: Math.max(0, FREE_DAILY_AUDITS - used), enforced: true };
}

function quotaKey(request: Request): string {
  return `quota:${clientId(request)}:${today()}`;
}

/**
 * Reads a response body but stops at `limit` bytes.
 *
 * content-length is only a hint and is often missing on chunked responses, so
 * the body is read incrementally and cut off when it grows too large.
 */
async function readCapped(response: Response, limit: number): Promise<{ text: string; truncated: boolean }> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) {
    return { text: "", truncated: true };
  }

  const reader = response.body?.getReader();
  if (!reader) return { text: await response.text(), truncated: false };

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return { text: "", truncated: true };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder("utf-8").decode(merged), truncated: false };
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

  // Check the quota first: a rejected request should not cost an upstream fetch.
  const quota = await peekQuota(env, request);

  const quotaHeaders = (state: QuotaState) => ({
    ...cors,
    "x-quota-limit": String(FREE_DAILY_AUDITS),
    "x-quota-used": String(state.used),
    // -1 means the limit is not actually enforced (no KV binding yet).
    "x-quota-remaining": String(state.remaining),
    "x-quota-enforced": String(state.enforced),
  });

  if (!quota.allowed) {
    return json(
      {
        error: `daily limit reached (${FREE_DAILY_AUDITS} audits per day on the free tier)`,
        code: "quota_exceeded",
        limit: FREE_DAILY_AUDITS,
      },
      429,
      quotaHeaders(quota),
    );
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
        quotaHeaders(quota),
      );
    }

    const body = await readCapped(upstream, MAX_BYTES);
    if (body.truncated) {
      return json(
        { error: `that page is too large to audit (limit ${MAX_BYTES / 1024 / 1024} MB)` },
        413,
        quotaHeaders(quota),
      );
    }

    // Only a fetch that produced a usable page counts against the quota.
    const state = await consumeQuota(env, request, quota.used);

    return new Response(body.text, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        [FINAL_URL_HEADER]: upstream.url,
        // Short cache: repeated audits of the same URL are cheap to serve,
        // but a crawl-bait pattern should not pin results for long.
        "cache-control": "public, max-age=300",
        ...quotaHeaders(state),
      },
    });
  } catch (err) {
    return json({ error: `could not fetch that host: ${String(err)}` }, 502, quotaHeaders(quota));
  }
};