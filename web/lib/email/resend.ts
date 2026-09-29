// Minimal Resend email sender. Server-side only — RESEND_API_KEY is a secret.
// Without a verified domain, Resend lets you send from onboarding@resend.dev
// to your own account email (fine for demos).

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const from = process.env.RESEND_FROM || "TLS <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}
