import type { Brand } from "./types";

/**
 * Brand state. The default brand is SiteTrace; an Agency or Pro user replaces
 * it with their own name, logo and accent colour, and every exported PDF
 * carries that brand instead. Nothing here is uploaded anywhere — it lives in
 * this browser only, which is why a logo never costs the customer anything.
 */

export const DEFAULT_BRAND: Brand = {
  logo: "default",
  name: "SiteTrace",
  site: "sitetrace.it.com",
  accent: "#3884de",
  tagline: "On-page SEO audit",
};

/** The SiteTrace mark, used by the UI and the PDF report header. */
export const DEFAULT_MARK_SRC = "/brand/sitetrace-mark-white.png";

/**
 * The SiteTrace mark as a data URL.
 *
 * jsPDF needs the bitmap synchronously, so the app fetches it once at startup
 * and parks it here. This lives in brand.ts rather than pdf.ts on purpose:
 * pdf.ts is lazy-loaded (it is ~360 kB), so state kept there would not exist
 * until the user first exports a report.
 */
let defaultLogoDataUrl: string | undefined;

export function setDefaultLogo(dataUrl: string | undefined): void {
  defaultLogoDataUrl = dataUrl;
}

export function getDefaultLogo(): string | undefined {
  return defaultLogoDataUrl;
}

/** Fetches the default mark and caches it for the PDF report header. */
export async function preloadDefaultLogo(): Promise<void> {
  if (defaultLogoDataUrl) return;
  try {
    const blob = await fetch(DEFAULT_MARK_SRC).then((r) => r.blob());
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("logo read failed"));
      fr.readAsDataURL(blob);
    });
    setDefaultLogo(dataUrl);
  } catch {
    // Non-fatal: the report falls back to a drawn vector mark.
  }
}

const STORAGE_KEY = "sitetrace.seo.brand.v1";

export function loadBrand(): Brand {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BRAND };
    const parsed = JSON.parse(raw) as Partial<Brand>;
    return {
      logo: parsed.logo === "custom" ? "custom" : "default",
      logoDataUrl: parsed.logoDataUrl,
      name: parsed.name?.trim() || DEFAULT_BRAND.name,
      site: parsed.site ?? DEFAULT_BRAND.site,
      accent: /^#[0-9a-f]{6}$/i.test(parsed.accent ?? "") ? parsed.accent! : DEFAULT_BRAND.accent,
      tagline: parsed.tagline ?? DEFAULT_BRAND.tagline,
    };
  } catch {
    return { ...DEFAULT_BRAND };
  }
}

export function saveBrand(brand: Brand): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(brand));
  } catch {
    /* private mode / quota — the app still works for this session */
  }
}

/** Reads an uploaded logo and returns a downscaled data URL. */
export function fileToLogoDataUrl(file: File, maxWidth = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a readable image"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** Lightens or darkens a hex colour by `amount` in [-1, 1]. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const ch = [(num >> 16) & 255, (num >> 8) & 255, num & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount)))),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return true;
  const num = parseInt(m[1], 16);
  const [r, g, b] = [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}