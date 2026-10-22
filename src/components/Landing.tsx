import { useState } from "react";
import { PLANS, can } from "../plans";
import type { PlanId } from "../types";
import Mark from "./Mark";

const fmt = (v: string | boolean) =>
  v === true ? "✓" : v === false ? "—" : v;

export default function Landing({ onStart, activePlan }: { onStart: () => void; activePlan: PlanId }) {
  const [annual, setAnnual] = useState(false);
  const pro = PLANS.pro;
  const price = (p: number) => (annual ? Math.round(p * 0.8) : p);

  return (
    <main className="wrap">
      <section className="hero">
        <h1>
          Find the SEO problems on a page.
          <br />
          <span className="grad">Send your client a report with your name on it.</span>
        </h1>
        <p className="lede">
          A deterministic on-page audit that runs in the browser, plus a white-label PDF built for the
          freelancer or agency handing the work over. No ads, no watermarks, no PageLens signature on
          anything you export.
        </p>
        <div className="cta-row">
          <button className="btn primary" onClick={onStart}>
            Audit a page
          </button>
          <a className="btn ghost" href="#pricing">
            See plans
          </a>
        </div>
        <p className="fine">
          No free tier. One audit is one fetch — a paid plan is what makes it repeatable.
        </p>
      </section>

      <section className="pillars">
        <article>
          <h3>Deterministic</h3>
          <p>Rules, not opinions. The same page always produces the same report, so it stands up as evidence.</p>
        </article>
        <article>
          <h3>Yours, branded</h3>
          <p>Upload a logo, set a name and an accent colour. Every PDF carries your brand and nothing else.</p>
        </article>
        <article>
          <h3>Runs client-side</h3>
          <p>The page is analysed in your browser and the PDF is built locally. Reports cost you nothing.</p>
        </article>
      </section>

      <section id="pricing" className="pricing">
        <div className="pricing-head">
          <h2>Two plans, split by capability — not by page count</h2>
          <label className="annual">
            <input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} />
            Two months free on annual billing
          </label>
        </div>

        <div className="cards">
          {[pro, PLANS.agency].map((plan) => {
            const featured = plan.id === "agency";
            return (
              <div key={plan.id} className={`card${featured ? " featured" : ""}${activePlan === plan.id ? " viewing" : ""}`}>
                <div className="card-head">
                  <h3>{plan.name}</h3>
                  <div className="price">
                    <span className="amount">${price(plan.price)}</span>
                    <span className="per">/mo</span>
                  </div>
                  <p className="blurb">{plan.blurb}</p>
                </div>

                <ul className="feats">
                  {plan.features.map((f) => (
                    <li key={f.key} className={f[plan.id] === false ? "off" : ""}>
                      <span className="tick">{fmt(f[plan.id])}</span>
                      <span className="fname">{f.label}</span>
                      {typeof f[plan.id] === "string" && <span className="fval">{f[plan.id]}</span>}
                    </li>
                  ))}
                </ul>

                {featured && (
                  <p className="why">
                    Agency exists for the things a person cannot do: it keeps score history, it re-checks
                    on a schedule, and it plugs into your own pipeline. More calls alone would not be worth
                    $49.
                  </p>
                )}

                <button className={`btn ${featured ? "primary" : "ghost"}`} onClick={onStart}>
                  Start with {plan.name}
                </button>
              </div>
            );
          })}
        </div>

        <div className="matrix-note">
          Currently viewing: <strong>{PLANS[activePlan].name}</strong>.{" "}
          {!can(activePlan, "history") && (
            <>
              History, scheduling, API and the lead widget are Agency-only — switch the toggle in the
              header to see them unlock.
            </>
          )}
        </div>
      </section>

      <section className="faq">
        <h2>Questions worth answering before you pay</h2>
        <dl>
          <dt>Why is there no free tier?</dt>
          <dd>
            Every audit is a real outbound fetch. A free tier subsidised by paying users is how
            micro-SaaS quietly dies. One run to see if you like it, then pay to keep running it.
          </dd>
          <dt>Can an AI assistant just do this instead?</dt>
          <dd>
            For a one-off opinion, yes — and probably better. What you are paying for is the part an
            assistant cannot do: a branded artifact you can send a client, a score you can diff against
            last month, and a check that runs whether or not anyone asks.
          </dd>
          <dt>Does the report show PageLens anywhere?</dt>
          <dd>
            No. Upload a logo and set your name and accent colour; the PDF is generated locally with only
            your branding.
          </dd>
        </dl>
      </section>

      <div className="spacer">
        <Mark logo="default" accent="#3b82f6" />
      </div>
    </main>
  );
}