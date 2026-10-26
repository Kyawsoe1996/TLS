// Deposit receipt: a one-page PDF built on the phone and handed to the share sheet.
//
// Free, with nothing new to pay for or set up: expo-print renders our HTML into a PDF on the device and
// expo-sharing opens the share sheet (LINE, WhatsApp, Mail, Files...). No server, no API call. Both are native
// modules, so they are loaded on demand: in a build that doesn't carry them yet (an older development build)
// `receiptAvailable()` is false and the order screen hides the button instead of crashing.
//
// The pure parts (buildReceipt, receiptHtml, receiptFileName) have node tests; keep them free of Expo imports.
import type { Client, Order, Shop } from "@shared/types";

import { formatDate, formatThb } from "./format";

/** The shop lines printed at the top of the receipt. */
export interface ReceiptShop {
  name: string;
  place: string; // "Thonglor, Bangkok"
  address: string | null;
  phone: string | null;
  email: string | null;
}

/** The payment just recorded, when the receipt is shared right after "Record payment". */
export interface ReceiptPayment {
  amount: number; // baht received this time
  at: string; // ISO
}

export interface ReceiptData {
  ref: string; // short receipt reference, from the order id
  issuedAt: string; // ISO
  shop: ReceiptShop;
  clientName: string;
  garment: string;
  fabric: string | null;
  orderDate: string; // ISO (order created)
  price: number;
  totalPaid: number;
  balance: number; // never below 0
  payment: ReceiptPayment | null;
}

/** "MT-3F9A2C": the last six characters of the order id, so the client and the shop can match receipts later. */
export function receiptRef(orderId: string): string {
  const tail = orderId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  return `MT-${tail || "000000"}`;
}

/**
 * The receipt's content from the order, its client and the shop. `null` when the order has no price yet: there
 * is nothing to owe against, so nothing to receipt.
 */
export function buildReceipt(
  order: Order,
  client: Client | undefined,
  shop: Shop | null,
  payment: ReceiptPayment | null,
  now: Date = new Date(),
): ReceiptData | null {
  if (order.price === null) return null;
  const totalPaid = order.deposit ?? 0;
  return {
    ref: receiptRef(order.id),
    issuedAt: now.toISOString(),
    shop: {
      name: shop?.name?.trim() || "Your tailor",
      place: shop ? [shop.district, shop.city].filter((s) => s && s.trim()).join(", ") : "",
      address: shop?.address?.trim() || null,
      phone: shop?.phone?.trim() || null,
      email: shop?.replyToEmail?.trim() || null,
    },
    clientName: client?.name?.trim() || "Client",
    garment: order.garment,
    fabric: order.fabric,
    orderDate: order.createdAt,
    price: order.price,
    totalPaid,
    balance: Math.max(0, order.price - totalPaid),
    payment,
  };
}

/** "Receipt-Sathorn-Bespoke-20261020.pdf" */
export function receiptFileName(data: ReceiptData): string {
  const slug = data.shop.name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const d = new Date(data.issuedAt);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `Receipt-${slug || "shop"}-${stamp}.pdf`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The receipt as a self-contained HTML page, sized for A5 (420 x 595 pt). System fonts only, so Thai shop and
 * client names render through the phone's own font fallback; no web fonts, no images, nothing fetched.
 */
export function receiptHtml(data: ReceiptData): string {
  const e = escapeHtml;
  const shopLines = [data.shop.place, data.shop.address, [data.shop.phone, data.shop.email].filter(Boolean).join(" · ")]
    .filter((line) => line && line.trim())
    .map((line) => `<div class="shop-line">${e(line as string)}</div>`)
    .join("");
  const settled = data.balance <= 0;
  const paymentRow = data.payment
    ? `<tr class="highlight"><td>Payment received<span class="sub">${e(formatDate(data.payment.at))}</span></td><td class="num">${e(formatThb(data.payment.amount))}</td></tr>`
    : "";
  const garment = data.fabric ? `${data.garment} · ${data.fabric}` : data.garment;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=420">
<style>
  @page { size: 420pt 595pt; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { width: 420pt; min-height: 595pt; font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, "Noto Sans Thai", "Thonburi", sans-serif; color: #14213a; font-size: 11pt; line-height: 1.4; }
  .page { padding: 28pt 32pt 24pt; }
  .band { background: #14213a; color: #f4efe6; margin: -28pt -32pt 20pt; padding: 22pt 32pt 18pt; }
  .shop-name { font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif; font-size: 22pt; font-weight: 700; line-height: 1.15; margin: 0 0 4pt; }
  .shop-line { font-size: 9.5pt; color: #f4efe6; opacity: 0.9; }
  .title-row { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 14pt; }
  .title { font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif; font-size: 20pt; font-weight: 700; margin: 0; }
  .meta { text-align: right; font-size: 9.5pt; color: #4a5263; }
  .meta b { color: #14213a; }
  .pair { display: flex; gap: 12pt; margin: 0 0 6pt; font-size: 10.5pt; }
  .pair .k { width: 92pt; color: #7a5414; font-weight: 700; letter-spacing: 1pt; text-transform: uppercase; font-size: 8.5pt; padding-top: 2pt; }
  table { width: 100%; border-collapse: collapse; margin: 16pt 0 0; }
  td { padding: 8pt 0; border-top: 1px solid #ded4c1; font-size: 11pt; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.highlight td { background: #fbf8f2; }
  tr.total td { border-top: 2px solid #14213a; border-bottom: 2px solid #14213a; font-weight: 700; font-size: 12.5pt; }
  tr.total td.num.due { color: #a93f32; }
  tr.total td.num.settled { color: #2f4a22; }
  .sub { display: block; font-size: 9pt; color: #4a5263; font-weight: 400; }
  .thanks { margin: 22pt 0 0; font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif; font-size: 15pt; font-weight: 700; }
  .note { margin: 4pt 0 0; font-size: 9.5pt; color: #4a5263; }
  .foot { margin: 26pt 0 0; padding-top: 8pt; border-top: 1px solid #ded4c1; font-size: 8.5pt; color: #4a5263; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="page">
  <div class="band">
    <h1 class="shop-name">${e(data.shop.name)}</h1>
    ${shopLines}
  </div>
  <div class="title-row">
    <h2 class="title">${data.payment ? "Payment receipt" : "Statement of payments"}</h2>
    <div class="meta">No. <b>${e(data.ref)}</b><br>${e(formatDate(data.issuedAt))}</div>
  </div>
  <div class="pair"><div class="k">Received from</div><div>${e(data.clientName)}</div></div>
  <div class="pair"><div class="k">For</div><div>${e(garment)}<span class="sub">Order of ${e(formatDate(data.orderDate))}</span></div></div>
  <table>
    ${paymentRow}
    <tr><td>Price</td><td class="num">${e(formatThb(data.price))}</td></tr>
    <tr><td>Paid to date</td><td class="num">${e(formatThb(data.totalPaid))}</td></tr>
    <tr class="total"><td>${settled ? "Paid in full" : "Balance due"}</td><td class="num ${settled ? "settled" : "due"}">${settled ? "฿0" : e(formatThb(data.balance))}</td></tr>
  </table>
  <p class="thanks">Thank you.</p>
  <p class="note">${settled ? "This garment is paid in full." : "The balance is due on collection."} Please keep this receipt.</p>
  <div class="foot"><span>${e(data.shop.name)}</span><span>Issued with Magick Tailor</span></div>
</div>
</body>
</html>`;
}

type PrintModule = typeof import("expo-print");
type SharingModule = typeof import("expo-sharing");
type FileSystemModule = typeof import("expo-file-system");

let modules: { print: PrintModule; sharing: SharingModule; fs: FileSystemModule | null } | null | undefined;

function getModules() {
  if (modules !== undefined) return modules;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports -- native modules; a static import throws in a build without them */
    const print = require("expo-print") as PrintModule;
    const sharing = require("expo-sharing") as SharingModule;
    let fs: FileSystemModule | null = null;
    try {
      fs = require("expo-file-system") as FileSystemModule;
    } catch {
      fs = null;
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
    modules = { print, sharing, fs };
  } catch {
    modules = null;
  }
  return modules;
}

/** True when this build can make and share a PDF (Expo Go and every build made after expo-print was added). */
export function receiptAvailable(): boolean {
  return getModules() !== null;
}

/**
 * Render the receipt to a PDF in the app's cache and open the share sheet with it. Resolves when the sheet closes;
 * the phone doesn't say whether the client actually got it. Throws when the build has no print module.
 */
export async function shareReceipt(data: ReceiptData): Promise<void> {
  const mods = getModules();
  if (!mods) throw new Error("This build can't make PDFs yet. Install the latest build and try again.");
  const { uri } = await mods.print.printToFileAsync({ html: receiptHtml(data), width: 420, height: 595, base64: false });
  // expo-print names the file after the time it was made (Android shows that name in the viewer and in LINE);
  // give it a name the client will recognise. Two ways, the current File API first, the legacy one as a fallback;
  // if both fail the file is shared under its original name and the reason is logged for the next test run.
  let shareUri = uri;
  const name = receiptFileName(data);
  if (mods.fs) {
    try {
      const target = new mods.fs.File(mods.fs.Paths.cache, name);
      if (target.exists) target.delete();
      new mods.fs.File(uri).move(target);
      if (target.exists) shareUri = target.uri;
    } catch (err) {
      console.warn("[receipt] rename with the File API failed", err);
    }
  }
  if (shareUri === uri) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- same module, legacy entry point
      const legacy = require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
      const to = `${legacy.cacheDirectory ?? ""}${name}`;
      if (legacy.cacheDirectory) {
        await legacy.deleteAsync(to, { idempotent: true });
        await legacy.moveAsync({ from: uri, to });
        shareUri = to;
      }
    } catch (err) {
      console.warn("[receipt] rename with the legacy API failed", err);
    }
  }
  if (!(await mods.sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  await mods.sharing.shareAsync(shareUri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Share receipt" });
}
