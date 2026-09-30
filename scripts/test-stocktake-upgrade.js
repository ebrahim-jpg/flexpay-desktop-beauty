// يحاكي بالظبط مشكلة العميل: قاعدة عند v15 بالـ schema القديم (مفيش expected_min)
// + فيها بيانات جرد قديمة → الترقية لـ 16 تضيف الأعمدة وتسمح بجرد جديد.
// تشغيل: node scripts/run-electron.js scripts/test-stocktake-upgrade.js
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-stk-upg-"));
const dbPath = path.join(dir, "v15.db");
try {
  // ===== المرحلة 1: قاعدة عند v15 بالـ schema الأصلي (زي العميل) =====
  const db0 = new Database(dbPath);
  for (const m of migrations.filter((x) => x.version <= 15).sort((a, b) => a.version - b.version)) {
    db0.transaction(() => {
      m.up(db0);
      db0.pragma(`user_version = ${m.version}`);
    })();
  }
  ok(db0.pragma("user_version", { simple: true }) === 15, "قاعدة عند v15");

  const cols0 = db0.prepare("PRAGMA table_info(stocktake_items)").all().map((c) => c.name);
  ok(!cols0.includes("expected_min"), "v15 الأصلي: مفيش عمود expected_min (يعيد إنتاج البَج)");

  // جرد قديم موجود (بالـ schema القديم — من غير expected_min)
  db0.prepare(
    "INSERT INTO stocktakes (local_id,counted_at,item_count,shortage_value,surplus_value,variance_value,created_by,created_by_name) VALUES ('stk-old','2026-06-20',1,5,0,-5,1,'مدير')"
  ).run();
  db0.prepare(
    "INSERT INTO stocktake_items (local_id,stocktake_id,stocktake_local_id,inventory_item_id,item_name,expected_qty,counted_qty,variance_qty,cost_per_unit,variance_value) VALUES ('si-old',1,'stk-old',1,'بيبسي',10,5,-5,1,-5)"
  ).run();
  db0.close();

  // ===== المرحلة 2: تثبيت النسخة الجديدة → الترقية تشتغل =====
  const db = new Database(dbPath);
  runMigrations(db); // المفروض يطبّق 16 بس
  // ⚠️ الرقم بيتحسب من قايمة الـmigrations مش مثبّت — كان مكتوب برقم صريح
  // وبقى قديم مع كل migration جديدة، فالحارس فضل فاشل ومحدّش بيبصله.
  const LATEST = Math.max(...migrations.map((m) => m.version));
  ok(db.pragma("user_version", { simple: true }) === LATEST, `بعد الترقية: user_version = ${LATEST}`);

  const cols = db.prepare("PRAGMA table_info(stocktake_items)").all().map((c) => c.name);
  ok(cols.includes("expected_min"), "اتضاف عمود expected_min");
  ok(cols.includes("waste_percentage"), "اتضاف عمود waste_percentage");

  // البيانات القديمة سليمة + الأعمدة الجديدة = 0
  const oldRow = db.prepare("SELECT * FROM stocktake_items WHERE local_id='si-old'").get();
  ok(oldRow.variance_qty === -5 && oldRow.counted_qty === 5, "بند الجرد القديم سليم");
  ok(oldRow.expected_min === 0 && oldRow.waste_percentage === 0, "الأعمدة الجديدة = 0 للقديم");

  // ===== المرحلة 3: INSERT بالـ schema الجديد (اللي كان بيفشل) دلوقتي بيشتغل =====
  let inserted = false;
  try {
    db.prepare(
      `INSERT INTO stocktake_items
       (local_id,stocktake_id,stocktake_local_id,inventory_item_id,item_name,category,
        expected_qty,expected_min,waste_percentage,counted_qty,variance_qty,cost_per_unit,variance_value)
       VALUES ('si-new',1,'stk-old',2,'بن','مشروبات',50,49,2,49,0,4,0)`
    ).run();
    inserted = true;
  } catch (e) {
    console.error("INSERT failed:", e.message);
  }
  ok(inserted, "INSERT فيه expected_min/waste_percentage بينجح (البَج اتصلّح)");

  // الترقية تاني = ثابتة (idempotent)
  runMigrations(db);
  ok(db.pragma("user_version", { simple: true }) === LATEST, "إعادة الترقية ثابتة (idempotent)");
  db.close();

  console.log(process.exitCode ? "\n❌ فيه فشل" : "\n✅ الترقية v15→v16 آمنة — مشكلة الجرد اتحلّت");
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message, err.stack);
  process.exit(1);
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}
