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
 * List copy.
 *
 * Kept next to the form so the promise made on the landing page and the one
 * kept by email cannot drift apart.
 *
 * The wording deliberately promises no schedule: "the occasional teardown" is
 * something Ed can keep with one email a month or with none. If the list is
 * not worth running, delete the <SubscribeForm /> line in Landing.tsx —
 * nothing else in the app depends on it.
 */
export const NEWSLETTER = {
  title: "Join the list",
  blurb:
    "Product updates, and the occasional teardown — one real page audited properly: what broke and how to fix it. No spam, unsubscribe in one click.",
  confirm: "You're on the list. Thanks.",
} as const;
