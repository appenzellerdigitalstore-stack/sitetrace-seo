import { useRef, useState } from "react";
import type { Brand } from "../types";
import { DEFAULT_BRAND, fileToLogoDataUrl } from "../brand";
import Mark from "./Mark";

const SWATCHES = ["#3b82f6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#0f172a"];

export default function BrandPanel({
  brand,
  onChange,
  onDone,
}: {
  brand: Brand;
  onChange: (b: Brand) => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const set = (patch: Partial<Brand>) => onChange({ ...brand, ...patch });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErr(null);
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      set({ logo: "custom", logoDataUrl: dataUrl });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that image");
    }
  }

  return (
    <main className="wrap brandpanel">
      <h1>Your brand on every report</h1>
      <p className="lede">
        Whatever you set here is what gets printed on the PDF. It stays in this browser — nothing is
        uploaded, and the SiteTrace name is removed from the document entirely.
      </p>

      <div className="brand-grid">
        <section className="card settings">
          <h2>Logo</h2>
          <div className="logo-row">
            <Mark logo={brand.logo} dataUrl={brand.logoDataUrl} accent={brand.accent} />
            <div>
              <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                Upload logo
              </button>
              <button
                className="btn ghost"
                onClick={() => set({ logo: "default", logoDataUrl: undefined })}
                disabled={brand.logo === "default"}
              >
                Use default
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                hidden
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <small className="hint-inline">PNG, JPG, WebP or SVG. Resized to 320px automatically.</small>
              {err && <small className="err-inline">{err}</small>}
            </div>
          </div>

          <h2>Details</h2>
          <label>
            Business name
            <input value={brand.name} onChange={(e) => set({ name: e.target.value })} placeholder="Acme Web Design" />
          </label>
          <label>
            Website
            <input value={brand.site} onChange={(e) => set({ site: e.target.value })} placeholder="acmeweb.com" />
          </label>
          <label>
            Footer line
            <input value={brand.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="On-page SEO audit" />
          </label>

          <h2>Accent colour</h2>
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`swatch${brand.accent === c ? " on" : ""}`}
                style={{ background: c }}
                onClick={() => set({ accent: c })}
                aria-label={`Use ${c}`}
              />
            ))}
            <input type="color" value={brand.accent} onChange={(e) => set({ accent: e.target.value })} />
          </div>
        </section>

        <section className="card preview">
          <h2>Report header preview</h2>
          <div className="pdf-mock" style={{ ["--accent" as string]: brand.accent }}>
            <div className="pdf-head">
              <Mark logo={brand.logo} dataUrl={brand.logoDataUrl} accent={brand.accent} />
              <div>
                <strong>{brand.name || "Your name"}</strong>
                <small>{brand.site}</small>
                <small>{brand.tagline}</small>
              </div>
              <em>Generated today</em>
            </div>
            <div className="pdf-body">
              <h4>On-page SEO audit</h4>
              <p className="pdf-url">https://example.com/pricing</p>
              <div className="pdf-score">
                <span>78</span>
                <small>/100</small>
              </div>
              <div className="pdf-stats">
                <span>1 issue</span>
                <span>3 warnings</span>
                <span>9 notes</span>
                <span>11 passes</span>
              </div>
            </div>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => onChange({ ...DEFAULT_BRAND })}>
              Reset to SiteTrace
            </button>
            <button className="btn primary" onClick={onDone}>
              Run an audit with this brand
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}