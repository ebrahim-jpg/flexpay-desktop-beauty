// حارس **مسار التذكرة والفاتورة** (فحص ثابت — بلا إلكترون).
// التشغيل: node scripts/verify-kitchen-flow.js
//
// أربع مسارات، وكل واحد له قاعدة مختلفة. الخطر إن أي تعديل يخلط بينهم:
//
//   ① **الصالة**: التذكرة من «أرسل للمطبخ» بس — **ممنوع** تطبع مع إضافة كل صنف
//      (ده كان الباج: ١٠ أصناف = ١٠ ورقات). والفاتورة عند الحساب **لوحدها**.
//   ② **الكاشير** (تيك أواي/توصيل): التذكرة + الفاتورة عند إنهاء الحساب، **ورقتين**.
//   ③ **المتجر**: تذكرة من صفحة طلبات المتجر، والفاتورة من الكاشير بعد «جاهز للانطلاق».
//      وممنوع ورقتين لنفس الأكل.
//   ④ التذاكر كلها على **طابعة المطبخ** (ولو مش متظبّطة، طابعة الفاتورة).
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
};
const read = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), "utf8") : "");

// الفحص على الكود مش على التعليقات (التعليقات بتشرح الباج القديم بالنص)
function code(rel) {
  return read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:"'`\w])\/\/.*$/, "$1"))
    .join("\n");
}

console.log("— الصالة: تذكرة بالدفعة مش بالصنف —");
const drinks = code("components/gaming/AddDrinksDialog.tsx");
ok(
  !/kitchen:printTicket/.test(drinks),
  "**شاشة أوردر الطاولة مافيهاش طباعة خالص** (كانت بتطبع ورقة مع كل صنف)"
);
ok(/gaming:session:sendToKitchen/.test(drinks), "وفيها «أرسل للمطبخ»");
ok(/pendingCount/.test(drinks), "وزرار الإرسال متعطّل لما مفيش معلّق");
ok(/window\.confirm/.test(drinks), "وتأكيد قبل حذف/تقليل صنف راح للمطبخ");

console.log("\n— الصالة: الفاتورة لوحدها عند الحساب —");
const sessionCheckout = code("components/gaming/SessionCheckoutModal.tsx");
ok(/orders:printReceipt/.test(sessionCheckout), "شاشة الحساب بتطبع الفاتورة");
ok(
  !/kitchen:printTicket/.test(sessionCheckout),
  "**ومابتطبعش تذكرة من الواجهة** — الـIPC هو اللي بيطبع المعلّق قبل الفاتورة"
);

console.log("\n— الترتيب في الـMain —");
const ipc = code("electron/ipc/gaming.ipc.ts");
ok(/sendToKitchen/.test(ipc), "قناة الإرسال موجودة");
const send = ipc.slice(ipc.indexOf("sendToKitchen"));
ok(
  send.indexOf("printPending") < send.indexOf("markKitchenSent"),
  "**الطباعة قبل التعليم**: طابعة فاضية ورق مايصحّش تخلّي الأصناف «راحت» والمطبخ مايشوفهاش"
);
ok(/pendingKitchenItems\(input\.session_id\)/.test(ipc), "والحساب بيطبع المعلّق قبل الفاتورة");
ok(
  /kitchenPrinterName \?\? settings\.printerName/.test(ipc),
  "والتذكرة على طابعة المطبخ (وإلا طابعة الفاتورة — مطعم بطابعة واحدة)"
);

console.log("\n— الكاشير: الاتنين عند الحساب —");
const posCheckout = code("components/pos/CheckoutModal.tsx");
ok(/orders:printReceipt/.test(posCheckout), "الكاشير بيطبع الفاتورة");
ok(/kitchen:printTicket/.test(posCheckout), "**وتذكرة التجهيز كمان** (ورقتين منفصلتين)");
ok(
  /ticketAlreadyPrinted/.test(posCheckout),
  "ومابيطبعش تذكرة تانية لطلب متجر اتطبعت تذكرته خلاص"
);

console.log("\n— المتجر —");
const storeOrders = code("app/(main)/store-orders/page.tsx");
ok(/onlineOrders:printTicket/.test(storeOrders), "صفحة طلبات المتجر فيها طباعة تذكرة التجهيز");
ok(/PREPARE_ORDER_KEY/.test(storeOrders), "و«جاهز للانطلاق» بتودّي الكاشير");
const onlineIpc = code("electron/ipc/online-orders.ipc.ts");
ok(
  /kitchenPrinterName \?\? settings\.printerName/.test(onlineIpc),
  "وتذكرة المتجر على طابعة المطبخ (كانت على طابعة الفاتورة)"
);
ok(/markTicketPrinted/.test(onlineIpc), "وبتتختم إنها اتطبعت");

console.log("\n— الأساس —");
ok(
  /sent_qty/.test(read("electron/database/migrations/036_kitchen_batches.ts")),
  "migration 036 فيه sent_qty"
);
const repo = code("electron/repositories/gaming.repository.ts");
ok(/MIN\(sent_qty, @q\)/.test(repo), "تقليل الكمية بيقصّر sent_qty (المعلّق مايبقاش سالب)");
ok(/sent_qty = sent_qty \+ @sent/.test(repo), "والدمج بيجمع sent_qty (مايرجعش يطبع المرسَل)");
ok(
  !/printKitchenTicket/.test(repo),
  "**والريبو مايعرفش الطابعة** — عشان المنطق يتختبر من غير نافذة"
);

console.log(failed ? `\n❌ ${failed} فحص فشل` : "\n✅ مسار التذكرة والفاتورة سليم");
process.exit(failed ? 1 : 0);
