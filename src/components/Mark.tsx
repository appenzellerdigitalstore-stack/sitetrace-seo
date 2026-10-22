interface MarkProps {
  logo: "default" | "custom";
  dataUrl?: string;
  accent: string;
}

/** The brand mark shown in-app. Mirrors the vector mark drawn into the PDF. */
export default function Mark({ logo, dataUrl, accent }: MarkProps) {
  if (logo === "custom" && dataUrl) {
    return <img className="mark-img" src={dataUrl} alt="" />;
  }
  return (
    <span className="mark" style={{ background: accent }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
        <path d="M6 7h9" />
        <path d="M6 10.5h6" />
        <circle cx="12" cy="15.5" r="3.6" />
        <path d="M14.7 18.2L18 21.5" />
      </svg>
    </span>
  );
}