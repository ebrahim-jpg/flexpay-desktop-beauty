// اختبار التوصيل — الأهم: سعر التوصيل **مايدخلش أي حساب مالي** (total/amount_paid/الإيراد).
// تشغيل: node scripts/run-electron.js scripts/test-delivery.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase } = require(path.join(base, "database", "connection.js"));
const { ordersRepository } = require(path.join(base, "repositories", "orders.repository.js"));
const { settingsRepository } = require(path.join(base, "repositories", "settings.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-deliv-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  db.prepare("UPDATE settings SET tax_rate = 0 WHERE id = 1").run();

  // منطقة توصيل بسعر 20
  settingsRepository.update({ deliveryZones: [{ id: "z1", name: "قريب", price: 20 }] }, null);
  ok(settingsRepository.getDeliveryZone("z1")?.price === 20, "منطقة التوصيل اتحفظت بسعر 20");

  // seed
  const cash = db.prepare("INSERT INTO users (local_id,name,username,role,is_active) VALUES ('u-c','كاشير','c','cashier',1)").run();
  const cashierId = Number(cash.lastInsertRowid);
  const dlv = db.prepare("INSERT INTO users (local_id,name,username,role,is_active) VALUES ('u-d','دليفري علي','d','delivery',1)").run();
  const deliveryId = Number(dlv.lastInsertRowid);
  const cust = db.prepare("INSERT INTO customers (local_id,name,phone) VALUES ('cu-1','زبون','01000000000')").run();
  const customerId = Number(cust.lastInsertRowid);
  const prod = db.prepare("INSERT INTO products (local_id,name,price,is_active,is_available,cost_price,sale_type,modifiers) VALUES ('p1','منتج',100,1,1,0,'piece','[]')").run();
  const productId = Number(prod.lastInsertRowid);

  // أوردر توصيل: منتج 100 + توصيل 20 (لمنطقة قريب) + دليفري علي
  const { order } = ordersRepository.create(
    {
      items: [{ product_id: productId, quantity: 1, modifier_option_ids: [], notes: "" }],
      customer_id: customerId,
      is_guest: false,
      order_type: "delivery",
      discount_type: "none",
      discount_value: 0,
      payment_method: "cash",
      amount_paid: 100, // العميل بيدفع للمحل قيمة الطلب بس (التوصيل بيخص الدليفري)
      delivery_zone_id: "z1",
      delivery_person_id: deliveryId,
    },
    cashierId,
    "كاشير"
  );

  console.log("== استبعاد التوصيل من الفلوس ==");
  ok(order.total === 100, `الإجمالي = ${order.total} (100 — من غير التوصيل)`);
  ok(order.amount_paid === 100, `المدفوع = ${order.amount_paid} (100 — التوصيل مش مضاف)`);
  ok(order.subtotal === 100, `المجموع الفرعي = ${order.subtotal} (100)`);
  ok(order.change_amount === 0, `الباقي = ${order.change_amount} (0)`);

  console.log("== بيانات التوصيل محفوظة (للعرض/الفاتورة) ==");
  ok(order.delivery_fee === 20, `سعر التوصيل = ${order.delivery_fee} (20 — محفوظ للعرض)`);
  ok(order.delivery_zone === "قريب", `المنطقة = ${order.delivery_zone}`);
  ok(order.delivery_person_id === deliveryId, "الدليفري متسجّل على الطلب");
  ok(order.delivery_person_name === "دليفري علي", `اسم الدليفري = ${order.delivery_person_name}`);

  console.log("== قاعدة البيانات: total مش فيه التوصيل ==");
  const row = db.prepare("SELECT total, amount_paid, delivery_fee FROM orders WHERE id = ?").get(order.id);
  ok(row.total === 100 && row.delivery_fee === 20, `DB: total=${row.total} delivery_fee=${row.delivery_fee} (منفصلين)`);

  console.log("== المزامنة: الويب هيستلم total=100 (بدون توصيل) ==");
  const sq = db.prepare("SELECT payload FROM sync_queue WHERE entity_type='order'").all();
  const p = JSON.parse(sq[sq.length - 1].payload);
  ok(p.total === 100, `payload.total = ${p.total} (100)`);
  ok(p.delivery_fee === 20, "payload فيه delivery_fee للعرض (بس مش في total)");

  console.log("== طلب عادي: مفيش توصيل ==");
  const { order: counter } = ordersRepository.create(
    { items: [{ product_id: productId, quantity: 1, modifier_option_ids: [], notes: "" }], customer_id: null, is_guest: true, order_type: "counter", discount_type: "none", discount_value: 0, payment_method: "cash", amount_paid: 100 },
    cashierId, "كاشير"
  );
  ok(counter.delivery_fee === 0 && counter.delivery_person_id === null, "الطلب العادي مالوش توصيل");

  console.log(process.exitCode ? "\n❌ فيه فشل" : "\n✅ التوصيل معزول تماماً عن فلوس المحل + بياناته محفوظة للفاتورة");
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message, err.stack);
  process.exit(1);
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}
