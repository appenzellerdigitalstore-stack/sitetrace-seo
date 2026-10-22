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
}

export type PlanId = "pro" | "agency";

export interface Brand {
  /** "pagelens" = use the built-in default mark; "custom" = use the uploaded one. */
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