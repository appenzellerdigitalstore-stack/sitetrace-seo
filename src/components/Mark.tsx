import { DEFAULT_MARK_SRC } from "../brand";

interface MarkProps {
  logo: "default" | "custom";
  dataUrl?: string;
  accent: string;
}

/**
 * The brand mark shown in-app.
 *
 * The default is the real SiteTrace mark as an image, so the UI, the favicon
 * and the PDF report header all show the identical artwork. The old inline SVG
 * was a stand-in and did not match the logo.
 */
export default function Mark({ logo, dataUrl, accent }: MarkProps) {
  if (logo === "custom" && dataUrl) {
    return <img className="mark-img" src={dataUrl} alt="" />;
  }
  return (
    <span className="mark mark-default" style={{ background: accent }} aria-hidden="true">
      <img src={DEFAULT_MARK_SRC} alt="" />
    </span>
  );
}