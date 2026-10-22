import { DEFAULT_MARK_SRC } from "../brand";

interface MarkProps {
  logo: "default" | "custom";
  dataUrl?: string;
  accent: string;
}

/**
 * The brand mark for compact slots — brand panel preview, favicon-ish spots.
 * The app header uses <BrandLockup> instead, because there is room for the
 * full lockup there.
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

interface LockupProps {
  logo: "default" | "custom";
  dataUrl?: string;
  name: string;
}

/**
 * The header brand slot.
 *
 * On the default brand this is the real SiteTrace lockup (mark + wordmark +
 * domain) so the site carries the actual logo rather than a rounded square
 * with invented text next to it.
 *
 * Once a customer sets their own brand, a square uploaded mark plus their
 * name reads better than a wide lockup, and it is their mark that should be
 * on screen.
 */
export function BrandLockup({ logo, dataUrl, name }: LockupProps) {
  if (logo === "custom" && dataUrl) {
    return (
      <>
        <img className="lockup-img lockup-img-custom" src={dataUrl} alt="" />
        <span className="brand-text">
          <strong>{name}</strong>
          <small>SEO audit &amp; client reports</small>
        </span>
      </>
    );
  }
  return <img className="lockup-img" src="/brand/sitetrace-lockup-header.png" alt="SiteTrace" />;
}