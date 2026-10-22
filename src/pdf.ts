import { jsPDF } from "jspdf";
import type { AuditResult, Brand, CheckStatus } from "./types";
import { GROUP_ORDER } from "./audit";
import { getDefaultLogo, isLight, shade } from "./brand";

/**
 * White-label report generator.
 *
 * Runs entirely in the browser. The PDF is assembled locally with jsPDF and
 * never touches the server, so exporting a report costs the customer nothing
 * and costs us zero Cloudflare requests — which matters, because reports are
 * the thing users generate most often.
 *
 * Every visual element is driven by `brand`, so a report exported by an
 * agency carries that agency's logo, name, accent colour and tagline, with no
 * trace of SiteTrace anywhere on it.
 */

const PAGE_W = 210;
const PAGE_H = 297;
const M = 18;
const CONTENT_W = PAGE_W - M * 2;

const STATUS_META: Record<
  CheckStatus,
  { label: string; plural: string; colour: (a: string) => string }
> = {
  pass: { label: "Pass", plural: "passes", colour: (a) => shade(a, -0.45) },
  warn: { label: "Warning", plural: "warnings", colour: (a) => shade(a, 0.05) },
  fail: { label: "Issue", plural: "issues", colour: () => "#dc2626" },
  info: { label: "Note", plural: "notes", colour: (a) => shade(a, 0.55) },
};

const STATUS_ORDER: CheckStatus[] = ["fail", "warn", "info", "pass"];

function drawBrandHeader(doc: jsPDF, brand: Brand, generatedAt: string): number {
  const y = M;
  const dark = !isLight(brand.accent);

  // Logo: the customer's uploaded bitmap, the preloaded SiteTrace mark, or a
  // drawn vector stand-in when neither is available.
  const logoSrc = brand.logo === "custom" && brand.logoDataUrl ? brand.logoDataUrl : getDefaultLogo();
  if (logoSrc) {
    try {
      // The supplied mark is a wide-ish glyph; keep the plate square and inset
      // the artwork so it never touches the header text.
      const isSquareDefault = brand.logo !== "custom";
      const h = isSquareDefault ? 17 : 26;
      const w = isSquareDefault ? 22 : 26;
      doc.addImage(logoSrc, "AUTO", M, y + (26 - h) / 2, w, h, undefined, "FAST");
    } catch {
      drawDefaultMark(doc, M, y - 1, brand);
    }
  } else {
    drawDefaultMark(doc, M, y - 1, brand);
  }

  const textX = M + (logoSrc ? 28 : 32);
  doc.setTextColor(dark ? "#ffffff" : "#0f172a");
  doc.setFont("helvetica", "bold").setFontSize(17);
  doc.text(brand.name, textX, y + 6);

  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.setTextColor(dark ? shade(brand.accent, 0.6) : "#64748b");
  doc.text(brand.site, textX, y + 12);
  if (brand.tagline) doc.text(brand.tagline, textX, y + 16.5);

  doc.setFontSize(8);
  doc.text(`Generated ${generatedAt}`, PAGE_W - M, y + 6, { align: "right" });

  const ruleY = y + 24;
  doc.setDrawColor(...hexToRgb(brand.accent));
  doc.setLineWidth(1.1);
  doc.line(M, ruleY, PAGE_W - M, ruleY);

  return ruleY + 8;
}

function drawDefaultMark(doc: jsPDF, x: number, y: number, brand: Brand): void {
  doc.setFillColor(brand.accent);
  doc.roundedRect(x, y, 26, 26, 6, 6, "F");
  // A stylised lens over a document: two bars and a ring.
  doc.setDrawColor("#ffffff");
  doc.setLineWidth(1.5);
  doc.line(x + 7, y + 8, x + 19, y + 8);
  doc.line(x + 7, y + 12.5, x + 16, y + 12.5);
  doc.circle(x + 13, y + 18, 4.4, "S");
  doc.line(x + 16.3, y + 21.3, x + 20, y + 25);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [59, 130, 246];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawScore(doc: jsPDF, x: number, y: number, score: number, accent: string): void {
  doc.setDrawColor(...hexToRgb(accent));
  doc.setLineWidth(3);
  doc.circle(x, y, 13, "S");
  // Arc proportional to score, drawn in four quarters.
  doc.setLineWidth(4.2);
  const turns = score / 100;
  let angle = -90;
  const steps = Math.max(1, Math.round(turns * 48));
  for (let i = 0; i < steps; i++) {
    const a1 = (angle * Math.PI) / 180;
    const a2 = ((angle + 360 / 48) * Math.PI) / 180;
    const r = 13;
    doc.line(
      x + r * Math.cos(a1),
      y + r * Math.sin(a1),
      x + r * Math.cos(a2),
      y + r * Math.sin(a2),
    );
    angle += 360 / 48;
  }
  doc.setTextColor(...hexToRgb(accent));
  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text(String(score), x, y + 3, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("/100", x, y + 9, { align: "center" });
}

export function buildReportPdf(result: AuditResult, brand: Brand): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generatedAt = new Date(result.fetchedAt).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ------------------------------------------------------------- page one
  let y = drawBrandHeader(doc, brand, generatedAt);

  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text("On-page SEO audit", M, y + 5);

  doc.setFont("helvetica", "normal").setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text(doc.splitTextToSize(result.finalUrl, CONTENT_W) as string[], M, y + 12);
  y += 20;

  drawScore(doc, M + 16, y + 14, result.score, brand.accent);

  const statX = M + 42;
  let sy = y + 4;
  for (const status of STATUS_ORDER) {
    const count = result.counts[status];
    doc.setFillColor(...hexToRgb(STATUS_META[status].colour(brand.accent)));
    doc.roundedRect(statX, sy - 2.6, 3.2, 3.2, 0.8, 0.8, "F");
    doc.setFont("helvetica", status === "fail" ? "bold" : "normal").setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const word = count === 1 ? STATUS_META[status].label.toLowerCase() : STATUS_META[status].plural;
    doc.text(`${count} ${word}`, statX + 5.5, sy);
    sy += 6.4;
  }

  y += 34;

  const headline = buildHeadline(result);
  doc.setFillColor(246, 248, 251);
  doc.roundedRect(M, y, CONTENT_W, 16, 3, 3, "F");
  doc.setFillColor(...hexToRgb(brand.accent));
  doc.rect(M, y, 2.2, 16, "F");
  doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(15, 23, 42);
  doc.text("Summary", M + 6, y + 6);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(71, 85, 105);
  doc.text(doc.splitTextToSize(headline, CONTENT_W - 12) as string[], M + 6, y + 11);
  y += 24;

  // Ordered by severity so the reader sees the real problems first.
  const attention = result.checks
    .filter((c) => c.status === "fail" || c.status === "warn")
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  if (attention.length > 0) {
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(15, 23, 42);
    doc.text("Needs attention", M, y);
    y += 7;

    for (const c of attention) {
      if (y > PAGE_H - 24) {
        doc.addPage();
        y = drawBrandHeader(doc, brand, generatedAt);
      }
      y = drawCheck(doc, c, brand, y, false);
    }
  }

  // ------------------------------------------------------------- page two+
  doc.addPage();
  y = drawBrandHeader(doc, brand, generatedAt);
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(15, 23, 42);
  doc.text("Full report", M, y);
  y += 8;

  for (const group of GROUP_ORDER) {
    const groupChecks = result.checks.filter((c) => c.group === group);
    if (groupChecks.length === 0) continue;

    if (y > PAGE_H - 30) {
      doc.addPage();
      y = drawBrandHeader(doc, brand, generatedAt);
    }

    doc.setFont("helvetica", "bold").setFontSize(9.5);
    doc.setTextColor(...hexToRgb(brand.accent));
    doc.text(group.toUpperCase(), M, y);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(M, y + 2, PAGE_W - M, y + 2);
    y += 7;

    for (const c of groupChecks) {
      if (y > PAGE_H - 26) {
        doc.addPage();
        y = drawBrandHeader(doc, brand, generatedAt);
      }
      y = drawCheck(doc, c, brand, y, c.status !== "fail" && c.status !== "warn");
    }
    y += 4;
  }

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${brand.name} · ${result.finalUrl}`, M, PAGE_H - 8);
    doc.text(`${i} / ${pages}`, PAGE_W - M, PAGE_H - 8, { align: "right" });
  }

  return doc;
}

function drawCheck(
  doc: jsPDF,
  c: AuditResult["checks"][number],
  brand: Brand,
  startY: number,
  compact: boolean,
): number {
  let y = startY;
  const colour = hexToRgb(STATUS_META[c.status].colour(brand.accent));

  doc.setFillColor(colour[0], colour[1], colour[2]);
  doc.circle(M + 2, y - 1.2, 1.7, "F");

  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(15, 23, 42);
  doc.text(c.label, M + 6.5, y);

  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 116, 139);
  doc.text(doc.splitTextToSize(c.detail, CONTENT_W - 30) as string[], M + 6.5, y + 4.2);
  y += 5 + Math.ceil(doc.splitTextToSize(c.detail, CONTENT_W - 30).length) * 3.4;

  if (!compact && c.why) {
    doc.setFontSize(7.8).setTextColor(120, 130, 145);
    const why = doc.splitTextToSize(c.why, CONTENT_W - 10) as string[];
    doc.text(why, M + 6.5, y);
    y += why.length * 3.3;
  }

  if (c.fix) {
    const lines = doc.splitTextToSize(c.fix.replace(/\t/g, "  "), CONTENT_W - 14) as string[];
    const boxH = lines.length * 3.2 + 5;
    if (y + boxH > PAGE_H - 20) {
      doc.addPage();
      y = drawBrandHeader(doc, brand, "continued");
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(15, 23, 42);
      doc.text(c.label, M + 6.5, y);
      y += 6;
    }
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(M + 5, y, CONTENT_W - 10, boxH, 2, 2, "FD");
    doc.setFont("courier", "normal").setFontSize(7).setTextColor(51, 65, 85);
    doc.text(lines, M + 8, y + 4.4);
    y += boxH + 3;
  }

  return y + 2.5;
}

function buildHeadline(result: AuditResult): string {
  const { pass, warn, fail, info } = result.counts;
  const total = pass + warn + fail + info;
  if (fail === 0 && warn === 0) {
    return `All ${total} checks passed. This page is technically sound for on-page SEO. Keep monitoring it so a future edit does not regress it.`;
  }
  const parts: string[] = [];
  if (fail > 0) parts.push(`${fail} issue${fail === 1 ? "" : "s"} need${fail === 1 ? "s" : ""} fixing`);
  if (warn > 0) parts.push(`${warn} warning${warn === 1 ? "" : "s"} worth reviewing`);
  if (info > 0) parts.push(`${info} note${info === 1 ? "" : "s"}`);
  const lead = `${parts.join(", ")} out of ${total} checks. `;
  const worst = result.checks.find((c) => c.status === "fail");
  return lead + (worst ? `Start with "${worst.label}" — ${worst.detail}` : "");
}

export function downloadReport(result: AuditResult, brand: Brand): void {
  const doc = buildReportPdf(result, brand);
  const host = result.finalUrl.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`seo-audit-${host || "page"}.pdf`);
}