// Monthly report: a one-page A5 PDF built on the phone and handed to the share sheet (lib/pdf.ts renders and shares
// it; nothing leaves the phone until the owner shares it). Same approach as the receipt in lib/receipt.ts.
//
// Pure: node tests in lib/__tests__/reportHtml.test.ts, so keep it free of Expo imports.
import type { ReportResponse, Shop } from "@shared/types";

import { formatDate, formatThb } from "./format";
import { monthLabel, monthName, shortMonthLabel } from "./months";
import { fileSlug } from "./pdf";
import { escapeHtml } from "./receipt";

/** "+1 vs September" (up), "−1 vs September" (down) or "Same as September" — under the compare cards and boxes. */
export interface CompareNote {
  text: string;
  tone: "up" | "down" | "same";
}

export function compareNote(current: number, previous: number, previousMonthKey: string): CompareNote {
  const name = monthName(previousMonthKey);
  const delta = current - previous;
  if (delta > 0) return { text: `+${delta} vs ${name}`, tone: "up" };
  if (delta < 0) return { text: `−${Math.abs(delta)} vs ${name}`, tone: "down" };
  return { text: `Same as ${name}`, tone: "same" };
}

/** "Report-Sathorn-Bespoke-2026-10.pdf" */
export function reportFileName(report: ReportResponse, shopName: string): string {
  return `Report-${fileSlug(shopName) || "shop"}-${report.month}.pdf`;
}

/** "Sathorn, Bangkok · 02 000 0000 · hello@example.com" — whatever the shop has filled in. */
function shopLine(shop: Shop | null): string {
  if (!shop) return "";
  const place = [shop.district, shop.city].filter((s) => s && s.trim()).join(", ");
  return [place, shop.phone?.trim(), shop.replyToEmail?.trim()].filter((s): s is string => !!s).join(" · ");
}

/** Bar heights in the mini chart, in points. */
const CHART_HEIGHT = 56;
const MIN_BAR = 3;

/**
 * The report as a self-contained HTML page sized for A5 (420 x 595 pt). System fonts only, like the receipt, so
 * Thai names render through the phone's own font fallback; nothing is fetched. `now` is the "Issued" date.
 */
export function reportHtml(report: ReportResponse, shop: Shop | null, now: Date = new Date()): string {
  const e = escapeHtml;
  const shopName = shop?.name?.trim() || "Your tailor";
  const line = shopLine(shop);
  const prev = report.previous.month;
  const name = monthName(report.month);

  const boxes = [
    { label: "New clients", value: report.newClients, note: compareNote(report.newClients, report.previous.newClients, prev) },
    { label: "Fittings", value: report.fittings, note: compareNote(report.fittings, report.previous.fittings, prev) },
    { label: "Delivered", value: report.ordersDelivered, note: compareNote(report.ordersDelivered, report.previous.ordersDelivered, prev) },
  ]
    .map(
      (box) =>
        `<div class="box"><div class="box-label">${e(box.label)}</div><div class="box-value">${box.value}</div><div class="box-note ${box.note.tone}">${e(box.note.text)}</div></div>`,
    )
    .join("");

  const max = Math.max(1, ...report.months.map((m) => m.ordersDelivered));
  const bars = report.months
    .map((m) => {
      const height = m.ordersDelivered > 0 ? Math.max(MIN_BAR, Math.round((m.ordersDelivered / max) * CHART_HEIGHT)) : MIN_BAR;
      const selected = m.month === report.month;
      return `<div class="col"><div class="bar-value">${m.ordersDelivered}</div><div class="bar${selected ? " selected" : ""}" style="height:${height}pt"></div><div class="bar-label${selected ? " selected" : ""}">${e(shortMonthLabel(m.month))}</div></div>`;
    })
    .join("");

  const garments =
    report.garments.length > 0
      ? report.garments.map((g) => `<li><span class="who">${e(g.garment)}</span><span class="n">${g.delivered} delivered</span></li>`).join("")
      : `<li class="empty">Nothing delivered yet this month.</li>`;

  const calls =
    report.clientsToCall.length > 0
      ? report.clientsToCall
          .map(
            (c) =>
              `<li><span class="who">${e(c.name)}<span class="sub">${e(c.detail)}</span></span><span class="tag">${c.reason === "quiet" ? "Win-back" : "Collect"}</span></li>`,
          )
          .join("")
      : `<li class="empty">No one to call right now.</li>`;

  const openOrders = `${report.openOrders} open ${report.openOrders === 1 ? "order" : "orders"}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=420">
<style>
  @page { size: 420pt 595pt; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { width: 420pt; min-height: 595pt; font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, "Noto Sans Thai", "Thonburi", sans-serif; color: #14213a; font-size: 10.5pt; line-height: 1.4; }
  .page { padding: 26pt 30pt 22pt; }
  .band { background: #14213a; color: #f4efe6; margin: -26pt -30pt 16pt; padding: 20pt 30pt 16pt; }
  .shop-name { font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif; font-size: 21pt; font-weight: 700; line-height: 1.15; margin: 0 0 3pt; }
  .shop-line { font-size: 9pt; color: #f4efe6; opacity: 0.9; }
  .title-row { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 12pt; }
  .title { font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif; font-size: 19pt; font-weight: 700; margin: 0; }
  .meta { text-align: right; font-size: 9pt; color: #4a5263; }
  .meta b { color: #14213a; font-size: 10pt; }
  .boxes { display: flex; gap: 8pt; }
  .box { flex: 1; min-width: 0; border: 1px solid #ded4c1; border-radius: 6pt; padding: 7pt 9pt 6pt; background: #fbf8f2; }
  .box-label { font-size: 7.5pt; color: #7a5414; font-weight: 700; letter-spacing: 1pt; text-transform: uppercase; }
  .box-value { font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif; font-size: 21pt; font-weight: 700; line-height: 1.1; margin: 2pt 0 1pt; }
  .box-note { font-size: 8pt; color: #4a5263; }
  .box-note.up { color: #2f4a22; }
  .box-note.down { color: #a93f32; }
  table { width: 100%; border-collapse: collapse; margin: 12pt 0 0; }
  td { padding: 6pt 0; border-top: 1px solid #ded4c1; font-size: 10.5pt; vertical-align: top; }
  tr:last-child td { border-bottom: 1px solid #ded4c1; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 700; }
  td.num.gold { color: #7a5414; }
  td.num.red { color: #a93f32; }
  .sub { display: block; font-size: 8.5pt; color: #4a5263; font-weight: 400; }
  h3 { font-size: 8pt; color: #7a5414; font-weight: 700; letter-spacing: 1pt; text-transform: uppercase; margin: 0 0 5pt; }
  .chart-wrap { margin: 14pt 0 0; }
  .chart { display: flex; align-items: flex-end; gap: 6pt; }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
  .bar-value { font-size: 8.5pt; color: #14213a; margin-bottom: 2pt; font-variant-numeric: tabular-nums; }
  .bar { width: 100%; max-width: 32pt; background: #eae1cf; border-radius: 3pt 3pt 0 0; }
  .bar.selected { background: #d1ac66; }
  .bar-label { font-size: 8pt; color: #4a5263; margin-top: 3pt; }
  .bar-label.selected { color: #14213a; font-weight: 700; }
  .cols { display: flex; gap: 14pt; margin: 14pt 0 0; }
  .half { flex: 1; min-width: 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; align-items: flex-start; gap: 6pt; padding: 4pt 0; border-top: 1px solid #ded4c1; font-size: 9.5pt; }
  li .who { min-width: 0; }
  li .n { white-space: nowrap; color: #4a5263; }
  li .tag { white-space: nowrap; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.5pt; text-transform: uppercase; color: #7a5414; padding-top: 1pt; }
  li.empty { color: #4a5263; }
  .foot { margin: 20pt 0 0; padding-top: 8pt; border-top: 1px solid #ded4c1; font-size: 8.5pt; color: #4a5263; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <div class="band">
    <h1 class="shop-name">${e(shopName)}</h1>
    ${line ? `<div class="shop-line">${e(line)}</div>` : ""}
  </div>
  <div class="title-row">
    <h2 class="title">Monthly report</h2>
    <div class="meta"><b>${e(monthLabel(report.month))}</b><br>Issued ${e(formatDate(now))}</div>
  </div>
  <div class="boxes">${boxes}</div>
  <table>
    <tr><td>Money collected<span class="sub">Deposits and balances received in ${e(name)}</span></td><td class="num">${e(formatThb(report.moneyCollected))}</td></tr>
    <tr><td>Still owed on open orders<span class="sub">On ${e(openOrders)}, today</span></td><td class="num gold">${e(formatThb(report.stillOwed))}</td></tr>
    <tr><td>Clients quiet for 90+ days<span class="sub">No order since, today</span></td><td class="num${report.quietClients > 0 ? " red" : ""}">${report.quietClients}</td></tr>
  </table>
  <div class="chart-wrap">
    <h3>Orders delivered · last six months</h3>
    <div class="chart">${bars}</div>
  </div>
  <div class="cols">
    <div class="half"><h3>Most made</h3><ul>${garments}</ul></div>
    <div class="half"><h3>Clients to call</h3><ul>${calls}</ul></div>
  </div>
  <div class="foot">${e(shopName)} · Issued with Magick Tailor</div>
</div>
</body>
</html>`;
}
