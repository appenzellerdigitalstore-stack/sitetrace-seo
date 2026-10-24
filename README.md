# SiteTrace SEO

On-page SEO audit with a white-label PDF report. The audit runs in the browser;
the PDF is generated locally, so exporting a report costs nothing in server
requests.

**Live site:** `seo.sitetrace.it.com`
**Dashboard setup and the Lemon Squeezy application checklist:** [DEPLOY.md](DEPLOY.md)

## Why this exists as a paid tool

The audit itself is free everywhere, including from an AI assistant. What is
not free is the part a person cannot do:

- a **branded artifact** you can hand a client under your own name
- **history** — the score you had last month, and what changed
- **scheduling** — a re-crawl that runs whether or not anyone asks

Those three are the product. The checks are the lead magnet.

## Plans

Capability, not volume. Anything that merely scales with page count is a quota,
not a tier.

| | Pro $19 | Agency $49 |
|---|---|---|
| Audits/day | 50 | 250 |
| Bulk URLs | 10 | 100 + sitemap crawl |
| White-label PDF | yes | yes |
| Client history & diffs | — | yes |
| Scheduled monitoring | — | yes |
| API keys + JSON API | — | yes |
| Lead-capture widget | — | yes |
| Seats | 1 | 5 |

One free audit a day, no signup. Every audit is one real outbound fetch from
our server, so the free allowance is one a day rather than unlimited — a paid
plan raises it to 50 (Pro) or 250 (Agency) a day.

## Request cost

One audit = **one Worker invocation** (the CORS fetch relay). Everything else —
parsing, scoring, the SERP/social previews and the PDF — happens client-side.
Reports in particular cost zero, which matters because they are what users
generate most often.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
```

The Vite plugin in `vite.config.ts` stands in for the production Worker at
`/api/fetch`, so dev and production behave identically.

```bash
npm run build      # static output in dist/ -> Cloudflare Pages
npm run preview
```

`npm run build` typechecks twice: `tsconfig.json` covers the app, and
`tsconfig.node.json` covers the Pages Functions, `vite.config.ts` and the
scripts. The Functions run at the edge and are not inside the app's tsconfig,
so without the second pass they would ship unverified — and a type error
there is a runtime error in production.

## Production fetch proxy

`functions/api/fetch.ts` is a Cloudflare **Pages Function**: a deliberately dumb
relay — one fetch, no parsing, no caching, no auth. It blocks private and
internal hosts so it cannot be used to reach a private network.

It ships with the Pages project, so there is no second wrangler login and no
route to wire. `vite.config.ts` implements the identical relay for local
development; the two must keep the same response header name
(`x-sitetrace-final-url`).

Two things protect the request budget:

- **A per-IP daily cap** (1 free audit a day until licences exist) counted in
  the `QUOTA` KV namespace. The response carries `x-quota-limit`,
  `x-quota-used`, `x-quota-remaining` and `x-quota-enforced`, so an uncapped
  relay is visible rather than silent.
- **A size cap** of 5 MB on the buffered document. A page larger than that is
  refused with a 413 instead of spending the worker's memory.

A request that fails — a typo, a timeout, a URL that is not HTML — does **not**
count against the quota. Only a fetch that produced a usable page does.

The limit and its wording live in `functions/api/_quota.ts`, which both the
deployed function and the dev middleware import. A dev server that behaved
differently from production is a dev server that lies. `DEV_QUOTA=1 npm run dev`
makes the local behaviour match production exactly.

`worker/fetch-proxy.ts` is the standalone Worker equivalent, kept only if you
ever want to host the relay on a separate route (different origin, different
billing, or shared across several sites):

```bash
npx wrangler deploy worker/fetch-proxy.ts --name sitetrace-seo-fetch
```

## Client-rendered pages

A JavaScript-rendered site sends the server an empty shell and fills in the
tags in the browser. Reporting "missing meta description" for such a page is a
false claim, so the audit detects the render mode up front and:

- downgrades the affected checks from `fail`/`warn` to `info`,
- attaches a caveat explaining why the finding may be wrong,
- shows the score as **n/a — client-rendered** in the UI *and* in the PDF,
- and still prints the "Page rendering" warning, because the page genuinely
  does need server-rendered tags.

A report is only worth something if it is true. This is the one place where
the product refuses to produce a number.

`test/fixtures/spa-fixture.html` is the fixture for it. It lives outside
`public/` so it can never ship, and the dev server serves it at
`/__fixtures/spa-fixture.html`.

## Email capture

The newsletter form posts to `functions/api/subscribe.ts`, which writes the
lead to the `LEADS` KV namespace (`lead:<email>`) and optionally mirrors it to
`LEADS_WEBHOOK` — a Discord webhook URL will drop each lead into a channel as
it arrives.

The form never claims a signup was saved when it was not: with no KV binding
it says sign-ups are not switched on yet and offers the support address
instead. A honeypot field and a per-IP daily cap keep bots out.

## Legal pages

`/privacy/`, `/terms/` and `/refund-policy/` are static documents in `public/`,
not hash-routed SPA routes — payment processors validate those URLs, so they
have to exist as real pages with their own addresses.

## Mobile layout

```bash
node scripts/check-mobile.mjs http://localhost:5199/ 390 844
```

Drives a real browser at a real phone viewport and reports any element that
overflows sideways, plus a screenshot. Horizontal overflow is the failure mode
that makes a page feel broken on a phone, and it is invisible in a desktop
browser.

## Deploying to Cloudflare Pages

| Setting | Value |
|---|---|
| Repository | `appenzellerdigitalstore-stack/sitetrace-seo` |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `20` (env var `NODE_VERSION`) |

Then add the custom domain `seo.sitetrace.it.com` under **Custom domains**.

Optional: set `ALLOWED_ORIGIN=https://seo.sitetrace.it.com` as an environment
variable to pin CORS to one origin. Left unset, the relay reflects the request
origin, which is convenient before the domain is live.

**[DEPLOY.md](DEPLOY.md) has the full step-by-step**, including the KV
bindings, the optional environment variables and the Lemon Squeezy application
checklist.

## Branding

The default brand is SiteTrace. A user can replace it with their own name, logo,
website and accent colour under **Your brand**. The PDF is drawn entirely from
that state, so an exported report carries the customer's brand with no SiteTrace
mark, name or colour anywhere on it.

Brand state lives in `localStorage` only — a logo is never uploaded.

## Reports

```bash
# renders two sample PDFs to inspect the layout without a browser
npx esbuild scripts/sample-report.ts --bundle --platform=node --format=esm \
  --outfile=sample-report.mjs && node sample-report.mjs
```

Produces `sample-report-default.pdf` and `sample-report-agency.pdf` — the same
report in two brands.

## Brand asset

Brand files are derived from the supplied SiteTrace lockup:

```bash
python scripts/extract_logo.py "<path-to-sitetrace-logo>"
python scripts/analyse-logo.py   # diagnostic: ink-column profile
```

Produces `public/brand/sitetrace-mark-white.png` (mark, white, transparent),
`sitetrace-mark-blue.png`, `sitetrace-lockup.png` (full lockup, transparent),
and `sitetrace-icon.png` / `sitetrace-icon-180.png` (mark on a navy tile, for
favicon and PWA).

The social share card is composed separately:

```bash
python scripts/make_og_card.py
```

The lockup on its own is white-on-transparent at a 4.5:1 ratio, which renders
as a nearly blank strip when the link is shared. `make_og_card.py` composes a
1200×630 card on the brand navy with the real lockup and one line of headline.
`og:image` points at it with an absolute URL, because most social crawlers
ignore a relative one.

The source is a JPEG on a flat navy plate, so the extraction has to solve two
problems: there is no alpha channel, and the lockup is far too wide to use as an
icon. `extract_logo.py` rebuilds alpha from the plate colour, then splits the
mark from the wordmark. Splitting needs care — letter spacing inside the
wordmark produces gaps too, so the split only considers gaps in the left 55% of
the image. Run `analyse-logo.py` if the split ever looks wrong; it prints the
ink-column profile.

## Audit rules

Deterministic, not model-generated. Same page in, same report out — otherwise
it is an opinion and cannot be shown to a client as evidence.

The homepage short-title rule from the classic "title is 8 characters"
false positive is handled properly: a brand-only title on a homepage is
reported as `info`, not `warn`, because it is correct, not broken.