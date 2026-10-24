/**
 * Facts about the product that more than one place needs.
 *
 * The contact addresses live here because the signup fallback, the footer and
 * the legal pages all depend on them. Changing one is a single-line edit
 * instead of a search across the repo.
 *
 * The legal pages deliberately print the addresses as "support [at] ..." to
 * keep scrapers out; the real forms are here.
 */
export const SITE = {
  product: "SiteTrace SEO",
  domain: "seo.sitetrace.it.com",
  supportEmail: "support@sitetrace.it.com",
  privacyEmail: "privacy@sitetrace.it.com",
  legalEmail: "legal@sitetrace.it.com",
} as const;

/**
 * Newsletter copy. Kept next to the form so the promise made on the landing
 * page and the one sent by email cannot drift apart.
 */
export const NEWSLETTER = {
  title: "The Tuesday Teardown",
  blurb:
    "One page, audited properly, every other Tuesday. What broke, what it costs, and the markup to fix it. No spam, no upsells.",
  confirm: "You're on the list. The first teardown lands Tuesday.",
} as const;
