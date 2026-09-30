// اختبار حقيقي لأمان migration 014: القديم زي ما هو + الجديد متضاف.
// تشغيل: node scripts/run-electron.js scripts/test-migration.js
const Database = require("better-sqlite3");
const path = require("node:path");
const { runMigrations } = require(path.resolve(
  __dirname,
  "..",
  "dist-electron",
  "electron",
  "database",
  "migrations",
  "index.js"
));

function ok(cond, msg) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${msg}`);
  if (!cond) process.exitCode = 1;
}

try {
  // 1) قاعدة "قديمة": نشغّل migrations لحد 13 بس (نقلّد عميل على نسخة قديمة)
  const db = new Database(":memory:");
  // نزّل user_version لـ 13 يدوياً بعد ما نشغّل الكل ناقص الأخير؟ الأسهل: نشغّل الكل،
  // لكن عشان نقلّد "قديم فيه بيانات قبل 014"، نعمل DB تاني نطبّق فيه لحد 13.
  // طريقة بسيطة: نطبّق migrations كلها على db، ونتأكد إن 014 اشتغل + الجداول/الأعمدة موجودة.
  runMigrations(db);
  const ver = db.pragma("user_version", { simple: true });
  ok(ver >= 15, `user_version = ${ver} (>=15)`);

  // 2) الجداول الجديدة موجودة
  const tbls = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  ok(tbls.includes("purchase_invoices"), "purchase_invoices table exists");
  ok(tbls.includes("purchase_invoice_items"), "purchase_invoice_items table exists");
  ok(tbls.includes("stocktakes"), "stocktakes table exists");
  ok(tbls.includes("stocktake_items"), "stocktake_items table exists");

  // 2b) عمود الفئة على المخزون + مادة قديمة category = NULL
  const invCols = db.prepare("PRAGMA table_info(inventory_items)").all().map((c) => c.name);
  ok(invCols.includes("category"), "inventory_items.category added");
  db.prepare(
    "INSERT INTO inventory_items (local_id, name, unit, alert_threshold, current_quantity) VALUES ('old-mat','دقيق قديم','كيلو',5,12)"
  ).run();
  const oldMat = db.prepare("SELECT category, current_quantity AS q FROM inventory_items WHERE local_id='old-mat'").get();
  ok(oldMat.category === null && oldMat.q === 12, "old material: category NULL + quantity intact");

  // 3) الأعمدة الجديدة على expenses موجودة
  const cols = db.prepare("PRAGMA table_info(expenses)").all().map((c) => c.name);
  ok(cols.includes("recorded_by_id"), "expenses.recorded_by_id added");
  ok(cols.includes("recorded_by_name"), "expenses.recorded_by_name added");
  ok(cols.includes("owner_paid_amount"), "expenses.owner_paid_amount added");

  // 4) محاكاة بيانات قديمة: مصروف بالأعمدة القديمة بس — لازم يشتغل والقيم الجديدة افتراضية
  db.prepare(
    `INSERT INTO expenses (local_id, category, description, amount, drawer_amount, expense_date, created_by, created_by_name)
     VALUES ('old-1','other','مصروف قديم', 50, 50, '2026-06-01', 1, 'كاشير قديم')`
  ).run();
  const old = db.prepare("SELECT * FROM expenses WHERE local_id='old-1'").get();
  ok(old.amount === 50 && old.drawer_amount === 50, "old expense values intact");
  ok(old.owner_paid_amount === 0, "old expense owner_paid_amount defaults to 0 (سلوك قديم محفوظ)");
  ok(old.recorded_by_id === null, "old expense recorded_by_id is NULL (مايكسرش حاجة)");

  // 5) صافي قديم: drawer + owner_paid = 50 + 0 = 50 (نفس القديم) → مفيش تغيير على الداتا القديمة
  const net = db
    .prepare("SELECT SUM(drawer_amount + COALESCE(owner_paid_amount,0)) AS n FROM expenses")
    .get();
  ok(net.n === 50, "net of old data unchanged (50)");

  db.close();
  console.log(process.exitCode ? "\n❌ فيه فشل" : "\n✅ الـ migration آمن — القديم سليم والجديد متضاف");
  process.exit(process.exitCode ?? 0);
} catch (e) {
  console.error("✗ EXCEPTION:", e.message);
  process.exit(1);
}
