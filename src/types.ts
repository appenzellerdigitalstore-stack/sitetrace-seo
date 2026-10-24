export type CheckStatus = "pass" | "warn" | "fail" | "info";

export type CheckGroup =
  | "Search basics"
  | "Headings"
  | "Social & sharing"
  | "Structured data"
  | "Content & links";

export interface Check {
  id: string;
  group: CheckGroup;
  label: string;
  status: CheckStatus;
  /** What was actually found, in plain language. */
  detail: string;
  /** Why it matters. Only rendered when the check did not pass. */
  why?: string;
  /** Copy-pasteable remediation snippet. Only for checks that can be fixed in markup. */
  fix?: string;
  /** Shown when the finding may be wrong because the page renders client-side. */
  caveat?: string;
}

export interface AuditResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  title: string;
  description: string;
  ogImage: string;
  checks: Check[];
  score: number;
  counts: Record<CheckStatus, number>;
  /**
   * "server" = the HTML we fetched contains the page's real tags.
   * "client" = the page renders in the browser, so server HTML may be empty
   *   and any "missing" finding could be a false negative.
   */
  rendered: "server" | "client" | "unknown";
}

export type PlanId = "pro" | "agency";

export interface Brand {
  /** "default" = use the built-in SiteTrace mark; "custom" = use the uploaded one. */
  logo: "default" | "custom";
  /** data URL of the uploaded logo. */
  logoDataUrl?: string;
  /** Business name printed in the report header. */
  name: string;
  /** Website printed under the name. */
  site: string;
  /** Accent colour used for rules, badges and headings in the PDF. */
  accent: string;
  /** Optional footer line. */
  tagline: string;
}