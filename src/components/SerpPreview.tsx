import type { AuditResult } from "../types";

/**
 * How the page will actually look when it is shared.
 *
 * This is one of the two preview panels — the SERP one below plus the same
 * result rendered as a WhatsApp/OG card. It is also the most screenshot-able
 * part of the product, which is why it is a differentiator rather than a
 * feature.
 */
export default function SerpPreview({ result }: { result: AuditResult }) {
  const host = (() => {
    try {
      return new URL(result.finalUrl).host.replace(/^www\./, "");
    } catch {
      return result.finalUrl;
    }
  })();

  const breadcrumb = (() => {
    try {
      const u = new URL(result.finalUrl);
      const segs = u.pathname.split("/").filter(Boolean);
      return [host, ...segs.slice(0, 2)].join(" › ");
    } catch {
      return host;
    }
  })();

  const ogImage = result.ogImage
    ? /^https?:\/\//i.test(result.ogImage)
      ? result.ogImage
      : new URL(result.ogImage, result.finalUrl).href
    : "";

  const twTitle = `${result.title || host} (${host})`;

  return (
    <section className="previews">
      <h2>How it will look</h2>

      <div className="preview-grid">
        <div className="preview-card">
          <div className="preview-label">
            <span>Google — desktop</span>
            <span className="muted">{result.title.length} char title</span>
          </div>
          <div className="serp">
            <div className="serp-url">
              <span className="favicon-dot" />
              {breadcrumb}
            </div>
            <h3 className="serp-title">{result.title || `${host} — untitled`}</h3>
            <p className="serp-desc">
              {result.description ||
                "No meta description found. Google will generate one from the page content, and it usually sells the click far worse than you would."}
            </p>
          </div>
        </div>

        <div className="preview-card">
          <div className="preview-label">
            <span>WhatsApp / Open Graph</span>
            <span className="muted">{ogImage ? "image found" : "no og:image"}</span>
          </div>
          <div className="og">
            {ogImage ? (
              <img src={ogImage} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            ) : (
              <div className="og-blank">og:image missing — link shows as bare URL</div>
            )}
            <div className="og-body">
              <div className="og-host">{host.toUpperCase()}</div>
              <div className="og-title">{result.title || host}</div>
              <div className="og-desc">{result.description || "No meta description — nothing to show here."}</div>
            </div>
          </div>
        </div>

        <div className="preview-card">
          <div className="preview-label">
            <span>X / Twitter card</span>
            <span className="muted">summary_large_image</span>
          </div>
          <div className="tweet">
            <div className="tweet-avatar" />
            <div className="tweet-body">
              <div className="tweet-name">
                {host} <span className="muted">· now</span>
              </div>
              <div className="tweet-text">{twTitle}</div>
              {ogImage && <img className="tweet-img" src={ogImage} alt="" />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}