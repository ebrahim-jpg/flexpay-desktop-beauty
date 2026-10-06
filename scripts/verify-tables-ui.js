// حارس واجهة الطاولات (نسخة «كافيه» بس) — فحص ثابت بلا إلكترون.
// التشغيل: node scripts/verify-tables-ui.js
//
// بيمسك: صفحة الطاولات مش موصّلة · شاشة الغرف بقت تشوف طاولات · تفصيل «وقت لعب» بيظهر في حساب طاولة ·
// فلتر القسم في التقارير ناقصه «الطاولات» · إيراد ظاهر على شاشة الطاولات (موظف الصالة مايشوفش فلوس اليوم).
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
};
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(root, rel), "utf8") : "");
function stripComments(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:"'`\w])\/\/.*$/, "$1"))
    .join("\n");
}
const code = (rel) => stripComments(read(rel));

// ===== ① التنقّل =====
console.log("\n— التنقّل —");
const nav = code("components/shared/nav-items.ts");
const hrefs = [...nav.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
ok(hrefs[0] === "/tables", `«الطاولات» أول عنصر — شاشة البيع الوحيدة (الفعلي ${hrefs[0]})`);
ok(/label:\s*"الكراسي"[\s\S]{0,120}highlight:\s*true/.test(nav), "«الكراسي» شاشة بيع مميزة (highlight)");

// ===== ② صفحة الطاولات =====
console.log("\n— صفحة الطاولات —");
const page = code("app/(main)/tables/page.tsx");
ok(exists("app/(main)/tables/page.tsx"), "app/(main)/tables/page.tsx موجودة");
ok(/invoke\("gaming:board"\)/.test(page) && /board\?\.tables/.test(page), "اللوحة بترجع الطاولات (مفيش غرف في النسخة دي)");
for (const ch of ["gaming:session:transfer", "gaming:session:open"]) {
  ok(page.includes(`"${ch}"`), `الصفحة بتستخدم ${ch}`);
}
// ⚠️ الدمج والتقسيم اتشالوا: الدمج كان بيمسح نصيب حلاق (مفتاح تجميع البنود
// عنده ماكانش فيه `staff_id` بخلاف `addItem`) — والتقسيم اتشال بقرار المالك.
for (const gone of ["gaming:session:merge", "gaming:session:splitCheckout", "gaming:session:quoteSplit"]) {
  ok(!page.includes(`"${gone}"`), `ومابتستخدمش ${gone}`);
}
ok(!exists("components/gaming/SplitBillDialog.tsx"), "وديالوج التقسيم اتمسح");
ok(
  !/mergeSessions|splitCheckout|quoteSplit/.test(code("electron/repositories/gaming.repository.ts")),
  "والريبو مافيهوش دوالهم خالص"
);
// ⚠️ الملف كان اسمه `AddDrinksDialog` («إضافة مشروبات») من نسخة الكافيه
ok(/SessionCheckoutModal/.test(page) && /AddServicesDialog/.test(page), "الحساب والخدمات موصّلين");
ok(!exists("components/gaming/AddDrinksDialog.tsx"), "ومفيش ملف اسمه AddDrinksDialog");
ok(/TablesManager/.test(page) && exists("components/gaming/TablesManager.tsx"), "إدارة الطاولات موصّلة");
ok(/"gaming:rooms:save"/.test(code("components/gaming/TablesManager.tsx")) && !/rate_single|rate_multi/.test(code("components/gaming/TablesManager.tsx")), "إدارة الطاولات بالاسم والمنطقة بس (مفيش أسعار)");
ok(!/time_revenue|إيراد|items_subtotal\s*\)\s*\}\s*<\/p>\s*<p[^>]*>الوقت/.test(page), "مفيش إيراد ولا «وقت محسوب» على شاشة الطاولات");
ok(/canCancelOrder/.test(page), "زرار إلغاء الحساب ورا صلاحية canCancelOrder");
// ⚠️ «البيع السريع» كان للي بيشتري **مشروب/سناك** من غير ما يقعد — بيع بضاعة،
// واتشال من نسخة التجميل. البديل هو **الجلسة السريعة** (خدمة بحلاق في ضغطة).
ok(!/QuickSaleDialog/.test(page), "مفيش بيع سريع بالمنتجات");
ok(/QuickSessionDialog/.test(page), "والجلسة السريعة موصّلة بداله");

// ===== ③ مفيش شاشة غرف =====
console.log("\n— مفيش شاشة غرف —");
ok(!exists("app/(main)/rooms/page.tsx"), "صفحة الغرف مش موجودة (نسخة «كافيه» بس)");

// ===== ④ حساب الطاولة =====
console.log("\n— حساب الطاولة —");
const checkout = code("components/gaming/SessionCheckoutModal.tsx");
ok(!/الوقت المحتسب|bySegment|time_price/.test(checkout), "حساب الطاولة مافيهوش تفصيل وقت ولا سعر وقت");
ok(/الطلبات/.test(checkout), "حساب الطاولة بيقول «الطلبات» مش «المشروبات»");

// ===== ④ب حجز الطاولة =====
console.log("\n— حجز الطاولة على شاشة طلبات الحجز —");
const bookingsPage = code("app/(main)/bookings/page.tsx");
ok(/"bookings:confirm",\s*\{[^}]*table_id/.test(bookingsPage), "تأكيد الحجز بيبعت الطاولة المختارة (table_id)");
ok(/"gaming:rooms:list"/.test(bookingsPage) && /party_size/.test(bookingsPage), "الشاشة بتعرض طلب الطاولة بعدد الأفراد وبتجيب قايمة الطاولات");

// ===== ⑤ التقارير =====
console.log("\n— التقارير —");
const sales = code("components/reports/SalesReport.tsx");
// ⚠️ فلتر «المصدر» اتشال: الكاشير والمتجر اتشالوا فكل فاتورة مصدرها جلسة كرسي —
// فلتر بخيار واحد له معنى هو ضوضاء على الشاشة.
ok(!/value="pos"|بيع سريع/.test(sales), "مفيش خيار «بيع سريع» في التقرير");
ok(!/setSource/.test(sales), "وفلتر «المصدر» اتشال خالص (كل فاتورة بقت جلسة)");
ok(/table_session: "جلسة"/.test(code("shared/orders.ts")), "ولافتة مصدر table_session = «جلسة»");

console.log(failed === 0 ? "\n✅ واجهة الطاولات متوصّلة صح" : `\n❌ ${failed} فحص فشل`);
process.exit(failed === 0 ? 0 : 1);
