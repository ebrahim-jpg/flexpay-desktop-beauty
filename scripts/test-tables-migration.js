// اختبار migration 032 — الطاولات («بلايستيشن + كافيه»). **إضافة بس.**
//   • قاعدة جديدة: الأعمدة الجديدة موجودة، والختم cafe **بعد الـseed** (033 بتبدّل trigger الـ032).
//   • ترقية قاعدة v31 فيها غرف وجلسات وحجوزات وفواتير → كله بيبقى `room` والبيانات القديمة زي ما هي.
//   • الفهرس «حساب مفتوح واحد لكل مكان» بيحرس الطاولات كمان.
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-tables-migration.js
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
const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-tables-mig-"));
try {
  // ===== ① قاعدة جديدة (migrations ثم seed — نفس مسار التشغيل) =====
  console.log("\n— قاعدة جديدة —");
  const freshDir = path.join(tmp, "fresh");
  fs.mkdirSync(freshDir);
  initDatabase(freshDir);
  const db = getDatabase();
  const LATEST = Math.max(...migrations.map((m) => m.version));
  ok(LATEST === 37, `آخر migration = 37 — مجال التجميل (الفعلي ${LATEST})`);
  ok(cols(db, "gaming_rooms").includes("kind") && cols(db, "gaming_rooms").includes("area"), "gaming_rooms: kind + area");
  ok(
    cols(db, "gaming_sessions").includes("kind") && cols(db, "gaming_sessions").includes("merged_into_id"),
    "gaming_sessions: kind + merged_into_id"
  );
  ok(
    cols(db, "room_bookings").includes("kind") && cols(db, "room_bookings").includes("party_size"),
    "room_bookings: kind + party_size"
  );
  ok(cols(db, "orders").includes("session_id"), "orders: session_id (ربط كل فواتير الحساب — تقسيم الفاتورة)");
  const st = db.prepare("SELECT vertical FROM settings WHERE id = 1").get();
  ok(st && st.vertical === "beauty", `ختم المجال بعد الـseed = beauty (الفعلي ${st && st.vertical})`);
  ok(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='trg_settings_vertical_gaming_cafe'").get(), "trigger «بلايستيشن + كافيه» اتشال (ماينفعش trigger تاني يختم فوقه)");

  const now = new Date().toISOString();
  db.prepare("INSERT INTO gaming_rooms (local_id,name,rate_single,rate_multi,created_at) VALUES ('r','غرفة',30,50,?)").run(now);
  ok(db.prepare("SELECT kind FROM gaming_rooms WHERE local_id='r'").get().kind === "room", "غرفة من غير kind = room (الافتراضي)");
  db.prepare(
    "INSERT INTO gaming_rooms (local_id,name,rate_single,rate_multi,kind,area,created_at) VALUES ('t','طاولة 1',0,0,'table','خارجي',?)"
  ).run(now);
  const tableId = db.prepare("SELECT id FROM gaming_rooms WHERE local_id='t'").get().id;
  const ins = db.prepare(
    `INSERT INTO gaming_sessions (local_id,session_number,room_id,room_name,kind,status,started_at,business_date,created_at)
     VALUES (?,?,?,?, 'table','open',?,?,?)`
  );
  ins.run("ts1", 1, tableId, "طاولة 1", now, "2026-09-17", now);
  rejects(() => ins.run("ts2", 2, tableId, "طاولة 1", now, "2026-09-17", now), "حساب مفتوح تاني على نفس الطاولة مرفوض من الداتابيز");
  closeDatabase();

  // ===== ② ترقية v31 فيها بيانات بلايستيشن =====
  console.log("\n— ترقية قاعدة v31 فيها بيانات —");
  const upPath = path.join(tmp, "v31.db");
  const db0 = new Database(upPath);
  for (const m of migrations.filter((x) => x.version <= 31).sort((a, b) => a.version - b.version)) {
    db0.transaction(() => {
      m.up(db0);
      db0.pragma(`user_version = ${m.version}`);
    })();
  }
  db0.prepare(
    "INSERT INTO settings (id, local_id, shop_name, payment_methods, nationalities, updated_at) VALUES (1,'set','محل قديم','[]','[\"مصري\"]',?)"
  ).run(now);
  db0.prepare("INSERT INTO users (local_id,name,username,role,is_active) VALUES ('u','مدير','m','manager',1)").run();
  db0.prepare("INSERT INTO gaming_rooms (local_id,name,rate_single,rate_multi,created_at) VALUES ('r1','غرفة 1',40,60,?)").run(now);
  db0.prepare(
    `INSERT INTO gaming_sessions (local_id,session_number,room_id,room_name,status,started_at,business_date,created_at)
     VALUES ('s1',1,1,'غرفة 1','closed',?,'2026-09-16',?)`
  ).run(now, now);
  db0.prepare(
    `INSERT INTO room_bookings (local_id,status,room_id,room_desktop_id,room_name,starts_at,business_date,customer_phone,pulled_at)
     VALUES ('b1','confirmed',1,1,'غرفة 1',?,'2026-09-17','01000000000',?)`
  ).run(now, now);
  db0.prepare(
    `INSERT INTO orders (local_id,receipt_number,is_guest,order_type,subtotal,discount_type,discount_value,discount_amount,
      tax_rate,tax_amount,total,payment_method,amount_paid,change_amount,status,cashier_id,cashier_name,business_date,created_at,source)
     VALUES ('o1',1,1,'counter',100,'none',0,0,0,0,100,'cash',100,0,'paid',1,'مدير','2026-09-16',?,'gaming_session')`
  ).run(now);
  const snap = (d) => ({
    order: d.prepare("SELECT * FROM orders WHERE local_id='o1'").get(),
    room: d.prepare("SELECT * FROM gaming_rooms WHERE local_id='r1'").get(),
    session: d.prepare("SELECT * FROM gaming_sessions WHERE local_id='s1'").get(),
    booking: d.prepare("SELECT * FROM room_bookings WHERE local_id='b1'").get(),
  });
  const before = snap(db0);
  db0.close();

  const db1 = new Database(upPath);
  runMigrations(db1);
  ok(db1.pragma("user_version", { simple: true }) === LATEST, `بعد الترقية: user_version = ${LATEST}`);
  const after = snap(db1);
  for (const k of Object.keys(before)) {
    const same = Object.keys(before[k]).every((c) => before[k][c] === after[k][c]);
    ok(same, `${k}: كل الأعمدة القديمة زي ما هي حرفياً`);
  }
  ok(after.room.kind === "room" && after.room.area === null, "الغرفة القديمة بقت kind=room من غير منطقة");
  ok(after.session.kind === "room" && after.session.merged_into_id === null, "الجلسة القديمة بقت kind=room");
  ok(after.booking.kind === "room" && after.booking.party_size === null, "الحجز القديم بقى kind=room");
  ok(after.order.session_id === null, "الفاتورة القديمة من غير session_id");
  ok(db1.prepare("SELECT vertical FROM settings WHERE id=1").get().vertical === "beauty", "الصف الموجود اتختم beauty");
  db1.close();
} finally {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ويندوز ممكن يمسك الملف */
  }
}

console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ migration الطاولات سليمة");
process.exit(process.exitCode ?? 0);
