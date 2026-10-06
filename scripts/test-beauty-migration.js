// اختبار migration 037 — نسخة «التجميل». **إضافة بس.**
//   • قاعدة جديدة: الختم `beauty` بعد الـseed، والأعمدة الجديدة موجودة،
//     و trigger المطعم اتشال.
//   • ترقية قاعدة **مطعم شغّالة** (v036 مختومة `restaurant` وفيها كراسي وجلسات
//     ومنتجات) → الختم بيتحوّل والبيانات القديمة زي ما هي بالحرف. ده السيناريو
//     الحقيقي لو حد نسخ بيانات مطعم للتجميل.
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-beauty-migration.js
const Database = require("better-sqlite3");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { migrations, runMigrations } = require(path.join(base, "database", "migrations", "index.js"));
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}
const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const hasTrigger = (db, name) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name);

// ⚠️ أي استثناء مش متمسوك في إلكترون بيفتح **ديالوج** بيوقف التشغيل لحد ما حد يدوس OK
process.on("uncaughtException", (e) => {
  console.log(`✗ FAIL استثناء: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.log(`✗ FAIL رفض غير متمسوك: ${e}`);
  process.exit(1);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-beauty-mig-"));
try {
  // ===== ① قاعدة جديدة =====
  console.log("\n— قاعدة جديدة —");
  const freshDir = path.join(tmp, "fresh");
  fs.mkdirSync(freshDir);
  initDatabase(freshDir);
  const db = getDatabase();
  const LATEST = Math.max(...migrations.map((m) => m.version));
  ok(LATEST === 38, `آخر migration = 38 (الفعلي ${LATEST})`);
  ok(db.pragma("user_version", { simple: true }) === LATEST, "user_version = آخر migration");

  const settings = db.prepare("SELECT vertical FROM settings WHERE id = 1").get();
  ok(settings.vertical === "beauty", `الختم «beauty» (الفعلي ${settings.vertical})`);
  ok(hasTrigger(db, "trg_settings_vertical_beauty"), "trigger التجميل موجود");
  ok(!hasTrigger(db, "trg_settings_vertical_restaurant"), "**و trigger المطعم اتشال**");

  const p = cols(db, "products");
  ok(p.includes("is_service") && p.includes("duration_minutes"), "أعمدة الخدمة ومدتها");
  const s = cols(db, "gaming_sessions");
  ok(s.includes("staff_id") && s.includes("staff_name"), "والحلاق على الجلسة");
  const i = cols(db, "gaming_session_items");
  ok(i.includes("staff_id") && i.includes("staff_name"), "**وعلى البند** (عمولة دقيقة لكل خدمة)");
  ok(
    !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_session_items_staff'").get(),
    "وفهرس على حلاق البند (تقرير الأداء بيجمّع بيه)"
  );
  closeDatabase();

  // ===== ② ترقية قاعدة مطعم شغّالة =====
  console.log("\n— ترقية قاعدة مطعم شغّالة —");
  const upDir = path.join(tmp, "rest");
  fs.mkdirSync(upDir);
  const dbPath = path.join(upDir, "database.db");
  // ⚠️ الـmigrations مابتعملش صف الإعدادات — الـseed هو اللي بيعمله. فبنجهّز قاعدة
  // كاملة بالـseed، وبعدين نرجّعها لحالة «مطعم v036» زي جهاز عميل فعلاً.
  initDatabase(upDir);
  closeDatabase();
  const old = new Database(dbPath);
  old.pragma("foreign_keys = ON");
  old.prepare("UPDATE settings SET vertical = 'restaurant'").run();
  // ⚠️ الفهرس لازم يتشال **قبل** العمود، وإلا سكيولايت بيرفض الـDROP
  old.exec("DROP INDEX IF EXISTS idx_session_items_staff;");
  old.exec("ALTER TABLE products DROP COLUMN is_service;");
  old.exec("ALTER TABLE products DROP COLUMN duration_minutes;");
  old.exec("ALTER TABLE gaming_sessions DROP COLUMN staff_id;");
  old.exec("ALTER TABLE gaming_sessions DROP COLUMN staff_name;");
  old.exec("ALTER TABLE gaming_session_items DROP COLUMN staff_id;");
  old.exec("ALTER TABLE gaming_session_items DROP COLUMN staff_name;");
  old.pragma("user_version = 36");
  old.exec("DROP TRIGGER IF EXISTS trg_settings_vertical_beauty;");
  old.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_settings_vertical_restaurant
    AFTER INSERT ON settings BEGIN
      UPDATE settings SET vertical = 'restaurant' WHERE id = NEW.id;
    END;
  `);
  // ⚠️ created_at مطلوب (NOT NULL بلا افتراضي) — نقصه بيرمي استثناء، والاستثناء في
  // إلكترون بيفتح ديالوج بيوقف التشغيل كله.
  const now = new Date().toISOString();
  old
    .prepare(
      "INSERT INTO gaming_rooms (local_id, name, kind, area, rate_single, rate_multi, is_active, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run("c-1", "كرسي 5", "table", "الصالة", 0, 0, 1, 1, now, now);
  const roomId = old.prepare("SELECT id FROM gaming_rooms WHERE local_id = 'c-1'").get().id;
  const cat = old
    .prepare("INSERT INTO categories (local_id, name, sort_order, sync_status) VALUES ('c','شعر',1,'pending')")
    .run().lastInsertRowid;
  old
    .prepare("INSERT INTO products (local_id, name, price, category_id, sync_status) VALUES ('p','صبغة',300,?,'pending')")
    .run(cat);
  old.close();

  const up = new Database(dbPath);
  up.pragma("foreign_keys = ON");
  runMigrations(up);
  const after = up.prepare("SELECT vertical FROM settings WHERE id = 1").get();
  ok(after.vertical === "beauty", `الختم اتحوّل لـbeauty (الفعلي ${after.vertical})`);
  ok(!hasTrigger(up, "trg_settings_vertical_restaurant"), "و trigger المطعم اتشال من القاعدة القديمة");

  const room = up.prepare("SELECT name, kind, area FROM gaming_rooms WHERE id = ?").get(roomId);
  ok(
    room.name === "كرسي 5" && room.kind === "table" && room.area === "الصالة",
    "بيانات الكرسي القديمة زي ما هي"
  );
  const prod = up.prepare("SELECT name, price, is_service, duration_minutes FROM products WHERE local_id = 'p'").get();
  ok(prod.name === "صبغة" && prod.price === 300, "والمنتج القديم زي ما هو");
  // ⚠️ migration 038 بتختم البنود القديمة **خدمات**: النسخة خدمات بس،
  // وبند بـ`is_service = 0` كان بيختفي من الجلسة السريعة (بتفلتر على الخدمات).
  ok(prod.is_service === 1, "**والمنتج القديم بقى خدمة** (migration 038)");
  ok(prod.duration_minutes === 0, "ومدته صفر (ماتسجلتش لسه)");
  ok(up.pragma("user_version", { simple: true }) === LATEST, `النسخة بقت ${LATEST}`);
  ok(
    !!up.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_session_items_staff'").get(),
    "والفهرس اترجّع"
  );

  // إعادة التشغيل مابتعملش حاجة
  runMigrations(up);
  ok(up.prepare("SELECT COUNT(*) c FROM gaming_rooms").get().c === 1, "إعادة التشغيل مابتكرّرش ولا بتكسر");
  up.close();

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ migration التجميل سليمة");
} finally {
  try {
    closeDatabase();
  } catch {
    /* اتقفلت خلاص */
  }
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ويندوز بيقفل ملف الـWAL لحظة */
  }
}

process.exit(process.exitCode ?? 0);
