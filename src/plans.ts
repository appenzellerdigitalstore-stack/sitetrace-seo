import type { PlanId } from "./types";

/**
 * Plan definitions.
 *
 * Design rule: Agency must not be "the same thing with a bigger number".
 * Anything that only scales with volume is a quota, not a tier. The features
 * that justify the jump are the ones a person (or an LLM) genuinely cannot do:
 * keeping history, and watching a site while nobody is asking.
 */

export interface PlanFeature {
  key: string;
  label: string;
  pro: string | boolean;
  agency: string | boolean;
  /** Why Agency needs this. Shown on the pricing table. */
  agencyWhy?: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  blurb: string;
  dailyAudits: number;
  bulkUrls: number;
  seats: number;
  features: PlanFeature[];
}

const f = (key: string, label: string, pro: string | boolean, agency: string | boolean, agencyWhy?: string): PlanFeature => ({
  key,
  label,
  pro,
  agency,
  agencyWhy,
});

export const PLANS: Record<PlanId, Plan> = {
  pro: {
    id: "pro",
    name: "Pro",
    price: 19,
    blurb: "For freelancers who want a client-ready report out the door.",
    dailyAudits: 50,
    bulkUrls: 10,
    seats: 1,
    features: [
      f("audits", "Audits per day", "50", "250"),
      f("bulk", "Bulk URLs per run", "10", "100"),
      f("sitemap", "Full sitemap crawl", false, true, "Paste a sitemap and audit every URL in one pass."),
      f("pdf", "White-label PDF", "Your logo & colours", "Your logo & colours"),
      f("export", "CSV / JSON export", true, true),
      f("history", "Client history & score diffs", false, true, "See what changed since last month and when it changed."),
      f("monitor", "Scheduled monitoring & alerts", false, true, "A weekly re-crawl that emails you when a page regresses."),
      f("api", "API keys + JSON API", false, true, "Run audits from your own tooling and pipeline."),
      f("widget", "Lead-capture widget", false, true, "Embed a free audit on your own site to collect leads."),
      f("seats", "Team seats", "1", "5"),
    ],
  },
  agency: {
    id: "agency",
    name: "Agency",
    price: 49,
    blurb: "For teams who manage many client sites and get paid to keep them healthy.",
    dailyAudits: 250,
    bulkUrls: 100,
    seats: 5,
    features: [],
  },
};

// Agency inherits everything in Pro.
PLANS.agency.features = PLANS.pro.features;

export const FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  PLANS.pro.features.map((x) => [x.key, x.label]),
);

export type Capability = keyof PlanCapabilities;

export interface PlanCapabilities {
  sitemap: boolean;
  history: boolean;
  monitor: boolean;
  api: boolean;
  widget: boolean;
}

export function capabilitiesFor(plan: PlanId): PlanCapabilities {
  const agency = plan === "agency";
  return {
    sitemap: agency,
    history: agency,
    monitor: agency,
    api: agency,
    widget: agency,
  };
}

export function can(plan: PlanId, key: string): boolean {
  const feature = PLANS.pro.features.find((x) => x.key === key);
  if (!feature) return true;
  const value = plan === "agency" ? feature.agency : feature.pro;
  return value !== false;
}