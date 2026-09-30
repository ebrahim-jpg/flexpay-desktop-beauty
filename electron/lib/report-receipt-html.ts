import type { SalesSummaryPrintData } from "../../shared/reports";

export interface ReportReceiptSettings {
  shopName: string;
  currencySymbol: string;
}

function money(value: number, symbol: string): string {
  const n = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
  return `${n} ${symbol}`;
}

function arDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(y, (m || 1) - 1, d || 1));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ملخص مبيعات حراري 80mm — يُطبع صامتاً من الـ Main (بدل طباعة كل الفواتير)
export function buildSalesSummaryHtml(
  d: SalesSummaryPrintData,
  s: ReportReceiptSettings
): string {
  const sym = s.currencySymbol;

  const catRows = d.byCategory.length
    ? d.byCategory
        .map(
          (c) =>
            `<div class="row"><span>${esc(c.name)} (${c.count})</span><span>${money(
              c.revenue,
              sym
            )}</span></div>`
        )
        .join("")
    : `<div class="muted">—</div>`;

  const payRows = d.byPayment.length
    ? d.byPayment
        .map(
          (p) =>
            `<div class="row"><span>${esc(p.label)} (${p.count})</span><span>${money(
              p.revenue,
              sym
            )}</span></div>`
        )
        .join("")
    : `<div class="muted">—</div>`;

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    padding: 4px 4px 8px;
    width: 100%;
    font-family: "Tahoma", "Arial", sans-serif;
    color: #000;
    font-size: 13px;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .shop { font-size: 18px; font-weight: bold; }
  .title { font-size: 15px; font-weight: bold; margin-top: 2px; }
  .meta { font-size: 12px; }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; word-break: break-word; }
  .section { font-weight: bold; margin: 4px 0 2px; }
  .muted { color: #000; font-size: 12px; }
  .total .row { font-size: 15px; font-weight: bold; }
</style>
</head>
<body>
  <div class="center">
    <div class="shop">${esc(s.shopName)}</div>
    <div class="title">ملخص المبيعات</div>
    <div class="meta">${arDate(d.date)}</div>
    ${d.cashierName ? `<div class="meta">وردية: ${esc(d.cashierName)}</div>` : ""}
  </div>
  <div class="hr"></div>

  <div class="row"><span>عدد الفواتير</span><span>${d.orders}</span></div>
  <div class="row"><span>الإيرادات</span><span>${money(d.revenue, sym)}</span></div>
  <div class="row"><span>الخصومات</span><span>${money(d.discount, sym)}</span></div>
  <div class="row"><span>المصروفات</span><span>${money(d.expenses, sym)}</span></div>
  <div class="hr"></div>
  <div class="total"><div class="row"><span>الصافي</span><span>${money(d.net, sym)}</span></div></div>

  <div class="hr"></div>
  <div class="section">حسب الفئة</div>
  ${catRows}

  <div class="hr"></div>
  <div class="section">حسب طريقة الدفع</div>
  ${payRows}
</body>
</html>`;
}
