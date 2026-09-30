// حارس هيكل نسخة «المطاعم» (فحص ثابت — بلا إلكترون).
// التشغيل: node scripts/verify-restaurant-shell.js
//
// ⚠️ ده **عكس** حارس الكافيه القديم (`verify-no-pos.js` اللي كان بيمنع الكاشير):
// المطعم محتاج التلاتة مع بعض — صالة بطاولات + كاشير للتيك أواي والتوصيل + طلبات المتجر.
// أي دمج من نسخة الكافيه بيرجّع «مفيش كاشير» بصمت، والحارس ده بيمسكه في ثانية.
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

// الفحص على الكود مش على التعليقات — تعليق بيشرح «الصالة مكانها شاشة تانية» مش تسريب
function code(rel) {
  return read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:"'`\w])\/\/.*$/, "$1"))
    .join("\n");
}

// ① الكاشير موجود
console.log("— الكاشير —");
for (const rel of ["app/(main)/pos/page.tsx", "components/pos/POSHeader.tsx", "hooks/usePosShortcuts.ts"]) {
  ok(exists(rel), `${rel} موجود`);
}
const header = code("components/pos/POSHeader.tsx");
ok(/تيك أواي/.test(header), "نوع الطلب فيه «تيك أواي»");
ok(/توصيل/.test(header), "ونوع «توصيل»");
ok(!/صالة|dine_in/.test(header), "ومفيش «صالة» في الكاشير (الصالة من شاشة الطاولات)");

// ② الصالة لسه هي الأساس
console.log("\n— الصالة —");
const nav = read("components/shared/nav-items.ts");
const hrefs = [...nav.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
ok(hrefs[0] === "/tables", `«الصالة» أول عنصر في التنقّل (الفعلي ${hrefs[0]})`);
ok(hrefs.includes("/pos"), "والكاشير في التنقّل");
ok(hrefs.includes("/store-orders"), "وطلبات المتجر في التنقّل");
ok(hrefs.includes("/bookings"), "وحجز الطاولات في التنقّل");

// ③ التوصيل مربوط (الأعمدة موجودة من migration 022 — المطلوب الواجهة)
console.log("\n— التوصيل —");
ok(/value="delivery"/.test(read("app/(main)/settings/page.tsx")), "تبويب «مناطق التوصيل» في الإعدادات");
ok(exists("components/settings/DeliveryZonesEditor.tsx"), "محرّر المناطق موجود");
const perms = read("shared/permissions.ts");
const assignable = /ASSIGNABLE_ROLES: Role\[\] = \[([^\]]*)\]/.exec(perms)?.[1] ?? "";
ok(/"delivery"/.test(assignable), `دور الديليفري بيتعيّن للموظفين (الحالي: ${assignable.trim() || "—"})`);

// ④ طلبات المتجر بتجهّز للكاشير فعلاً (كانت بترسل توست بس في الكافيه)
console.log("\n— طلبات المتجر —");
const store = code("app/(main)/store-orders/page.tsx");
ok(/PREPARE_ORDER_KEY|setOnlineOrder/.test(store), "«جاهز للانطلاق» بيجهّز الطلب للكاشير");
ok(!/اعمله من بيع سريع/.test(store), "ومفيش الرسالة القديمة «اعمله من بيع سريع»");
ok(/online_store/.test(code("components/pos/CheckoutModal.tsx")), "الفاتورة بتتعلّم مصدرها من المتجر");

// ⑤ المطبخ
console.log("\n— المطبخ —");
ok(/kitchen_printer_name/.test(read("electron/database/migrations/034_restaurant_vertical.ts")), "طابعة المطبخ في migration 034");
ok(/kitchenPrinterName/.test(read("shared/settings.ts")), "وفي أنواع الإعدادات");
ok(/"chef"/.test(perms), "دور الطباخ موجود");
ok(/"waiter"/.test(perms), "ودور النادل");

// ⑥ بقايا التجزئة اللي **لسه** ممنوعة في المطعم
// (اتنقلت من `verify-gaming-ui.js` الموروث من الكافيه واللي اتشال: نصّه كان بيمنع
//  الكاشير والتوصيل والدليفري — وكل دي جوهر المطعم، فبقى بيناقض الحارس الرئيسي.)
console.log("\n— بقايا تجزئة ممنوعة —");
// المطعم بيبيع بالقطعة: مفيش وزن ولا باركود ميزان
const productModal = code("components/products/ProductModal.tsx");
ok(!/"weight"|لكل كيلو|باركود وزن|طريقة البيع/.test(productModal), "ProductModal مفيهوش بيع بالوزن");
ok(
  /sale_type:\s*"piece"/.test(code("electron/repositories/products.repository.ts")),
  "والـrepo بيجبر sale_type = piece"
);
ok(
  !/embedded_weight|parsed\.weight/.test(code("components/pos/POSProductPanel.tsx")),
  "والكاشير مفيهوش باركود ميزان"
);
ok(!/الوزن \(كجم\)|isWeight/.test(code("components/pos/OrderItemRow.tsx")), "والسلة مفيهاش خانة وزن");
// مفيش «بائع» (النادل مش بائع بعمولة) — بس الديليفري **مسموح**
ok(!/seller/.test(assignable), "ASSIGNABLE_ROLES مفيهاش «بائع» (النادل مش بائع بعمولة)");
ok(
  !/role\s*=\s*'seller'/.test(code("electron/repositories/orders.repository.ts")),
  "والبيع مابيسجّلش لقطة البائعين الحاضرين"
);
// النادل مايشوفش فلوس على شاشة الصالة
ok(!/time_revenue|إيراد/.test(code("app/(main)/tables/page.tsx")), "شاشة الصالة مفيهاش إيراد");

console.log(failed === 0 ? "\n✅ هيكل المطعم كامل" : `\n❌ ${failed} فحص فشل`);
process.exit(failed === 0 ? 0 : 1);
