import { useEffect, useState } from "react";
import type { Brand, PlanId } from "./types";
import { DEFAULT_BRAND, loadBrand, preloadDefaultLogo, saveBrand } from "./brand";
import { PLANS } from "./plans";
import Landing from "./components/Landing";
import AuditView from "./components/AuditView";
import BrandPanel from "./components/BrandPanel";
import { BrandLockup } from "./components/Mark";

type Tab = "landing" | "audit" | "brand";

const TABS: Tab[] = ["landing", "audit", "brand"];

/** Tab lives in the URL hash so a refresh or a shared link keeps your place. */
function tabFromHash(): Tab {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return (TABS as string[]).includes(raw) ? (raw as Tab) : "landing";
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
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

  // Mirror tab state into the hash, and follow back/forward.
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (next: Tab) => {
    setTab(next);
    if (window.location.hash.replace(/^#\/?/, "") !== next) {
      window.location.hash = `/${next === "landing" ? "" : next}`;
    }
  };

  const active = PLANS[plan];

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go("landing")} aria-label="SiteTrace home">
          <BrandLockup logo={brand.logo} dataUrl={brand.logoDataUrl} name={brand.name} />
        </button>

        <nav className="nav">
          <button className={tab === "landing" ? "on" : ""} onClick={() => go("landing")}>
            Pricing
          </button>
          <button className={tab === "audit" ? "on" : ""} onClick={() => go("audit")}>
            Run an audit
          </button>
          <button className={tab === "brand" ? "on" : ""} onClick={() => go("brand")}>
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

      {tab === "landing" && <Landing onStart={() => go("audit")} activePlan={plan} />}
      {tab === "audit" && <AuditView plan={active} brand={brand} onOpenBrand={() => go("brand")} />}
      {tab === "brand" && <BrandPanel brand={brand} onChange={setBrand} onDone={() => go("audit")} />}

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