// حارس «خدمات بس» — فحص ثابت (بلا إلكترون).
// التشغيل: node scripts/verify-no-retail.js
//
// سياسة الشركة: نسخة التجميل **للخدمات بس**. اللي عايز يبيع كريمات وبضاعة بياخد
// نسخة البيع بالتجزئة. فأي رجوع لبيع البضاعة هنا = إيراد نسخة ضايع + نسخة بقت
// معقّدة على الحلاق.
//
// والنسخة fork من المطعم، فأي دمج أو نسخ من الأصل بيرجّع الحاجات دي **بصمت**:
// شاشة كاشير · متجر أونلاين · «بيع سريع» لمشروب · أيقونات أكل.
//
// ⚠️ الفحص على **الغياب** أصعب من الوجود: ملف مش موجود بيخلّي أي regex سالب
// يعدّي. فكل فحص هنا بيتأكد الأول إن اللي بيقرا منه **موجود فعلاً**.
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

// الفحص على الكود مش على التعليقات (التعليقات بتشرح اللي اتشال بالاسم)
function code(rel) {
  return read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:"'`\w])\/\/.*$/, "$1"))
    .join("\n");
}
/** فحص سالب **بحارس وجود**: الملف لازم يكون موجود، وإلا الفحص وهمي */
const mustNotContain = (rel, re, msg) => {
  if (!exists(rel)) {
    ok(false, `${msg} — ⚠️ الملف ${rel} **مش موجود**، فالفحص كان هيعدّي على الفاضي`);
    return;
  }
  ok(!re.test(code(rel)), msg);
};

console.log("— مفيش شاشة كاشير —");
for (const gone of [
  "app/(main)/pos",
  "components/pos",
  "components/gaming/QuickSaleDialog.tsx",
  "hooks/usePosShortcuts.ts",
  "store/cart.store.ts",
  "store/pos-ui.store.ts",
  "shared/shortcuts.ts",
]) {
  ok(!exists(gone), `${gone} اتمسح`);
}
// القطع المشتركة بين الكاشير والكراسي اتنقلت لفولدر اسمه مابيكدبش
for (const kept of ["CustomerSearch", "ReceiptModal", "FreeRecipientModal", "ProductCard", "ModifierModal"]) {
  ok(exists(`components/sales/${kept}.tsx`), `components/sales/${kept}.tsx موجود (اتنقل من pos)`);
}
mustNotContain("app/(main)/tables/page.tsx", /components\/pos\//, "وشاشة الكراسي مابتستوردش من pos");
// ⚠️ `ordersRepository.create` **لازم تفضل** — حساب الجلسة ماشي عليها
ok(/create\(/.test(read("electron/repositories/orders.repository.ts")), "`ordersRepository.create` لسه موجودة (حساب الجلسة عليها)");
mustNotContain("electron/ipc/orders.ipc.ts", /"orders:create"/, "بس قناة `orders:create` اتشالت (الكاشير كان الوحيد اللي بينداها)");

console.log("\n— مفيش متجر بضاعة —");
for (const gone of [
  "app/(main)/store-orders",
  "shared/online-orders.ts",
  "store/online-orders.store.ts",
  "electron/repositories/online-orders.repository.ts",
  "electron/ipc/online-orders.ipc.ts",
  "scripts/test-online-order-cancel.js",
]) {
  ok(!exists(gone), `${gone} اتمسح`);
}
mustNotContain("electron/ipc/index.ts", /OnlineOrders/, "ومابيتسجّلش في الـIPC");
mustNotContain("electron/preload.ts", /online-orders:new/, "وحدث الطلبات اتشال من الأحداث المسموحة");
mustNotContain("electron/lib/printer.ts", /printOnlineOrderTicket/, "وتذكرة تجهيز الطلب اتشالت من الطابعة");
mustNotContain("components/shared/nav-items.ts", /store-orders|\/pos/, "ومفيش عناصر تنقّل للكاشير ولا المتجر");

console.log("\n— 🔴 الحجز لسه عايش (أخطر بند في الشيل) —");
// الحجز كان **راكب على نفس قناة سحب طلبات المتجر** (SYNC-CONTRACT §45-76):
// endpoint واحد وجسم ورد واحد. فشيل الطلبات بالطريقة الساذجة كان هيقتل الحجز.
const engine = code("electron/sync/sync-engine.ts");
ok(engine.length > 0, "محرك المزامنة موجود");
ok(/pullBookings/.test(engine), "دالة السحب بقت `pullBookings` (الاسم مابيكدبش)");
ok(!/onlineOrdersRepository/.test(engine), "ومافيهاش ريبو الطلبات");
ok(/bookingAck/.test(engine) && /bookingDecisions/.test(engine), "**وبترفع تأكيد الحجز وقرارات الموظف**");
ok(/bookingsSupported/.test(engine), "ومابتعلّمش القرار «اترفع» غير لما السيرفر يأكّد");
ok(/roomBookingsRepository\.upsertPulled/.test(engine), "وبتنزّل الحجوزات الجديدة");
ok(/onNewBookings/.test(engine), "وبتنبّه عليها");
const http = code("electron/sync/http-client.ts");
ok(/\/api\/sync\/pull/.test(http), "والـendpoint زي ما هو `/api/sync/pull`");
ok(/bookings/.test(http) && /bookingsSupported/.test(http), "وعميل الـHTTP بيعرف حقول الحجز");
ok(!/PulledOnlineOrder/.test(http), "ومافيهوش حقول الطلبات");
ok(exists("app/(main)/bookings/page.tsx"), "وصفحة «طلبات الحجز» موجودة");
ok(/\/bookings/.test(code("components/shared/nav-items.ts")), "وفي التنقّل");
ok(exists("electron/ipc/room-bookings.ipc.ts"), "وقنوات الحجز موجودة");

console.log("\n— مفيش دمج ولا تقسيم —");
// الدمج كان بيمسح نصيب حلاق: مفتاح تجميع البنود عنده ماكانش فيه `staff_id`
const repo = code("electron/repositories/gaming.repository.ts");
ok(repo.length > 0, "ريبو الجلسات موجود");
for (const gone of ["mergeSessions", "splitCheckout", "quoteSplit", "pickSplit"]) {
  ok(!new RegExp(gone).test(repo), `مفيش ${gone}`);
}
ok(/transferSession/.test(repo), "والنقل لسه موجود (آمن — بيغيّر الكرسي بس)");
ok(!exists("components/gaming/SplitBillDialog.tsx"), "وديالوج التقسيم اتمسح");

console.log("\n— مفيش أيقونة أكل —");
// ٢٤ من ٣٤ أيقونة فئة كانت أكل، وعلامة الشريط الجانبي كانت **فنجان قهوة**
const FOOD = /\b(Pizza|Beer|Wine|Soup|Fish|Beef|Drumstick|Croissant|Donut|IceCreamCone|Sandwich|Popcorn|Cookie|CakeSlice|Candy|Salad|Egg|Milk|CupSoda|GlassWater|Coffee|Utensils|UtensilsCrossed|ChefHat|Wheat|Carrot|Apple)\b/;
for (const f of [
  "components/shared/icons.tsx",
  "components/shared/nav-items.ts",
  "components/shared/AppSidebar.tsx",
  "app/(main)/tables/page.tsx",
  "app/(main)/bookings/page.tsx",
  "components/inventory/RecipesTab.tsx",
]) {
  mustNotContain(f, FOOD, `${f} مافيهوش أيقونة أكل`);
}
ok(/Scissors/.test(code("components/shared/AppSidebar.tsx")), "وعلامة الشريط الجانبي مقص");
ok(/Armchair/.test(code("components/shared/nav-items.ts")), "وأيقونة «الكراسي» كرسي");

console.log("\n— مفيش مطبخ ولا توصيل في الإعدادات —");
mustNotContain("components/settings/ReceiptSettings.tsx", /المطبخ/, "مفيش «طابعة المطبخ» في الإعدادات");
mustNotContain("components/settings/ReceiptSettings.tsx", /كافيه النجوم/, "ونموذج اسم المحل مش «كافيه النجوم»");
ok(!exists("components/settings/DeliveryZonesEditor.tsx"), "ومحرر مناطق التوصيل اتمسح");

console.log("\n— الخدمات مش منتجات —");
// 🔴 القفل في الـ**main** مش في الواجهة: فيه تلات أبواب بتوصل للريبو من غير
// ما تعدّي على المودال (برنامج تاني · سكربت · **استيراد إكسل**).
const prodRepo = code("electron/repositories/products.repository.ts");
ok(/is_service: 1,/.test(prodRepo), "الريبو بيثبّت `is_service = 1` في الإنشاء");
ok(
  /params\.is_service = 1;/.test(prodRepo),
  "و`update` بيرفض ترجّعه بضاعة"
);
ok(
  /is_service: true,/.test(code("electron/lib/data-transfer/import.ts")),
  "واستيراد الإكسل بيفرض خدمة (كان **مابيبعتهاش خالص**)"
);
mustNotContain(
  "electron/lib/data-transfer/excel.ts",
  /بيبسي|طماطم/,
  "وقالب الاستيراد مش بيوزّع «بيبسي» و«طماطم»"
);
mustNotContain("components/products/ProductModal.tsx", /SizesBuilder|الباركود/, "ومودال الخدمة مافيهوش أحجام ولا باركود");
ok(!exists("components/products/SizesBuilder.tsx") || !/SizesBuilder/.test(code("components/products/ProductModal.tsx")), "والأحجام مش موصّلة");
ok(/الخدمات/.test(code("components/shared/nav-items.ts")), "والتنقّل بيقول «الخدمات»");

console.log("\n— migration 038: الكراسي مش غرف —");
// 🔴 `032_tables.ts` حطّ `kind` بافتراضي `'room'` **ومفيش backfill**، والقراية
// كلها `WHERE kind='table'` → قاعدة مترقّية = **صفر كراسي بلا رسالة**.
const mig = read("electron/database/migrations/038_beauty_chairs_backfill.ts");
ok(mig.length > 0, "migration 038 موجودة");
ok(/UPDATE gaming_rooms SET kind = 'table'/.test(mig), "بتصحّح `kind` للكراسي");
ok(/UPDATE products SET is_service = 1/.test(mig), "وبتختم البنود القديمة خدمات");
ok(/migration_038/.test(read("electron/database/migrations/index.ts")), "ومسجّلة في السلسلة");

console.log(failed ? `\n❌ ${failed} فحص فشل` : "\n✅ النسخة خدمات بس — مفيش أثر تجزئة");
process.exit(failed ? 1 : 0);
