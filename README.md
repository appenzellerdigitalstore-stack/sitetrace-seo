# PageLens

On-page SEO audit with a white-label PDF report. The audit runs in the browser;
the PDF is generated locally, so exporting a report costs nothing in server
requests.

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

No free tier. Every audit is one real outbound fetch; a free tier subsidised by
paying users is how a micro-SaaS quietly dies.

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

## Production fetch proxy

`worker/fetch-proxy.ts` is a deliberately dumb relay: one fetch, no parsing, no
caching, no auth. It blocks private/internal hosts so it cannot be used to reach
a private network.

```bash
npx wrangler deploy worker/fetch-proxy.ts --name pagelens-fetch
# route: /api/fetch
```

## Branding

The default brand is PageLens. A user can replace it with their own name, logo,
website and accent colour under **Your brand**. The PDF is drawn entirely from
that state, so an exported report carries the customer's brand with no PageLens
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

```bash
python scripts/make-icon.py
```

Regenerates `public/brand/pagelens-icon.png` from the same geometry as the SVG
mark and the mark drawn into the PDF, so the brand is identical everywhere.

## Audit rules

Deterministic, not model-generated. Same page in, same report out — otherwise
it is an opinion and cannot be shown to a client as evidence.

The homepage short-title rule from the classic "title is 8 characters"
false positive is handled properly: a brand-only title on a homepage is
reported as `info`, not `warn`, because it is correct, not broken.