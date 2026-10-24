import { useState, type FormEvent } from "react";
import { NEWSLETTER, SITE } from "../site";

type Status = "idle" | "sending" | "done" | "error";

/**
 * Newsletter sign-up.
 *
 * The list is a revenue channel, so the form has to work on the day the site
 * goes live. It posts to /api/subscribe, which stores the lead in Cloudflare
 * KV and optionally mirrors it to a webhook. If the endpoint is not
 * configured yet, the form says so and offers the address to use instead —
 * it never claims a signup was saved when it was not.
 */
export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, company, source: "landing" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };

      if (response.ok) {
        setStatus("done");
        setMessage(NEWSLETTER.confirm);
        setEmail("");
        return;
      }

      setStatus("error");
      if (data.code === "not_configured") {
        setMessage(
          `Sign-ups are being switched on — email ${SITE.supportEmail} and I'll add you by hand.`,
        );
      } else {
        setMessage(data.error ?? "That did not go through. Try again in a moment.");
      }
    } catch {
      setStatus("error");
      setMessage(`Could not reach the server — email ${SITE.supportEmail} instead.`);
    }
  }

  if (status === "done") {
    return (
      <div className="subscribe">
        <h2>{NEWSLETTER.title}</h2>
        <p className="sub done">{message}</p>
      </div>
    );
  }

  return (
    <div className="subscribe">
      <h2>{NEWSLETTER.title}</h2>
      <p className="sub">{NEWSLETTER.blurb}</p>

      <form onSubmit={submit} className="subscribe-form">
        <input
          type="email"
          name="email"
          placeholder="you@studio.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
        />
        {/* Honeypot: hidden from people, irresistible to bots. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hp"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <button className="btn primary" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send it"}
        </button>
      </form>

      {status === "error" && <p className="sub err">{message}</p>}
      <p className="fine">One email every other Tuesday. Unsubscribe in one click.</p>
    </div>
  );
}
