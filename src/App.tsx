import { useEffect, useMemo, useState } from "react";
import type { Brand, PlanId } from "./types";
import { DEFAULT_BRAND, loadBrand, preloadDefaultLogo, saveBrand } from "./brand";
import { PLANS } from "./plans";
import Landing from "./components/Landing";
import AuditView from "./components/AuditView";
import BrandPanel from "./components/BrandPanel";
import Mark from "./components/Mark";

type Tab = "landing" | "audit" | "brand";

export default function App() {
  const [tab, setTab] = useState<Tab>("landing");
  // Demo-only tier switcher. In production this comes from the auth session;
  // here it lets both builds be inspected side by side without an account.
  const [plan, setPlan] = useState<PlanId>("pro");
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);

  useEffect(() => setBrand(loadBrand()), []);
  useEffect(() => saveBrand(brand), [brand]);
  // Warm the SiteTrace mark so the first PDF export already has the real logo.
  useEffect(() => {
    void preloadDefaultLogo();
  }, []);

  const active = PLANS[plan];

  const mark = useMemo(
    () => <Mark logo={brand.logo} dataUrl={brand.logoDataUrl} accent={brand.accent} />,
    [brand.logo, brand.logoDataUrl, brand.accent],
  );

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("landing")} aria-label="SiteTrace home">
          {mark}
          <span className="brand-text">
            <strong>{brand.name}</strong>
            <small>SEO audit &amp; client reports</small>
          </span>
        </button>

        <nav className="nav">
          <button className={tab === "landing" ? "on" : ""} onClick={() => setTab("landing")}>
            Pricing
          </button>
          <button className={tab === "audit" ? "on" : ""} onClick={() => setTab("audit")}>
            Run an audit
          </button>
          <button className={tab === "brand" ? "on" : ""} onClick={() => setTab("brand")}>
            Your brand
          </button>
        </nav>

        <div className="tier-switch" title="Demo control — shows what each plan unlocks">
          <span className="tier-label">Viewing as</span>
          {(["pro", "agency"] as const).map((p) => (
            <button
              key={p}
              className={plan === p ? "on" : ""}
              onClick={() => setPlan(p)}
              data-plan={p}
            >
              {PLANS[p].name}
            </button>
          ))}
        </div>
      </header>

      {tab === "landing" && <Landing onStart={() => setTab("audit")} activePlan={plan} />}
      {tab === "audit" && <AuditView plan={active} brand={brand} onOpenBrand={() => setTab("brand")} />}
      {tab === "brand" && <BrandPanel brand={brand} onChange={setBrand} onDone={() => setTab("audit")} />}

      <footer className="foot">
        <span>
          {brand.logo === "custom"
            ? "Reports export under your brand — no SiteTrace attribution."
            : "Running on the default SiteTrace brand."}
        </span>
        <span>Audit runs in your browser · PDF generated locally · no server cost per report</span>
      </footer>
    </div>
  );
}