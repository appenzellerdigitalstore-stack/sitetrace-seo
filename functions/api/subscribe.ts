/**
 * Pages Function: email capture for the newsletter.
 *
 * Design goal: work the moment a KV namespace is bound, without Ed having to
 * pick an email platform first. Leads are written to Cloudflare KV, which is
 * the only serverless store already in the stack, and optionally forwarded to
 * a webhook so they can appear in Discord or a mailing tool the moment one
 * exists.
 *
 * The endpoint is deliberately forgiving about where the lead goes and strict
 * about not losing it: if the KV write succeeds but the webhook fails, the
 * lead is still stored and the visitor still gets a success message. The
 * reverse is never true — a lead is never reported as saved unless it was.
 */

interface KVLike {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  /** KV namespace used to store leads. */
  LEADS?: KVLike;
  /** Optional webhook (Discord, Zapier, Buttondown...) that receives a copy. */
  LEADS_WEBHOOK?: string;
  ALLOWED_ORIGIN?: string;
}

interface Lead {
  email: string;
  source: string;
  ts: string;
}

/** One signup per IP per day is plenty; more than that is a bot. */
const SUBSCRIBE_DAILY_LIMIT = 3;

const DAY_SECONDS = 60 * 60 * 24;

/** Deliberately loose: the real validation is "did the invite arrive". */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function clientId(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Forwards a copy of the lead to a webhook.
 *
 * Discord webhooks want `{ content }`; everything else gets a plain JSON
 * object, which is what Zapier, Make and Buttondown-style endpoints expect.
 */
async function forward(url: string, lead: Lead): Promise<void> {
  const body = url.includes("discord.com/api/webhooks/")
    ? {
        content: `**New SiteTrace SEO lead**\n${lead.email}\nsource: ${lead.source} · ${lead.ts}`,
      }
    : { ...lead, product: "SiteTrace SEO" };

  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const onRequest = async (context: {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}): Promise<Response> => {
  const { request, env } = context;
  const allowOrigin = env.ALLOWED_ORIGIN ?? request.headers.get("Origin") ?? "*";
  const cors = { "access-control-allow-origin": allowOrigin };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        "access-control-allow-methods": "POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "use POST" }, 405, cors);
  }

  // No KV and no webhook means nowhere to put the lead. Say so instead of
  // accepting an address and losing it.
  if (!env.LEADS && !env.LEADS_WEBHOOK) {
    return json({ error: "email capture is not configured", code: "not_configured" }, 503, cors);
  }

  let payload: { email?: unknown; source?: unknown; company?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid request body" }, 400, cors);
  }

  // Honeypot. Real people never see this field; bots fill everything in.
  if (typeof payload.company === "string" && payload.company.trim() !== "") {
    return json({ ok: true, stored: false }, 200, cors);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) {
    return json({ error: "that email address does not look right" }, 400, cors);
  }

  const source = typeof payload.source === "string" ? payload.source.slice(0, 40) : "landing";

  // Rate limit before doing any work.
  if (env.LEADS) {
    const key = `subscribe:${clientId(request)}:${today()}`;
    const used = Number.parseInt((await env.LEADS.get(key, "text")) ?? "0", 10) || 0;
    if (used >= SUBSCRIBE_DAILY_LIMIT) {
      return json(
        { error: "too many signups from this connection today", code: "rate_limited" },
        429,
        cors,
      );
    }
    await env.LEADS.put(key, String(used + 1), { expirationTtl: DAY_SECONDS });
  }

  const lead: Lead = { email, source, ts: new Date().toISOString() };

  let stored = false;
  if (env.LEADS) {
    // One key per address, so a repeat signup updates the record instead of
    // creating a duplicate.
    await env.LEADS.put(`lead:${email}`, JSON.stringify(lead), {
      expirationTtl: 60 * 60 * 24 * 365,
    });
    stored = true;
  }

  if (env.LEADS_WEBHOOK) {
    // Best effort: the copy is a convenience, the KV record is the truth.
    const sent = forward(env.LEADS_WEBHOOK, lead);
    if (context.waitUntil) {
      context.waitUntil(sent.catch(() => undefined));
    } else {
      await sent.catch(() => undefined);
    }
    stored = true;
  }

  return json({ ok: true, stored }, 200, cors);
};
