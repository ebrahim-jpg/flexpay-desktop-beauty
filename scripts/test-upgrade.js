// اختبار مسار الترقية الحقيقي: عميل على v14 (exe 0.4.0) فيه بيانات → يثبّت 0.6.0 (v15).
// بيتأكد إن الترقية إضافية بحت، مفيش تلف للبيانات القديمة.
// تشغيل: node scripts/run-electron.js scripts/test-upgrade.js
const Database = require("better-sqlite3");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { migrations, runMigrations } = require(path.join(base, "database", "migrations", "index.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-upg-"));
const dbPath = path.join(dir, "v14.db");
try {
  // ===== المرحلة 1: ابني قاعدة "عميل على v14" فيها بيانات =====
  const db0 = new Database(dbPath);
  for (const m of migrations.filter((x) => x.version <= 14).sort((a, b) => a.version - b.version)) {
    db0.transaction(() => {
      m.up(db0);
      db0.pragma(`user_version = ${m.version}`);
    })();
  }
  ok(db0.pragma("user_version", { simple: true }) === 14, "اتبنت قاعدة على v14 (زي العميل الحالي)");

  db0.prepare("INSERT INTO users (local_id,name,username,role,is_active) VALUES ('u','مدير','m','manager',1)").run();
  db0
    .prepare("INSERT INTO inventory_items (local_id,name,unit,alert_threshold,current_quantity,cost_per_unit,waste_percentage) VALUES ('m1','بن','كيلو',5,50,4,2)")
    .run();
  db0
    .prepare("INSERT INTO expenses (local_id,category,description,amount,drawer_amount,expense_date,created_by,created_by_name) VALUES ('e1','other','كهربا',100,100,'2026-06-01',1,'مدير')")
    .run();
  const beforeItem = db0.prepare("SELECT * FROM inventory_items WHERE local_id='m1'").get();
  const beforeExp = db0.prepare("SELECT * FROM expenses WHERE local_id='e1'").get();
  const itemCount0 = db0.prepare("SELECT COUNT(*) AS c FROM inventory_items").get().c;
  db0.close();

  // ===== المرحلة 2: تثبيت النسخة الجديدة → الترقية تشتغل على نفس القاعدة =====
  const db = new Database(dbPath);
  runMigrations(db); // يطبّق كل الناقص (لأن user_version=14)
  // ⚠️ الرقم بيتحسب من قايمة الـmigrations مش مثبّت — كان مكتوب برقم صريح
  // وبقى قديم مع كل migration جديدة، فالحارس فضل فاشل ومحدّش بيبصله.
  const LATEST = Math.max(...migrations.map((m) => m.version));
  ok(db.pragma("user_version", { simple: true }) === LATEST, `بعد الترقية: user_version = ${LATEST}`);

  // ===== المرحلة 3: البيانات القديمة سليمة 100% =====
  const afterItem = db.prepare("SELECT * FROM inventory_items WHERE local_id='m1'").get();
  ok(
    afterItem.current_quantity === beforeItem.current_quantity &&
      afterItem.cost_per_unit === beforeItem.cost_per_unit &&
      afterItem.waste_percentage === beforeItem.waste_percentage,
    "المادة القديمة: الكمية/التكلفة/التهدير زي ما هي"
  );
  ok(afterItem.category === null, "المادة القديمة: category = NULL (العمود الجديد مكسرش حاجة)");
  ok(db.prepare("SELECT COUNT(*) AS c FROM inventory_items").get().c === itemCount0, "عدد المواد ثابت (مفيش فقدان)");
  const afterExp = db.prepare("SELECT * FROM expenses WHERE local_id='e1'").get();
  ok(afterExp.amount === beforeExp.amount && afterExp.drawer_amount === beforeExp.drawer_amount, "المصروف القديم سليم");

  const tbls = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  ok(tbls.includes("stocktakes") && tbls.includes("stocktake_items"), "جداول الجرد اتعملت بعد الترقية");
  const stkCols = db.prepare("PRAGMA table_info(stocktake_items)").all().map((c) => c.name);
  ok(
    ["expected_min", "waste_percentage", "variance_qty"].every((c) => stkCols.includes(c)),
    "أعمدة التهدير في الجرد موجودة"
  );
  ok(tbls.includes("user_shortcuts"), "جدول اختصارات المستخدم (017) اتعمل");
  ok(tbls.includes("order_sellers"), "جدول بائعي الطلبات (018) اتعمل");

  // البيانات القديمة لسه كلها سليمة بعد 17 migration
  ok(db.prepare("SELECT COUNT(*) AS c FROM users").get().c >= 1, "المستخدمين القدام موجودين");
  ok(db.prepare("SELECT COUNT(*) AS c FROM expenses").get().c >= 1, "المصاريف القديمة موجودة");

  // عمود مصدر الطلب (019) موجود — الطلبات القديمة هتبقى NULL (= pos)
  const ordCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
  ok(ordCols.includes("source"), "عمود orders.source (019) اتعمل");
  const tbls2 = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  ok(tbls2.includes("online_orders"), "جدول طلبات المتجر (020) اتعمل");
  const ooCols = db.prepare("PRAGMA table_info(online_orders)").all().map((c) => c.name);
  ok(ooCols.includes("business_date"), "عمود online_orders.business_date (021) اتعمل");
  ok(ordCols.includes("delivery_fee") && ordCols.includes("delivery_person_id"), "أعمدة التوصيل على orders (022) اتعملت");
  const setCols = db.prepare("PRAGMA table_info(settings)").all().map((c) => c.name);
  ok(setCols.includes("delivery_zones"), "عمود settings.delivery_zones (022) اتعمل");

  // migration 023 — كود الحضور + الانصراف التلقائي والتحذير
  const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  ok(
    ["attendance_code_hash", "auto_clockout_hours", "warn_hours"].every((c) => userCols.includes(c)),
    "أعمدة كود الحضور والحدود على users (023) اتعملت"
  );
  ok(
    setCols.includes("auto_clockout_hours") && setCols.includes("attendance_warn_hours"),
    "أعمدة الحضور العامة على settings (023) اتعملت"
  );
  const oldUser = db.prepare("SELECT * FROM users WHERE local_id='u'").get();
  ok(
    oldUser.attendance_code_hash === null && oldUser.auto_clockout_hours === null,
    "المستخدم القديم: مفيش كود ولا حدود (بيسجّل حضور/انصراف عادي بدون كود)"
  );

  // migration 024 — فئات البائع + نصيبه المحسوب
  ok(userCols.includes("seller_categories"), "عمود users.seller_categories (024) اتعمل");
  const osCols = db.prepare("PRAGMA table_info(order_sellers)").all().map((c) => c.name);
  ok(osCols.includes("attributed_amount"), "عمود order_sellers.attributed_amount (024) اتعمل");
  ok(oldUser.seller_categories === undefined || oldUser.seller_categories === null, "المستخدم القديم: seller_categories = NULL (بائع عام تلقائياً)");

  // الترقية مرة تانية = مفيش شغل (idempotent)
  runMigrations(db);
  ok(db.pragma("user_version", { simple: true }) === LATEST, "إعادة الترقية مرة تانية = ثابتة (idempotent)");
  db.close();

  console.log(process.exitCode ? "\n❌ فيه فشل في الترقية" : "\n✅ مسار الترقية v14→v15 آمن — بيانات العميل سليمة");
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message, err.stack);
  process.exit(1);
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}
