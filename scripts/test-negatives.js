// اختبار حماية السوالب — يتأكد إن كل نقاط الإدخال الرقمية بترفض السالب/NaN
// وإن القيم الموجبة لسه شغّالة. تشغيل: node scripts/run-electron.js scripts/test-negatives.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase } = require(path.join(base, "database", "connection.js"));
const { ordersRepository } = require(path.join(base, "repositories", "orders.repository.js"));
const { expensesRepository } = require(path.join(base, "repositories", "expenses.repository.js"));
const { productsRepository } = require(path.join(base, "repositories", "products.repository.js"));
const { inventoryRepository } = require(path.join(base, "repositories", "inventory.repository.js"));
const { purchasesRepository } = require(path.join(base, "repositories", "purchases.repository.js"));
const { settingsRepository } = require(path.join(base, "repositories", "settings.repository.js"));

let pass = 0;
let fail = 0;
function rejects(fn, label) {
  try {
    fn();
    console.log(`✗ FAIL ${label} — اتقبلت والمفروض ترفض!`);
    fail++;
    process.exitCode = 1;
  } catch {
    console.log(`✓ ${label} — اترفضت صح`);
    pass++;
  }
}
function accepts(fn, label) {
  try {
    fn();
    console.log(`✓ ${label} — اتقبلت صح`);
    pass++;
  } catch (e) {
    console.log(`✗ FAIL ${label} — اترفضت بالغلط: ${e.message}`);
    fail++;
    process.exitCode = 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-neg-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  db.prepare("UPDATE settings SET tax_rate = 0 WHERE id = 1").run(); // نبسّط الحساب

  const cash = db
    .prepare("INSERT INTO users (local_id,name,username,role,is_active) VALUES ('u','كاشير','c','cashier',1)")
    .run();
  const cashierId = Number(cash.lastInsertRowid);
  const prod = db
    .prepare("INSERT INTO products (local_id,name,price,is_active,is_available,cost_price,sale_type,modifiers) VALUES ('p1','شاي',10,1,1,0,'piece','[]')")
    .run();
  const productId = Number(prod.lastInsertRowid);

  const baseOrder = {
    items: [{ product_id: productId, quantity: 1, modifier_option_ids: [], notes: "" }],
    customer_id: null,
    is_guest: true,
    order_type: "counter",
    discount_type: "none",
    discount_value: 0,
    payment_method: "cash",
    amount_paid: 100,
    is_free: false,
  };

  console.log("== الكاشير ==");
  accepts(() => ordersRepository.create({ ...baseOrder }, cashierId, "كاشير"), "بيع عادي موجب");
  rejects(
    () => ordersRepository.create({ ...baseOrder, discount_type: "fixed", discount_value: -50 }, cashierId, "كاشير"),
    "خصم سالب"
  );
  rejects(() => ordersRepository.create({ ...baseOrder, amount_paid: -10 }, cashierId, "كاشير"), "مدفوع سالب");
  rejects(
    () => ordersRepository.create({ ...baseOrder, items: [{ product_id: productId, quantity: -3, modifier_option_ids: [], notes: "" }] }, cashierId, "كاشير"),
    "كمية سالبة"
  );
  rejects(
    () => ordersRepository.create({ ...baseOrder, items: [{ product_id: productId, quantity: NaN, modifier_option_ids: [], notes: "" }] }, cashierId, "كاشير"),
    "كمية NaN"
  );

  console.log("== المصاريف ==");
  accepts(() => expensesRepository.create({ category: "other", description: "كهربا", amount: 100 }, cashierId, "كاشير"), "مصروف موجب");
  rejects(() => expensesRepository.create({ category: "other", description: "سرقة", amount: -100 }, cashierId, "كاشير"), "مصروف سالب");
  rejects(() => expensesRepository.create({ category: "other", description: "صفر", amount: 0 }, cashierId, "كاشير"), "مصروف صفر");

  console.log("== المنتجات ==");
  rejects(() => productsRepository.create({ name: "مسروق", price: -5 }, cashierId), "منتج بسعر سالب");
  accepts(() => productsRepository.create({ name: "سليم", price: 5 }, cashierId), "منتج بسعر موجب");

  console.log("== المخزون ==");
  rejects(() => inventoryRepository.create({ name: "أ", unit: "كيلو", current_quantity: -5, alert_threshold: 5, waste_percentage: 2, cost_per_unit: 4 }, cashierId), "مخزون كمية سالبة");
  rejects(() => inventoryRepository.create({ name: "ب", unit: "كيلو", current_quantity: 5, alert_threshold: 5, waste_percentage: 2, cost_per_unit: -4 }, cashierId), "مخزون تكلفة سالبة");
  rejects(() => inventoryRepository.create({ name: "ج", unit: "كيلو", current_quantity: 5, alert_threshold: 5, waste_percentage: 150, cost_per_unit: 4 }, cashierId), "تهدير أكبر من 100");
  let item;
  accepts(() => { item = inventoryRepository.create({ name: "سكر", unit: "كيلو", current_quantity: 10, alert_threshold: 5, waste_percentage: 2, cost_per_unit: 5 }, cashierId); }, "مخزون سليم");
  rejects(() => inventoryRepository.restock(item.id, -5, null, cashierId), "توريد كمية سالبة");

  console.log("== الوصفات ==");
  const p2 = productsRepository.create({ name: "عصير", price: 15 }, cashierId);
  rejects(() => productsRepository.saveRecipe(p2.id, [{ inventory_item_id: item.id, standard_qty: -1 }], cashierId), "وصفة كمية سالبة");

  console.log("== فواتير التوريد ==");
  rejects(() => purchasesRepository.createInvoice({ payment_type: "cash", items: [{ inventory_item_id: item.id, quantity: 5, unit_cost: -3 }] }, cashierId), "توريد تكلفة سالبة");

  console.log("== الإعدادات ==");
  rejects(() => settingsRepository.update({ taxRate: -10 }, cashierId), "ضريبة سالبة");
  rejects(() => settingsRepository.update({ lowStockThreshold: -5 }, cashierId), "حد مخزون سالب");

  console.log(`\n${fail ? "❌ فيه فشل" : "✅ كل السوالب اترفضت والموجب شغّال"} — ${pass} نجح / ${fail} فشل`);
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message, err.stack);
  process.exit(1);
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}
