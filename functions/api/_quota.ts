/**
 * The free-tier allowance, shared by the production relay and the dev
 * middleware.
 *
 * Both the deployed Pages Function (`functions/api/fetch.ts`) and the local
 * dev server (`vite.config.ts`) import this, so the limit and the wording a
 * visitor sees cannot drift between the two. A dev server that behaved
 * differently from production is a dev server that lies.
 *
 * The file name starts with an underscore, which is how the Pages Functions
 * router is told that this is a module and not a route.
 */

/**
 * Daily allowance for an unpaid visitor, per client IP.
 *
 * One audit is one invocation, so this is the only thing standing between a
 * crawler (or a bored person) and the account's daily request budget.
 *
 * One a day is enough to judge the product and cheap enough to give away: at
 * one request per audit, even ten thousand free visitors a day would only
 * touch a tenth of the budget. Paid plans replace this once licences exist.
 */
export const FREE_DAILY_AUDITS = 1;

/** KV keys expire after this many seconds, so counters self-reset. */
export const DAY_SECONDS = 60 * 60 * 24;

/** The minimum a store has to do to hold a counter. */
export interface QuotaStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface QuotaState {
  /** False when there is no store configured, so the limit is not applied. */
  allowed: boolean;
  used: number;
  remaining: number;
  enforced: boolean;
}

/** The message a visitor sees when the free allowance is spent. */
export function quotaMessage(limit: number = FREE_DAILY_AUDITS): string {
  return `free limit reached (${limit} free audit${limit === 1 ? "" : "s"} per day — resets at midnight UTC)`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function quotaKey(clientId: string, day: string): string {
  return `quota:${clientId}:${day}`;
}

/**
 * Reads the current count without spending anything.
 *
 * The request is not counted yet: a URL that turns out to be broken should
 * not cost the visitor an audit.
 */
export async function peekQuota(
  store: QuotaStore | null,
  key: string,
  limit: number = FREE_DAILY_AUDITS,
): Promise<QuotaState> {
  if (!store) {
    // No binding configured yet — do not block traffic, but say so in the
    // headers so it is visible in the response.
    return { allowed: true, used: 0, remaining: -1, enforced: false };
  }

  const raw = await store.get(key);
  const used = Number.parseInt(raw ?? "0", 10) || 0;

  return {
    allowed: used < limit,
    used,
    remaining: limit - used,
    enforced: true,
  };
}

/**
 * Counts the request against the quota.
 *
 * Called only after a successful fetch: a typo'd URL, a host that times out
 * or a file that turns out not to be HTML should not cost the visitor an
 * audit.
 */
export async function consumeQuota(
  store: QuotaStore | null,
  key: string,
  current: number,
  limit: number = FREE_DAILY_AUDITS,
): Promise<QuotaState> {
  if (!store) return { allowed: true, used: 0, remaining: -1, enforced: false };

  const used = current + 1;
  await store.put(key, String(used));
  return { allowed: true, used, remaining: Math.max(0, limit - used), enforced: true };
}

/** Response headers that make the allowance visible to the client. */
export function quotaHeaders(state: QuotaState, limit: number = FREE_DAILY_AUDITS): Record<string, string> {
  return {
    "x-quota-limit": String(limit),
    "x-quota-used": String(state.used),
    // -1 means the limit is not actually enforced (no KV binding yet).
    "x-quota-remaining": String(state.remaining),
    "x-quota-enforced": String(state.enforced),
  };
}
