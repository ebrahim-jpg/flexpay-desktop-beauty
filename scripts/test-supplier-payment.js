// اختبار e2e: دفعة المورد اللي خرجت من الدرج بتتنسب لوردية الكاشير مش المدير.
// تشغيل: node scripts/run-electron.js scripts/test-supplier-payment.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase } = require(path.join(base, "database", "connection.js"));
const { suppliersRepository } = require(path.join(base, "repositories", "suppliers.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-pay-"));
try {
  initDatabase(dir);
  const db = getDatabase();

  const mgr = Number(
    db.prepare("INSERT INTO users (local_id,name,username,role,is_active) VALUES ('u-mgr','مدير سمير','mgr','manager',1)").run().lastInsertRowid
  );
  const cashier = Number(
    db.prepare("INSERT INTO users (local_id,name,username,role,is_active) VALUES ('u-cash','كاشير أحمد','cash','cashier',1)").run().lastInsertRowid
  );
  const supplierId = Number(
    db.prepare("INSERT INTO suppliers (local_id,name,balance) VALUES ('s-1','مخبز النور',200)").run().lastInsertRowid
  );

  // دفعة 100، منهم 30 خرجت من درج الكاشير. المدير هو اللي سجّل.
  suppliersRepository.recordPayment(
    { supplier_id: supplierId, amount: 100, drawer_amount: 30, drawer_owner_id: cashier },
    mgr,
    "مدير سمير"
  );

  const exp = db.prepare("SELECT * FROM expenses WHERE description LIKE 'دفعة لمورد%' AND is_deleted=0").all();
  ok(exp.length === 1, `مصروف دفعة واحد (${exp.length})`);
  const e = exp[0];
  ok(e.amount === 100, `amount = ${e.amount} (100)`);
  ok(e.drawer_amount === 30, `drawer_amount = ${e.drawer_amount} (30)`);
  ok(e.created_by === cashier, "created_by = الكاشير (درجه يقفل صح) — مش المدير");
  ok(e.recorded_by_id === mgr, "recorded_by_id = المدير (تدقيق)");

  const cashierDrawer = db.prepare("SELECT COALESCE(SUM(drawer_amount),0) AS s FROM expenses WHERE created_by=? AND is_deleted=0").get(cashier);
  ok(cashierDrawer.s === 30, `درج الكاشير ناقص 30 (${cashierDrawer.s})`);
  const mgrDrawer = db.prepare("SELECT COALESCE(SUM(drawer_amount),0) AS s FROM expenses WHERE created_by=? AND is_deleted=0").get(mgr);
  ok(mgrDrawer.s === 0, `درج المدير متأثرش (${mgrDrawer.s} = 0)`);

  const bal = db.prepare("SELECT balance FROM suppliers WHERE id=?").get(supplierId).balance;
  ok(bal === 100, `رصيد المورد 200 → ${bal} (نقص 100)`);

  // التحقق إن الدرج بدون تحديد بيرفض
  let rejected = false;
  try {
    suppliersRepository.recordPayment({ supplier_id: supplierId, amount: 50, drawer_amount: 20 }, mgr, "مدير");
  } catch { rejected = true; }
  ok(rejected, "دفعة فيها درج من غير تحديد صاحب الدرج → مرفوضة");

  console.log(process.exitCode ? "\n❌ فيه فشل" : "\n✅ دفعة المورد بتتنسب لدرج الكاشير صح");
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message, err.stack);
  process.exit(1);
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
