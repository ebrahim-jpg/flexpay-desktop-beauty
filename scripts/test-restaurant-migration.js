// اختبار migration 034 — نسخة «المطاعم». **إضافة بس.**
//   • قاعدة جديدة: الختم `restaurant` بعد الـseed، وعمود طابعة المطبخ موجود، و trigger الكافيه اتشال.
//   • ترقية قاعدة كافيه شغّالة (v33 مختومة `cafe` وفيها طاولات وحسابات وفواتير) → الختم بيتحوّل
//     والبيانات القديمة زي ما هي بالحرف. ده السيناريو الحقيقي لو حد نسخ بيانات كافيه للمطعم.
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-restaurant-migration.js
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

// ⚠️ أي استثناء مش متمسوك في إلكترون بيفتح **ديالوج خطأ** بيوقف التشغيل لحد ما حد يدوس OK
// (والاختبار بيفضل معلّق ومفيش نتيجة). هنا بنمسك أي حاجة ونطبعها ونقفل بكود خطأ.
process.on("uncaughtException", (e) => {
  console.log(`✗ FAIL استثناء: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.log(`✗ FAIL رفض غير متمسوك: ${e}`);
  process.exit(1);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-rest-mig-"));
try {
  // ===== ① قاعدة جديدة =====
  console.log("\n— قاعدة جديدة —");
  const freshDir = path.join(tmp, "fresh");
  fs.mkdirSync(freshDir);
  initDatabase(freshDir);
  const db = getDatabase();
  const LATEST = Math.max(...migrations.map((m) => m.version));
  ok(LATEST === 36, `آخر migration = 36 (الفعلي ${LATEST})`);
  const st = db.prepare("SELECT vertical, kitchen_printer_name FROM settings WHERE id = 1").get();
  ok(st && st.vertical === "restaurant", `الختم = restaurant (الفعلي ${st && st.vertical})`);
  ok(st && st.kitchen_printer_name === null, "طابعة المطبخ فاضية افتراضياً (= طابعة الفاتورة)");
  ok(hasTrigger(db, "trg_settings_vertical_restaurant"), "trigger ختم المطعم موجود");
  ok(!hasTrigger(db, "trg_settings_vertical_cafe"), "trigger الكافيه اتشال (وإلا كان هيختم فوقه)");
  // الطاولات والحجوزات (أساس المطعم) لسه زي ما هي
  ok(cols(db, "gaming_rooms").includes("kind"), "gaming_rooms.kind موجود (الطاولة)");
  ok(cols(db, "room_bookings").includes("party_size"), "room_bookings.party_size موجود (حجز بعدد الأفراد)");
  ok(cols(db, "orders").includes("delivery_zone"), "orders.delivery_zone موجود (التوصيل)");
  ok(cols(db, "online_orders").length > 0, "جدول online_orders موجود (طلبات المتجر)");
  closeDatabase();

  // ===== ② ترقية قاعدة كافيه فيها بيانات =====
  console.log("\n— ترقية قاعدة كافيه شغّالة —");
  const upDir = path.join(tmp, "cafe");
  fs.mkdirSync(upDir);
  const dbPath = path.join(upDir, "database.db");
  // ⚠️ الـmigrations مابتعملش صف الإعدادات — الـseed هو اللي بيعمله. فبنجهّز قاعدة كاملة
  // بالـseed الأول، وبعدين نرجّعها لحالة «كافيه v33» (ختم + trigger + من غير عمود طابعة
  // المطبخ) عشان الترقية تتجرّب زي ما هتحصل على جهاز عميل فعلاً.
  initDatabase(upDir);
  closeDatabase();
  const old = new Database(dbPath);
  old.pragma("foreign_keys = ON");
  old.prepare("UPDATE settings SET vertical = 'cafe'").run();
  old.exec("ALTER TABLE settings DROP COLUMN kitchen_printer_name;");
  old.pragma("user_version = 33");
  old.exec("DROP TRIGGER IF EXISTS trg_settings_vertical_restaurant;");
  old.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_settings_vertical_cafe
    AFTER INSERT ON settings BEGIN
      UPDATE settings SET vertical = 'cafe' WHERE id = NEW.id;
    END;
  `);
  // ⚠️ created_at مطلوب (NOT NULL بلا افتراضي) — نقصه بيرمي استثناء، والاستثناء في إلكترون
  // بيفتح ديالوج بيوقف التشغيل كله لحد ما حد يدوس OK.
  const now = new Date().toISOString();
  old.prepare(
    "INSERT INTO gaming_rooms (local_id, name, kind, area, rate_single, rate_multi, is_active, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).run("t-1", "طاولة 5", "table", "الصالة", 0, 0, 1, 1, now, now);
  const roomId = old.prepare("SELECT id FROM gaming_rooms WHERE local_id = 't-1'").get().id;
  old.close();

  const up = new Database(dbPath);
  up.pragma("foreign_keys = ON");
  runMigrations(up);
  const after = up.prepare("SELECT vertical, kitchen_printer_name FROM settings WHERE id = 1").get();
  ok(after.vertical === "restaurant", `الختم اتحوّل لـrestaurant (الفعلي ${after.vertical})`);
  ok(after.kitchen_printer_name === null, "وعمود طابعة المطبخ اتضاف للقاعدة القديمة");
  ok(!hasTrigger(up, "trg_settings_vertical_cafe"), "trigger الكافيه اتشال من القاعدة القديمة");
  const room = up.prepare("SELECT name, kind, area FROM gaming_rooms WHERE id = ?").get(roomId);
  ok(room.name === "طاولة 5" && room.kind === "table" && room.area === "الصالة", "بيانات الطاولة القديمة زي ما هي");
  ok(up.pragma("user_version", { simple: true }) === LATEST, `النسخة بقت ${LATEST}`);
  // التشغيل تاني مايعملش حاجة (idempotent)
  runMigrations(up);
  ok(up.prepare("SELECT COUNT(*) c FROM gaming_rooms").get().c === 1, "إعادة التشغيل مابتكرّرش ولا بتكسر");
  up.close();

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ migration المطعم سليمة");
} finally {
  try {
    closeDatabase();
  } catch {
    /* اتقفلت خلاص */
  }
  // ويندوز بيقفل ملف الـWAL لحظة بعد الإغلاق — التنضيف مش جزء من الاختبار
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* هيتنضف مع الـtemp */
  }
}

// ⚠️ خروج صريح: إلكترون بيسيب الـevent loop شغّال، فالاختبار بيطبع نتيجته
// وبيفضل معلّق للأبد (وأي اختبار بعده في السويت مابيشتغلش).
process.exit(process.exitCode ?? 0);
