// حارس هيكل **الأحجام** (فحص ثابت — بلا إلكترون).
// التشغيل: node scripts/verify-sizes-shell.js
//
// المشكلة اللي بيحرسها: الحجم **بديل سعر مش زيادة**، ووصفته خاصة بيه. أي مسار بيرجع
// لـ`product.price + adjustments` أو بيبيع منتج `has_sizes` بلا `variant_id` = رجوع
// للباج الأصلي (سعر السمول بياخد زيادة تانية، وتلات وصفات بتتخصم مع كل بيعة).
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

// الفحص على الكود مش على التعليقات (التعليقات بتشرح الباج القديم بالنص)
function code(rel) {
  return read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:"'`\w])\/\/.*$/, "$1"))
    .join("\n");
}

console.log("— الملفات —");
for (const rel of [
  "electron/database/migrations/035_product_sizes.ts",
  "electron/repositories/sizes.repository.ts",
  "shared/sizes.ts",
  "components/pos/SizePicker.tsx",
  "components/products/SizesBuilder.tsx",
]) {
  ok(exists(rel), `${rel} موجود`);
}

console.log("\n— التسعير: بديل مش زيادة —");
const orders = code("electron/repositories/orders.repository.ts");
ok(
  /const basePrice = size \? size\.price : product\.price/.test(orders),
  "سعر البند بيبدأ من سعر الحجم (basePrice) مش من سعر المنتج"
);
ok(
  !/unit_price = product\.price \+ adjustments/.test(orders),
  "**ومفيش أي مسار لسه بيحسب product.price + adjustments** (ده الباج الأصلي)"
);
ok(
  /has_sizes === 1 && !size/.test(orders),
  "منتج بأحجام بلا حجم = مرفوض (الحارس على has_sizes مش على عدّ الأحجام)"
);
ok(/activeCount\(product\.id\) === 0/.test(orders), "وكل الأحجام موقوفة ليها رسالة لوحدها");
ok(/variant_cost_price/.test(orders), "ولقطة تكلفة البند بتتحفظ (COGS)");

console.log("\n— المخزون: وصفة الحجم بس —");
const inv = code("electron/repositories/inventory.repository.ts");
ok(
  /variant_id IS NULL \$\{vid == null \? "" : "OR variant_id = @vid"\}/.test(inv),
  "الخصم بيجيب المشترك + وصفة الحجم المباع بس"
);
ok(/modifierConsumptions/.test(inv), "والإضافات اللي بتخصم مواد بتتخصم بنفس الدالة النقية");
ok(/canMakeAnySize/.test(inv), "والإتاحة = فيه حجم واحد على الأقل ينفع يتعمل");
const products = code("electron/repositories/products.repository.ts");
ok(
  /variantId: number \| null = null/.test(products),
  "حفظ الوصفة بنطاق (حجم/مشترك) — حفظ حجم مابيمسحش التاني"
);

console.log("\n— الواجهات —");
const panel = code("components/pos/POSProductPanel.tsx");
ok(/product\.has_sizes/.test(panel) && /SizePicker/.test(panel), "الكاشير بيطلب الحجم قبل الخيارات");
const drinks = code("components/gaming/AddDrinksDialog.tsx");
ok(/SizePicker/.test(drinks) && /variant_id/.test(drinks), "والصالة كذلك");
const gaming = code("electron/repositories/gaming.repository.ts");
ok(
  (gaming.match(/COALESCE\(variant_id, 0\)/g) ?? []).length >= 2,
  "الحجم في مفتاح تجميع بنود الحساب **وفي الدمج** (وإلا سمول ولارج يتلمّوا في بند واحد)"
);
const checkout = code("components/pos/CheckoutModal.tsx");
ok(/variant_id: i\.variantId/.test(checkout), "التقفيل بيبعت الحجم للـMain");
ok(/size: it\.variant_size/.test(checkout), "وتذكرة المطبخ بتاخد الحجم");
const printer = code("electron/lib/printer.ts");
ok(/it\.size \? ` — \$\{esc\(it\.size\)\}` : ""/.test(printer), "والتذكرة بتطبع الحجم جنب الصنف");
ok(/opts\.length \? `<div class="inote">\+ /.test(printer), "والإضافات المختارة كمان");

console.log("\n— المزامنة —");
const sizes = code("electron/repositories/sizes.repository.ts");
ok(/price_override: v\.price_override/.test(sizes), "بيبعت price_override (الاسم اللي الويب بيعرفه)");
ok(!/stock_qty/.test(sizes), "**وبلا stock_qty خالص** — الرصيد في المواد مش على الحجم");
ok(/has_sizes: p\.has_sizes === 1/.test(sizes), "و has_sizes بيتبعت");

console.log(failed ? `\n❌ ${failed} فحص فشل` : "\n✅ هيكل الأحجام سليم");
process.exit(failed ? 1 : 0);
