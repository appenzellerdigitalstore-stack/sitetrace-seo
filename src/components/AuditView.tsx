import { useMemo, useState } from "react";
import type { AuditResult, Brand, PlanId } from "../types";
import type { Plan } from "../plans";
import { GROUP_ORDER, runAudit } from "../audit";
import { can } from "../plans";
import SerpPreview from "./SerpPreview";

const SAMPLES = [
  "https://sitetrace.it.com/",
  "https://agentstack.ink/",
  "https://en.wikipedia.org/wiki/Search_engine_optimization",
];

export default function AuditView({
  plan,
  brand,
  onOpenBrand,
}: {
  plan: Plan;
  brand: Brand;
  onOpenBrand: () => void;
}) {
  const [input, setInput] = useState(SAMPLES[0]);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True when the failure was the free allowance running out, not a bad URL. */
  const [limitHit, setLimitHit] = useState(false);
  /** Free audits left today, as reported by the relay. Null until one runs. */
  const [quota, setQuota] = useState<{ limit: number; remaining: number } | null>(null);

  const pid = plan.id as PlanId;

  async function run(url: string) {
    const target = url.trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    setLimitHit(false);
    setResult(null);
    try {
      const normalised = /^https?:\/\//i.test(target) ? target : `https://${target}`;
      const proxy = `/api/fetch?url=${encodeURIComponent(normalised)}`;
      const res = await fetch(proxy, { redirect: "follow" });

      const limit = Number(res.headers.get("x-quota-limit") ?? "0");
      const remaining = Number(res.headers.get("x-quota-remaining") ?? "-1");
      const enforced = res.headers.get("x-quota-enforced") === "true";

      if (res.status === 429) {
        // The free allowance is spent. Say so plainly, and say what to do.
        // The stale allowance note would only repeat this, so drop it.
        setLimitHit(true);
        setQuota(null);
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          body.error ??
            `That is today's free audit used. It resets at midnight UTC — a paid plan gives you ${plan.dailyAudits} a day.`,
        );
      }
      if (res.status === 502) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not reach that URL");
      }
      if (!res.ok) throw new Error(`Proxy returned ${res.status}`);

      const html = await res.text();
      const finalUrl = res.headers.get("x-sitetrace-final-url") ?? normalised;
      // Only a completed audit updates the allowance shown to the visitor.
      if (enforced) setQuota({ limit, remaining });
      setResult(runAudit(html, normalised, finalUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    if (!result) return [];
    return GROUP_ORDER.map((g) => ({ group: g, checks: result.checks.filter((c) => c.group === g) })).filter(
      (x) => x.checks.length > 0,
    );
  }, [result]);

  return (
    <main className="wrap audit">
      <section className="audit-head">
        <div>
          <h1>On-page SEO audit</h1>
          <p className="lede">
            Fetches one page, runs the checks in your browser, and gives you a report you can send.
            <span className={`pill plan-${pid}`}>{plan.name} · {plan.dailyAudits}/day</span>
          </p>
        </div>
      </section>

      <form
        className="urlbar"
        onSubmit={(e) => {
          e.preventDefault();
          void run(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://example.com/page"
          spellCheck={false}
        />
        <button className="btn primary" disabled={busy}>
          {busy ? "Checking…" : "Run audit"}
        </button>
      </form>

      <div className="samples">
        Try:
        {SAMPLES.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => setInput(s)}>
            {s.replace(/^https?:\/\//, "").split("/")[0]}
          </button>
        ))}
      </div>

      {quota && (
        <p className="quota-note">
          {quota.remaining > 0
            ? `Free audits left today: ${quota.remaining} of ${quota.limit}.`
            : "That was today's free audit — it resets at midnight UTC."}
        </p>
      )}

      {error && (
        <div className="error">
          <strong>{limitHit ? "That is today's free audit used." : "Could not audit that URL."}</strong>
          <p>{error}</p>
          <small>
            {limitHit
              ? `Free audits reset at midnight UTC. A paid plan gives you ${plan.dailyAudits} a day.`
              : "Most failures are the target blocking automated requests. A Cloudflare-protected site will refuse the fetch — that is a property of the site, not the audit."}
          </small>
        </div>
      )}

      {result && (
        <>
          <section className="result-head">
            <div className="score-ring" style={{ ["--accent" as string]: brand.accent }}>
              {result.rendered === "client" ? (
                <>
                  <span className="na">n/a</span>
                  <small>client-rendered</small>
                </>
              ) : (
                <>
                  <span>{result.score}</span>
                  <small>/100</small>
                </>
              )}
            </div>
            <div className="result-meta">
              <a href={result.finalUrl} target="_blank" rel="noreferrer noopener">
                {result.finalUrl}
              </a>
              <div className="tally">
                {(["fail", "warn", "info", "pass"] as const).map((s) => (
                  <span key={s} className={`tally-item ${s}`}>
                    <strong>{result.counts[s]}</strong> {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="result-actions">
              <button className="btn primary" onClick={() => void exportPdf(result, brand)}>
                Download branded PDF
              </button>
              <button className="btn ghost" onClick={onOpenBrand}>
                {brand.logo === "custom" ? "Edit your brand" : "Add your brand"}
              </button>
            </div>
          </section>

          {brand.logo !== "custom" && (
            <div className="hint">
              That PDF will say <strong>{brand.name}</strong>.{" "}
              <button className="link" onClick={onOpenBrand}>
                Put your own logo and name on it
              </button>{" "}
              — same PDF, your brand.
            </div>
          )}

          <SerpPreview result={result} />

          <div className="checks">
            {grouped.map(({ group, checks }) => (
              <section key={group} className="check-group">
                <h2>{group}</h2>
                {checks.map((c) => (
                  <article key={c.id} className={`check ${c.status}`}>
                    <header>
                      <span className="dot" />
                      <h3>{c.label}</h3>
                      <span className={`badge ${c.status}`}>{c.status}</span>
                    </header>
                    <p>{c.detail}</p>
                    {c.why && <p className="why">{c.why}</p>}
                    {c.caveat && <p className="caveat">{c.caveat}</p>}
                    {c.fix && (
                      <pre>
                        <code>{c.fix}</code>
                        <button
                          className="copy"
                          onClick={() => void navigator.clipboard.writeText(c.fix!)}
                          title="Copy to clipboard"
                        >
                          Copy
                        </button>
                      </pre>
                    )}
                  </article>
                ))}
              </section>
            ))}
          </div>

          <AgencyExtras plan={pid} />
        </>
      )}
    </main>
  );
}

/** jsPDF is ~500 kB, so it is fetched on demand rather than shipped on load. */
async function exportPdf(result: AuditResult, brand: Brand): Promise<void> {
  const { downloadReport } = await import("../pdf");
  downloadReport(result, brand);
}

function AgencyExtras({ plan }: { plan: PlanId }) {
  const items = [
    { key: "history", label: "Score history", desc: "Every run stored per URL so you can diff against last week." },
    { key: "monitor", label: "Weekly monitoring", desc: "Re-crawls on a schedule and emails you when a page regresses." },
    { key: "api", label: "API keys", desc: "POST /v1/audit from your own tooling and CI." },
    { key: "sitemap", label: "Sitemap crawl", desc: "Paste a sitemap.xml and audit every URL in one run." },
    { key: "widget", label: "Lead widget", desc: "Embed a free audit on your site to capture leads." },
  ];
  const locked = items.filter((i) => !can(plan, i.key));
  const open = items.filter((i) => can(plan, i.key));

  if (locked.length === 0) return null;

  return (
    <section className="gated">
      <h2>Also in your plan</h2>
      <div className="gated-grid">
        {open.map((i) => (
          <div key={i.key} className="gated-item open">
            <h3>{i.label}</h3>
            <p>{i.desc}</p>
          </div>
        ))}
        {locked.map((i) => (
          <div key={i.key} className="gated-item">
            <h3>
              {i.label} <span className="lock">Agency</span>
            </h3>
            <p>{i.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}