// حارس هيكل نسخة «التجميل والحلاقة» (فحص ثابت — بلا إلكترون).
// التشغيل: node scripts/verify-beauty-shell.js
//
// النسخة دي fork من **المطعم**، فأي دمج أو نسخ بيرجّع حاجات المطعم بصمت:
// تذكرة المطبخ · التوصيل · أدوار الطباخ والديليفري. والحارس ده بيمسكهم في ثانية.
//
// وبيحرس كمان **أخطر حاجة في المجال**: إسناد الحلاق إجباري والعمولة بتتحسب منه.
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

console.log("— الهوية والعزل —");
const pkg = JSON.parse(read("package.json"));
ok(pkg.name === "flexpay-desktop-beauty", `package name = ${pkg.name}`);
ok(/APP_NAME = "flexpay-desktop-beauty"/.test(read("electron/main.ts")), "مجلد البيانات معزول (APP_NAME)");
ok(/com\.flexpay\.beauty/.test(read("electron-builder.config.js")), "appId خاص بالتجميل");
ok(/VERTICAL = "beauty"/.test(code("electron/ipc/backup.ipc.ts")), "النسخة الاحتياطية بتقبل ختم beauty بس");
ok(
  /vertical = 'beauty'/.test(read("electron/database/migrations/037_beauty_vertical.ts")),
  "migration 037 بيختم المجال"
);

console.log("\n— مفيش أي أثر للمطبخ —");
const KITCHEN_FILES = ["electron/lib/printer.ts", "electron/ipc/orders.ipc.ts", "electron/ipc/gaming.ipc.ts"];
for (const f of KITCHEN_FILES) {
  ok(!/printKitchenTicket|kitchen:printTicket|sendToKitchen/.test(code(f)), `${f} نضيف من المطبخ`);
}
ok(
  !/pendingKitchenItems|markKitchenSent/.test(code("electron/repositories/gaming.repository.ts")),
  "والريبو مافيهوش دوال الدفعات"
);
ok(!exists("scripts/test-kitchen-batches.js"), "واختبارات المطبخ اتشالت");
const drinks = code("components/gaming/AddDrinksDialog.tsx");
ok(!/kitchen|المطبخ/.test(drinks), "وشاشة الجلسة مافيهاش أي حاجة للمطبخ");

console.log("\n— مفيش توصيل —");
ok(!exists("components/settings/DeliveryZonesEditor.tsx"), "محرر مناطق التوصيل اتمسح");
ok(!/DeliveryZonesEditor/.test(code("app/(main)/settings/page.tsx")), "وتبويبه اتشال من الإعدادات");
ok(!/setOrderType\("delivery"\)/.test(code("components/pos/POSHeader.tsx")), "ومفيش نوع «توصيل» في الكاشير");

console.log("\n— الأدوار —");
const perms = read("shared/permissions.ts");
ok(/"stylist"/.test(perms), "دور الحلاق موجود");
const assignable = /ASSIGNABLE_ROLES: Role\[\] = \[([^\]]*)\]/.exec(perms)?.[1] ?? "";
ok(/stylist/.test(assignable), "وبيتعيّن للموظفين");
ok(!/chef|delivery|waiter|seller/.test(assignable), `والأدوار الموروثة مابتتعيّنش (الحالي: ${assignable.trim()})`);
const login = /LOGIN_ROLES: Role\[\] = \[([^\]]*)\]/.exec(perms)?.[1] ?? "";
ok(/stylist/.test(login), "والحلاق بيسجّل دخول (بيفتح جلسات)");

console.log("\n— إسناد الحلاق: أخطر بند —");
const repo = code("electron/repositories/gaming.repository.ts");
ok(/staff_id: number;/.test(read("shared/gaming.ts")), "`staff_id` **إجباري** في فتح الجلسة (مش اختياري)");
ok(/private staffRow\(/.test(repo), "والتحقق منه في الريبو مش في الواجهة بس");
ok(/moqof|موقوف/.test(repo) || /is_active !== 1/.test(repo), "وبيرفض الموظف الموقوف");
ok(/COALESCE\(staff_id, 0\)/.test(repo), "والحلاق **جزء من مفتاح تجميع البنود** (وإلا العمولة تروح لواحد)");
ok(/staffShares/.test(repo), "والعمولة بتتحسب من بنود كل حلاق");
ok(
  /input\.sellers/.test(code("electron/repositories/orders.repository.ts")),
  "وبتتكتب في order_sellers مع الفاتورة"
);
ok(/stylistPerformance/.test(repo), "وتقرير الأداء موجود");

console.log("\n— الخدمة —");
ok(/is_service/.test(read("shared/products.ts")), "نوع «خدمة» في المنتج");
ok(/is_service/.test(code("components/products/ProductModal.tsx")), "وبيتحدد من مودال المنتج");
ok(/p\.is_service/.test(code("components/pos/POSProductPanel.tsx")), "وفلتر خدمات/منتجات في الكاشير");
ok(exists("components/beauty/QuickSessionDialog.tsx"), "والجلسة السريعة موجودة");
ok(exists("components/beauty/StaffPicker.tsx"), "ومنتقي الحلاق");

console.log(failed ? `\n❌ ${failed} فحص فشل` : "\n✅ هيكل التجميل سليم");
process.exit(failed ? 1 : 0);
