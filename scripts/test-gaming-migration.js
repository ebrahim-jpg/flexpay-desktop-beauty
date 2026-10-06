// اختبار migrations مجال البلايستيشن (028 ختم المجال + 029 الغرف والجلسات).
//   • قاعدة جديدة: الختم = gaming بعد الـseed (الـDEFAULT شغّال)، والجداول والإعدادات موجودة.
//   • ترقية قاعدة تجزئة فيها بيانات (v27) → البيانات القديمة زي ما هي (إضافة بس).
//   • الفهرس الفريد بيمنع جلستين مفتوحتين على نفس الغرفة **من الداتابيز نفسها**.
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-gaming-migration.js
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
function rejects(fn, m) {
  try {
    fn();
    ok(false, `${m} — عدّى وهو المفروض يترفض`);
  } catch {
    ok(true, m);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-gaming-mig-"));
try {
  // ===== ① قاعدة جديدة بالكامل (نفس مسار التشغيل الحقيقي: migrations ثم seed) =====
  console.log("\n— قاعدة جديدة —");
  const freshDir = path.join(tmp, "fresh");
  fs.mkdirSync(freshDir);
  initDatabase(freshDir);
  const db = getDatabase();
  const LATEST = Math.max(...migrations.map((m) => m.version));
  // «بلايستيشن + كافيه»: 032 الطاولات فوق 031 (اختبارها في test-tables-migration.js)
  ok(LATEST === 38, `آخر migration = 38 — تصحيح الكراسي (الفعلي ${LATEST})`);
  const sessCols = db.prepare("PRAGMA table_info(gaming_sessions)").all().map((c) => c.name);
  ok(sessCols.includes("planned_minutes"), "عمود planned_minutes (المدة المحددة) موجود في الجلسات");
  ok(db.pragma("user_version", { simple: true }) === LATEST, "user_version = آخر migration");
  const st = db.prepare("SELECT vertical, gaming_rounding_minutes, gaming_min_minutes FROM settings WHERE id = 1").get();
  // الختم «cafe» (033) — عشان نسخة احتياطية من البرنامج ده ماتترستورش جوّه البلايستيشن أو المشتركة
  ok(st && st.vertical === "beauty", `ختم المجال بعد الـseed = beauty (الفعلي ${st && st.vertical})`);
  ok(st && st.gaming_rounding_minutes === 1, "التقريب الافتراضي = بالدقيقة");
  ok(st && st.gaming_min_minutes === 0, "الحد الأدنى الافتراضي = صفر");
  for (const t of ["gaming_rooms", "gaming_sessions", "gaming_session_segments", "gaming_session_items"]) {
    ok(!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t), `جدول ${t} موجود`);
  }

  // الفهرس الفريد الجزئي
  const now = new Date().toISOString();
  db.prepare("INSERT INTO gaming_rooms (local_id,name,rate_single,rate_multi,created_at) VALUES ('r1','غرفة 1',30,50,?)").run(now);
  const roomId = db.prepare("SELECT id FROM gaming_rooms WHERE local_id='r1'").get().id;
  const insSession = db.prepare(
    `INSERT INTO gaming_sessions (local_id,session_number,room_id,room_name,status,started_at,business_date,created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  insSession.run("s1", 1, roomId, "غرفة 1", "open", now, "2026-09-14", now);
  rejects(
    () => insSession.run("s2", 2, roomId, "غرفة 1", "open", now, "2026-09-14", now),
    "جلسة مفتوحة تانية على نفس الغرفة مرفوضة من الداتابيز"
  );
  db.prepare("UPDATE gaming_sessions SET status='closed' WHERE local_id='s1'").run();
  insSession.run("s3", 3, roomId, "غرفة 1", "open", now, "2026-09-14", now);
  ok(true, "بعد قفل الجلسة، ينفع تتفتح جلسة جديدة على نفس الغرفة");
  insSession.run("s4", 4, roomId, "غرفة 1", "closed", now, "2026-09-14", now);
  ok(true, "جلسات مقفولة كتير على نفس الغرفة مسموحة (الفهرس على المفتوحة بس)");
  closeDatabase();

  // ===== ② ترقية قاعدة تجزئة عليها بيانات (v27 = آخر نسخة أساس) =====
  console.log("\n— ترقية قاعدة v27 فيها بيانات —");
  const upPath = path.join(tmp, "v27.db");
  const db0 = new Database(upPath);
  for (const m of migrations.filter((x) => x.version <= 27).sort((a, b) => a.version - b.version)) {
    db0.transaction(() => {
      m.up(db0);
      db0.pragma(`user_version = ${m.version}`);
    })();
  }
  db0.prepare(
    "INSERT INTO settings (id, local_id, shop_name, payment_methods, nationalities, updated_at) VALUES (1,'set','محل قديم','[]','[\"مصري\"]',?)"
  ).run(now);
  db0.prepare("INSERT INTO users (local_id,name,username,role,is_active) VALUES ('u','مدير','m','manager',1)").run();
  db0.prepare(
    `INSERT INTO orders (local_id,receipt_number,is_guest,order_type,subtotal,discount_type,discount_value,discount_amount,
      tax_rate,tax_amount,total,payment_method,amount_paid,change_amount,status,cashier_id,cashier_name,business_date,created_at)
     VALUES ('o1',1,1,'counter',100,'none',0,0,0,0,100,'cash',100,0,'paid',1,'مدير','2026-09-01',?)`
  ).run(now);
  const beforeOrder = db0.prepare("SELECT * FROM orders WHERE local_id='o1'").get();
  const beforeSettings = db0.prepare("SELECT shop_name, tax_rate FROM settings WHERE id=1").get();
  db0.close();

  const db1 = new Database(upPath);
  runMigrations(db1);
  ok(db1.pragma("user_version", { simple: true }) === LATEST, `بعد الترقية: user_version = ${LATEST}`);
  const afterOrder = db1.prepare("SELECT * FROM orders WHERE local_id='o1'").get();
  // ⚠️ مقارنة الأعمدة القديمة بس: 032 بتضيف `session_id` (NULL) — إضافة مش تعديل
  ok(
    Object.keys(beforeOrder).every((c) => beforeOrder[c] === afterOrder[c]) && afterOrder.session_id === null,
    "الفاتورة القديمة زي ما هي حرفياً (+ session_id فاضي)"
  );
  const afterSettings = db1.prepare("SELECT shop_name, tax_rate, vertical, gaming_rounding_minutes FROM settings WHERE id=1").get();
  ok(afterSettings.shop_name === beforeSettings.shop_name, "اسم المحل زي ما هو");
  ok(afterSettings.vertical === "beauty", "الصف الموجود اتختم beauty");
  ok(afterSettings.gaming_rounding_minutes === 1, "الصف الموجود أخد التقريب الافتراضي");
  ok(db1.prepare("SELECT COUNT(*) c FROM users").get().c === 1, "المستخدمين زي ما هم");
  db1.close();
} finally {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ويندوز ممكن يمسك الملف */
  }
}

console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ migrations الكافيه سليمة");
process.exit(process.exitCode ?? 0);
