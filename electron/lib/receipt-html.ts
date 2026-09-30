import { formatQty, type OrderDTO } from "../../shared/orders";
import { productWithSize } from "../../shared/sizes";

export interface ReceiptSettings {
  shopName: string;
  receiptHeader: string;
  receiptFooter: string;
  currencySymbol: string;
}

function money(value: number, symbol: string): string {
  const n = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
  return `${n} ${symbol}`;
}

function dateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const time = new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${dd}/${mm}/${yyyy} - ${time}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// فاتورة حرارية 80mm — تُطبع صامتة من الـ Main
export function buildReceiptHtml(order: OrderDTO, s: ReceiptSettings): string {
  const sym = s.currencySymbol;

  const itemsHtml = order.items
    .map((it) => {
      const mods =
        it.selected_modifiers.length > 0
          ? `<div class="mods">${esc(
              it.selected_modifiers.map((m) => m.option_name).join("، ")
            )}</div>`
          : "";
      return `
        <div class="row">
          <span>${esc(productWithSize(it.product_name, it.variant_size))} ${esc(formatQty(it.quantity, it.sale_type))}</span>
          <span>${money(it.total_price, sym)}</span>
        </div>
        ${mods}`;
    })
    .join("");

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
  .free-tag {
    margin: 6px 0;
    padding: 3px 0;
    font-size: 15px;
    font-weight: bold;
    text-align: center;
    border: 2px solid #000;
  }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    word-break: break-word;
  }
  .mods { font-size: 11px; color: #000; padding-right: 6px; }
  .bold { font-weight: bold; }
  .total .row.bold { font-size: 15px; }
  .meta { font-size: 12px; }
</style>
</head>
<body>
  <div class="center">
    <div class="shop">${esc(s.shopName)}</div>
    ${s.receiptHeader ? `<div class="meta">${esc(s.receiptHeader)}</div>` : ""}
  </div>
  ${
    order.is_free
      ? `<div class="free-tag">فاتورة مجانية${
          order.free_recipient_name
            ? `<div style="font-size:12px;font-weight:normal;margin-top:2px;">المستفيد: ${esc(
                order.free_recipient_name
              )} (${order.free_recipient_type === "staff" ? "موظف" : "عميل"})</div>`
            : ""
        }</div>`
      : ""
  }
  <div class="hr"></div>
  <div class="meta">
    <div class="row"><span>رقم الفاتورة</span><span>${order.receipt_label}</span></div>
    <div class="row"><span>التاريخ</span><span>${dateTime(order.created_at)}</span></div>
    <div class="row"><span>الموظف</span><span>${esc(order.cashier_name)}</span></div>
    ${
      !order.is_guest && order.customer_name
        ? `<div class="row"><span>العميل</span><span>${esc(order.customer_name)}</span></div>`
        : ""
    }
    ${order.notes ? `<div class="row"><span>ملاحظة</span><span>${esc(order.notes)}</span></div>` : ""}
  </div>
  <div class="hr"></div>
  ${itemsHtml}
  <div class="hr"></div>
  <div class="total">
  <div class="row"><span>المجموع</span><span>${money(order.subtotal, sym)}</span></div>
  ${
    order.discount_amount > 0
      ? `<div class="row"><span>الخصم</span><span>-${money(order.discount_amount, sym)}</span></div>`
      : ""
  }
  ${
    order.tax_amount > 0
      ? `<div class="row"><span>ضريبة (${order.tax_rate}%)</span><span>+${money(order.tax_amount, sym)}</span></div>`
      : ""
  }
  <div class="row bold"><span>الإجمالي</span><span>${money(order.total, sym)}</span></div>
  ${
    order.is_free
      ? `<div class="row bold"><span>المدفوع</span><span>مجاناً</span></div>`
      : `<div class="row"><span>المدفوع</span><span>${money(order.amount_paid, sym)}</span></div>
  ${
    order.change_amount > 0
      ? `<div class="row"><span>الباقي</span><span>${money(order.change_amount, sym)}</span></div>`
      : ""
  }`
  }
  </div>
  <div class="hr"></div>
  ${s.receiptFooter ? `<div class="center meta">${esc(s.receiptFooter)}</div>` : ""}
</body>
</html>`;
}
