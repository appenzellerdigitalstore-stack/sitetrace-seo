# Deploying SiteTrace SEO

Everything below is a dashboard action. The repository builds itself; there is
no `wrangler login`, no second worker to deploy and no route to wire.

---

## 1. Connect the repository to Cloudflare Pages

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.

| Setting | Value |
| --- | --- |
| Repository | `appenzellerdigitalstore-stack/sitetrace-seo` |
| Production branch | `main` |
| Framework preset | **None** |
| Build command | `npm run build` |
| Build output directory | `dist` |

The framework preset matters. Picking "Vite" makes Cloudflare inject its own
config, and the Pages Functions in `functions/` need the plain setup.

The first build takes a few minutes (it installs dependencies from scratch).

---

## 2. Environment variables

**Settings → Environment variables** → add to **Production** (and **Preview**
if you want to test staging).

| Variable | Required | Value |
| --- | --- | --- |
| `NODE_VERSION` | yes | `20` |
| `VITE_CF_ANALYTICS_TOKEN` | no | from **Web Analytics → Setup** in the CF dashboard |
| `ALLOWED_ORIGIN` | no | `https://seo.sitetrace.it.com` |
| `LEADS_WEBHOOK` | no | a Discord webhook URL, to get leads instantly |

`VITE_CF_ANALYTICS_TOKEN` is only injected into the page when it is set. With
no token, no beacon is loaded at all — the site does not phone home to
Cloudflare for nothing.

`ALLOWED_ORIGIN` pins which origin may call the relay. Without it the relay
echoes the caller's own origin, which works but is looser than it needs to be.

---

## 3. KV namespace and bindings

Cloudflare dashboard → **Workers & Pages** → **KV** → **Create** → name it
`sitetrace-seo`.

Then, back in the Pages project: **Settings → Bindings** → add the same
namespace **twice**, under two different variable names:

| Binding name | What it holds |
| --- | --- |
| `QUOTA` | per-IP daily audit counters |
| `LEADS` | newsletter sign-ups |

**Without the `QUOTA` binding the relay is uncapped** and will happily spend
the account's daily request budget on a single crawler. It still works — the
response headers say `x-quota-enforced: false` — but it is not safe to leave
that way.

**Without the `LEADS` binding the signup form reports that sign-ups are not
switched on yet** and offers the support address instead. It never pretends a
signup was saved.

One namespace can serve both bindings; the keys are prefixed differently
(`quota:` and `lead:`).

### Reading the leads

Each sign-up is one KV key called `lead:<email>` containing JSON. Open the
namespace in the dashboard and filter by the `lead:` prefix. Setting
`LEADS_WEBHOOK` to a Discord webhook URL also mirrors every lead into a
Discord channel as it arrives.

---

## 4. Custom domain

**Pages project → Custom domains → Set up a custom domain** →
`seo.sitetrace.it.com`.

`seo.sitetrace.it.com` must already have a DNS record for Cloudflare, or
Cloudflare will create it for you. Certificate provisioning takes a minute or
two.

---

## 5. Verify it is live

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://seo.sitetrace.it.com/
curl.exe -s -o NUL -w "%{http_code}" https://seo.sitetrace.it.com/privacy/
curl.exe -s -o NUL -w "%{http_code}" https://seo.sitetrace.it.com/terms/
curl.exe -s -o NUL -w "%{http_code}" https://seo.sitetrace.it.com/refund-policy/
```

All four should return `200`. Then open the site, run an audit against any
public URL, and download the branded PDF.

---

## 6. Lemon Squeezy application

The store review needs the legal pages live and a real support address, so
steps 1–4 have to be done first.

**Product**

| Field | Value |
| --- | --- |
| Name | SiteTrace SEO |
| Description | On-page SEO audit with client-ready white-label PDF reports. The audit runs in the browser; the branded report is generated locally. |
| Price | $19 / month (Pro) and $49 / month (Agency) |

**URLs**

| Page | URL |
| --- | --- |
| Website | `https://seo.sitetrace.it.com/` |
| Privacy Policy | `https://seo.sitetrace.it.com/privacy/` |
| Terms of Service | `https://seo.sitetrace.it.com/terms/` |
| Refund Policy | `https://seo.sitetrace.it.com/refund-policy/` |
| Support email | `support@sitetrace.it.com` |

Lemon Squeezy is the merchant of record: they handle the payment, the tax and
the refund, and they take a percentage. The legal pages already say this.

**Before submitting**

- [ ] `support@sitetrace.it.com` actually exists as a mailbox (or is forwarded somewhere you read)
- [ ] `privacy@sitetrace.it.com` and `legal@sitetrace.it.com` exist, or the addresses are changed
- [ ] All four URLs above return 200 from a logged-out browser
- [ ] The prices on the landing page match the prices entered here

Reviews take a few days. Nothing else is blocked while waiting.

---

## 7. After the store is approved

The paywall is deliberately not built yet — a licence-key system built before
Lemon Squeezy approves is a system built against an assumption. Once the
store is live, the remaining work is:

1. Licence-key auth: the key from the Lemon Squeezy webhook unlocks the tier.
2. Paywall: Agency features (history, scheduling, API keys, lead widget) stay
   locked until a key is active.
3. Per-plan KV quotas: Pro 50 audits/day, Agency 250/day, replacing the free
   per-IP cap.

---

## Local development

```powershell
npm install
npm run dev          # http://localhost:5173
```

The dev server stands in for the Pages Functions, so `/api/fetch` and
`/api/subscribe` both work locally. Sign-ups are written to `.dev/leads.json`
instead of KV.

| Command | What it does |
| --- | --- |
| `npm run build` | typecheck and build to `dist/` |
| `node scripts/check-mobile.mjs http://localhost:5199/ 390 844` | reports any element that overflows a phone viewport |
| `python scripts/make_og_card.py` | regenerates the social share card |
| `node scripts/extract_logo.py <source>` | rebuilds the brand assets from the original lockup |
