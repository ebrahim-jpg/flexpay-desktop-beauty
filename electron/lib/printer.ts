import { BrowserWindow } from "electron";
import { getMainWindow } from "../main-window";
import type { PrinterInfo } from "../../shared/settings";
import type { OnlineOrderDTO } from "../../shared/online-orders";
import { formatOnlineQty } from "../../shared/online-orders";

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

// عرض الطباعة الفعلي للطابعة الحرارية 80mm = 72mm منطقة طباعة (576 نقطة @ 8/mm)
const PRINT_WIDTH_MM = 72;
// عرض النافذة المخفية بالبكسل عند 96dpi عشان التخطيط يطابق عرض الطباعة الفعلي
const WINDOW_WIDTH_PX = Math.round((PRINT_WIDTH_MM / 25.4) * 96); // ≈ 272px
// تحويل من بكسل (96dpi) لميكرون: 1px = 1/96 إنش = 264.583 ميكرون
const PX_TO_MICRON = 25400 / 96;

// قائمة الطابعات المتصلة بالجهاز
export async function listPrinters(): Promise<PrinterInfo[]> {
  const win = getMainWindow();
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    isDefault: p.isDefault,
  }));
}

/**
 * يرسم HTML في نافذة مخفية بعرض الطباعة الفعلي، يستنى ما يترسم،
 * يقيس ارتفاع المحتوى، ويطبع على حجم صفحة 72mm × ارتفاع-المحتوى.
 * ده بيحل مشكلة الفاتورة الفاضية على الطابعات الحرارية (توقيت الرسم + حجم الصفحة).
 */
async function renderAndPrint(
  html: string,
  printerName: string | null | undefined,
  silent: boolean
): Promise<boolean> {
  const printWin = new BrowserWindow({
    show: false,
    width: WINDOW_WIDTH_PX,
    height: 1200,
    backgroundColor: "#ffffff",
    webPreferences: { offscreen: false, sandbox: false },
  });

  try {
    await printWin.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(html)
    );

    // استنى دورة رسم كاملة — النافذة المخفية محتاجة وقت تترسم قبل الطباعة
    await new Promise((r) => setTimeout(r, 350));

    // قِس ارتفاع المحتوى الفعلي (بنفس عرض الطباعة) عشان نقص الصفحة على المحتوى بالظبط
    let contentHeightPx = 0;
    try {
      contentHeightPx = (await printWin.webContents.executeJavaScript(
        "Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)"
      )) as number;
    } catch {
      contentHeightPx = 0;
    }

    const heightMicron =
      contentHeightPx > 0
        ? Math.max(40000, Math.ceil((contentHeightPx + 8) * PX_TO_MICRON))
        : 297000; // fallback ~ ارتفاع A4 لو فشل القياس

    await new Promise<void>((resolve, reject) => {
      printWin.webContents.print(
        {
          silent,
          deviceName: printerName || undefined,
          margins: { marginType: "none" },
          printBackground: true,
          color: false, // حراري أبيض/أسود
          pageSize: {
            width: PRINT_WIDTH_MM * 1000, // ميكرون
            height: heightMicron,
          },
        },
        (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || "فشل الطباعة"));
        }
      );
    });

    return true;
  } finally {
    if (!printWin.isDestroyed()) printWin.destroy();
  }
}

// طباعة تجريبية — محتوى بسيط بنفس مقاسات الفاتورة الحرارية
export async function testPrint(printerName?: string): Promise<boolean> {
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <style>
      @page { margin: 0; }
      * { box-sizing: border-box; }
      body{
        margin:0; padding:6px 6px; width:100%;
        font-family:Tahoma,Arial,sans-serif; color:#000;
        text-align:center; font-size:13px; line-height:1.5;
      }
      h2{margin:0 0 6px; font-size:18px;}
      .hr{border:none;border-top:1px dashed #000;margin:8px 0;}
      .big{font-size:15px;font-weight:bold;}
    </style></head>
    <body>
      <h2>FlexPay</h2>
      <div class="hr"></div>
      <p class="big">طباعة تجريبية</p>
      <p>التاريخ: ${new Date().toLocaleString("ar-EG")}</p>
      <p>أبجد هوز حطي كلمن — 0123456789</p>
      <div class="hr"></div>
      <p class="big">تمت بنجاح ✓</p>
    </body></html>`;

  // لو فيه طابعة محددة اطبع صامت عليها، غير كده افتح مربع الحوار
  return renderAndPrint(html, printerName, !!printerName);
}

// طباعة فاتورة صامتة (بدون أي مربع حوار) على الطابعة المحددة أو الافتراضية
export async function printReceipt(
  html: string,
  printerName?: string | null
): Promise<boolean> {
  return renderAndPrint(html, printerName, true);
}

// ===== تذكرة المطبخ =====
// ⚠️ **بلا أسعار**: دي ورقة شغل للشيف مش فاتورة. الأصناف بخط كبير، والملاحظة تحت الصنف
// (بلا/زيادة/مستوي الاستواء) لأن دي اللي بتفرق في المطبخ.
// بتطلع على `kitchen_printer_name` لو متظبطة، وإلا على طابعة الفاتورة (محل بطابعة واحدة).
// تذكرة تجهيز طلب المتجر — للبائع عشان يجهّز قبل ما الكاشير يضرب (من غير أسعار).
export async function printOnlineOrderTicket(
  order: OnlineOrderDTO,
  printerName?: string | null,
  shopName?: string
): Promise<boolean> {
  const items = order.items
    .map(
      (it) => `
      <div class="item">
        <span class="qty">${esc(formatOnlineQty(it.quantity, it.sale_type))}</span>
        <span class="name">${esc(it.name)}${it.variant_size ? ` — ${esc(it.variant_size)}` : ""}</span>
      </div>
      ${it.notes ? `<div class="inote">↳ ${esc(it.notes)}</div>` : ""}`
    )
    .join("");

  const when = order.web_created_at
    ? new Date(order.web_created_at).toLocaleString("ar-EG", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleString("ar-EG");

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <style>
      @page { margin: 0; }
      * { box-sizing: border-box; }
      body{ margin:0; padding:8px 7px; width:100%;
        font-family:Tahoma,Arial,sans-serif; color:#000; font-size:13px; line-height:1.5; }
      .center{ text-align:center; }
      .title{ font-size:17px; font-weight:bold; margin:2px 0; }
      .tag{ display:inline-block; border:2px solid #000; border-radius:6px;
        padding:2px 10px; font-weight:bold; font-size:14px; margin:4px 0; }
      .hr{ border:none; border-top:1px dashed #000; margin:7px 0; }
      .row{ display:flex; justify-content:space-between; gap:6px; font-size:12px; }
      .item{ display:flex; gap:8px; align-items:baseline; padding:3px 0; font-size:15px; }
      .qty{ font-weight:bold; min-width:34px; }
      .name{ font-weight:600; }
      .inote{ font-size:12px; color:#000; padding-right:42px; margin-top:-2px; }
      .box{ border:1px solid #000; border-radius:6px; padding:6px 8px; margin-top:4px; font-size:12px; }
      .lbl{ font-weight:bold; }
    </style></head>
    <body>
      <div class="center">
        ${shopName ? `<div class="title">${esc(shopName)}</div>` : ""}
        <div class="tag">🛒 طلب المتجر — تجهيز</div>
      </div>
      <div class="hr"></div>
      <div class="row"><span class="lbl">العميل</span><span>${esc(order.customer_name || "—")}</span></div>
      <div class="row"><span class="lbl">الموبايل</span><span dir="ltr">${esc(order.customer_phone)}</span></div>
      <div class="row"><span class="lbl">الوقت</span><span>${esc(when)}</span></div>
      <div class="hr"></div>
      ${items}
      <div class="hr"></div>
      ${order.address ? `<div class="box"><span class="lbl">العنوان:</span> ${esc(order.address)}</div>` : ""}
      ${order.notes ? `<div class="box"><span class="lbl">ملاحظات:</span> ${esc(order.notes)}</div>` : ""}
      <div class="center" style="margin-top:8px; font-size:12px;">${order.items_count.toLocaleString("ar-EG")} صنف · جهّز للتوصيل</div>
    </body></html>`;

  return renderAndPrint(html, printerName, !!printerName);
}
