// Minimal Resend email sender (mirrors web/lib/email/resend.ts). RESEND_API_KEY is a secret - never log it.
// Without a verified domain, Resend only lets onboarding@resend.dev send to the account owner's own
// address, which is fine for demos. Without a key at all, routes log messages as "simulated".

import type { EmailStatus, Shop } from "../../shared/types";
import type { Bindings } from "./env";

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";
const SEND_TIMEOUT_MS = 20_000;
const MAX_ERROR_CHARS = 200;

/**
 * The sender shown to clients. RESEND_FROM wins when it already has a display name ("Shop <addr>");
 * a bare address (or no value) gets "<shop> via Magick TLS <addr>".
 */
export function emailFrom(env: Bindings, shopName: string): string {
  const configured = (env.RESEND_FROM ?? "").trim();
  if (configured.includes("<")) return configured;
  return `${displayName(`${shopName} via Magick TLS`)} <${configured || DEFAULT_FROM_ADDRESS}>`;
}

/** Part of GET /shop: whether the API can really send (key set) and the sender it would use. */
export function emailStatus(env: Bindings, shopName: string): EmailStatus {
  return { configured: Boolean(env.RESEND_API_KEY), from: emailFrom(env, shopName) };
}

/** Make a shop name safe inside a From header: drop characters that would break it, quote if it needs quoting. */
function displayName(name: string): string {
  const clean = name.replace(/["<>\r\n]/g, "").trim();
  return /[()[\]:;@\\,.]/.test(clean) ? `"${clean}"` : clean;
}

// ---------- Footer (shop details under every email) ----------

/** The shop fields the footer is built from (a `Shop` works as is). */
export type EmailFooterShop = Pick<Shop, "name" | "address" | "phone" | "openingHours" | "replyToEmail">;

/**
 * Footer appended (after a blank line) to every email sent from the app; pure, so it can be tested:
 *   — <shop name>
 *   <address>                               only when set
 *   <phone> · <opening hours>               whichever are set
 *   Reply to this email to reach the shop.  only when replyToEmail is set (it becomes the Reply-To)
 */
export function buildEmailFooter(shop: EmailFooterShop): string {
  const lines = [`— ${shop.name}`];
  if (shop.address) lines.push(shop.address);
  const contact = [shop.phone, shop.openingHours].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  if (shop.replyToEmail) lines.push("Reply to this email to reach the shop.");
  return lines.join("\n");
}

// ---------- HTML rendering ----------

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const FOOTER_STYLE = "margin-top:24px;color:#6b7280;font-size:13px";

/** Plain text -> a single <p> with escaped text and line breaks as <br>. */
export function textToHtml(text: string, style?: string): string {
  const escaped = text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
  return `<p${style ? ` style="${style}"` : ""}>${escaped.replace(/\r?\n/g, "<br>")}</p>`;
}

export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  /** Plain text; sent as both `text` and an HTML rendering of it. */
  text: string;
  /** Appended after a blank line (text) / as a muted paragraph (HTML). See buildEmailFooter. */
  footer?: string;
  /** Resend `reply_to`; set so client replies reach the shop rather than the sender address. */
  replyTo?: string | null;
}

/**
 * POST https://api.resend.com/emails. Resolves with Resend's email id; throws an Error whose message is
 * safe to store/show (Resend's response text, at most 200 chars) on a non-2xx, timeout or network failure.
 */
export async function sendEmail(env: Bindings, input: SendEmailInput): Promise<{ id: string }> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email sending is not configured (RESEND_API_KEY is not set).");

  const footer = input.footer?.trim() || null;
  const text = footer ? `${input.text}\n\n${footer}` : input.text;
  const html = footer ? `${textToHtml(input.text)}${textToHtml(footer, FOOTER_STYLE)}` : textToHtml(input.text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text,
        html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`Email provider timed out after ${SEND_TIMEOUT_MS / 1000}s.`);
    throw new Error(`Could not reach the email provider: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_CHARS);
    throw new Error(`Resend error (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const json = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return { id: typeof json?.id === "string" ? json.id : "" };
}
