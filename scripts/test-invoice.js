// اختبار end-to-end حقيقي لفاتورة التوريد على قاعدة فعلية.
// تشغيل: node scripts/run-electron.js scripts/test-invoice.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase } = require(path.join(base, "database", "connection.js"));
const { purchasesRepository } = require(path.join(base, "repositories", "purchases.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-inv-"));
try {
  initDatabase(dir);
  const db = getDatabase();

  // seed: مدير + كاشير + مورد + مادتين
  const mgr = db
    .prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u-mgr','مدير سمير','mgr','manager',1)")
    .run();
  const managerId = Number(mgr.lastInsertRowid);
  const cash = db
    .prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u-cash','كاشير أحمد','cash','cashier',1)")
    .run();
  const cashierId = Number(cash.lastInsertRowid);
  const sup = db
    .prepare("INSERT INTO suppliers (local_id, name) VALUES ('s-1','مخبز النور')")
    .run();
  const supplierId = Number(sup.lastInsertRowid);
  const i1 = db
    .prepare("INSERT INTO inventory_items (local_id, name, unit, alert_threshold, current_quantity, cost_per_unit) VALUES ('it-1','دقيق','كيلو',5,0,4)")
    .run();
  const item1 = Number(i1.lastInsertRowid);
  const i2 = db
    .prepare("INSERT INTO inventory_items (local_id, name, unit, alert_threshold, current_quantity, cost_per_unit) VALUES ('it-2','سكر','كيلو',5,0,5)")
    .run();
  const item2 = Number(i2.lastInsertRowid);

  // فاتورة كاش: دقيق 10×5=50 + سكر 4×5=20 = 70. خرج 30 من درج الكاشير. الباقي 40 من المالك.
  const inv = purchasesRepository.createInvoice(
    {
      reference: "INV-1",
      supplier_id: supplierId,
      payment_type: "cash",
      drawer_amount: 30,
      drawer_owner_id: cashierId,
      items: [
        { inventory_item_id: item1, quantity: 10, unit_cost: 5 },
        { inventory_item_id: item2, quantity: 4, unit_cost: 5 },
      ],
    },
    managerId
  );

  ok(inv.total_cost === 70, `إجمالي الفاتورة = ${inv.total_cost} (70)`);
  ok(inv.paid_amount === 70, `المدفوع = ${inv.paid_amount} (70 كاش)`);
  ok(inv.items.length === 2, `عدد البنود = ${inv.items.length} (2)`);
  ok(inv.drawer_owner_id === cashierId, "صاحب الدرج = الكاشير");

  // المخزون اتزاد
  const q1 = db.prepare("SELECT current_quantity AS q, supplier_id AS s FROM inventory_items WHERE id=?").get(item1);
  const q2 = db.prepare("SELECT current_quantity AS q, supplier_id AS s FROM inventory_items WHERE id=?").get(item2);
  ok(q1.q === 10, `دقيق: 0 → ${q1.q} (10)`);
  ok(q2.q === 4, `سكر: 0 → ${q2.q} (4)`);
  ok(q1.s === supplierId && q2.s === supplierId, "المواد اتحدّثت لمورد الفاتورة");

  // مصروف واحد منسوب لدرج الكاشير + recorded_by للمدير
  const exp = db.prepare("SELECT * FROM expenses WHERE category='inventory' AND is_deleted=0").all();
  ok(exp.length === 1, `مصروف واحد للفاتورة (${exp.length})`);
  const e = exp[0];
  ok(e.amount === 70, `المصروف amount = ${e.amount} (70 تكلفة كاملة)`);
  ok(e.drawer_amount === 30, `drawer_amount = ${e.drawer_amount} (30)`);
  ok(e.owner_paid_amount === 40, `owner_paid_amount = ${e.owner_paid_amount} (40 من المالك)`);
  ok(e.created_by === cashierId, "created_by = الكاشير (تقفيل درجه صح) — مش المدير");
  ok(e.recorded_by_id === managerId, "recorded_by_id = المدير (تدقيق)");

  // درج الكاشير: مجموع drawer_amount المنسوب له = 30
  const drawerSum = db
    .prepare("SELECT COALESCE(SUM(drawer_amount),0) AS s FROM expenses WHERE created_by=? AND is_deleted=0")
    .get(cashierId);
  ok(drawerSum.s === 30, `درج الكاشير ناقص 30 (${drawerSum.s}) — البَج اتصلّح`);
  const mgrDrawer = db
    .prepare("SELECT COALESCE(SUM(drawer_amount),0) AS s FROM expenses WHERE created_by=? AND is_deleted=0")
    .get(managerId);
  ok(mgrDrawer.s === 0, `درج المدير متأثرش (${mgrDrawer.s} = 0)`);

  // مزامنة الويب: حدث purchase_invoice في الطابور + البنود مضمّنة
  const sq = db
    .prepare("SELECT entity_type, event_type, payload FROM sync_queue WHERE entity_type='purchase_invoice'")
    .all();
  ok(sq.length === 1, `حدث مزامنة purchase_invoice واحد (${sq.length})`);
  const p = JSON.parse(sq[0].payload);
  ok(p.id === inv.id && p.total_cost === 70, "payload فيه id + total_cost");
  ok(p.supplier_id === supplierId, "payload فيه supplier_id (هيتحوّل لـ supplier_desktop_id)");
  ok(p.drawer_owner_id === cashierId, "payload فيه drawer_owner_id");
  ok(p.created_by === managerId, "payload فيه created_by");
  ok(Array.isArray(p.items) && p.items.length === 2, `البنود مضمّنة (${p.items?.length})`);
  ok(
    p.items[0].inventory_item_id === item1 && p.items[0].line_cost === 50,
    "بند فيه inventory_item_id + line_cost"
  );

  console.log(process.exitCode ? "\n❌ فيه فشل" : "\n✅ فاتورة التوريد سليمة end-to-end + المزامنة جاهزة");
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message);
  process.exit(1);
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}
