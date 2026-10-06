// اختبار: تغيير كلمة السر (بالتحقق) + اختصارات الكاشير + رفض الأزرار المحجوزة.
// تشغيل: node scripts/run-electron.js scripts/test-profile.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase } = require(path.join(base, "database", "connection.js"));
const { usersRepository } = require(path.join(base, "repositories", "users.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}
function throws(fn, m) {
  let t = false;
  try { fn(); } catch { t = true; }
  ok(t, m);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-prof-"));
try {
  initDatabase(dir);
  const db = getDatabase();

  // مستخدم بكلمة سر + منتجين
  const u = usersRepository.create(
    { name: "كاشير أحمد", username: "ahmed", password: "1234", role: "cashier" },
    1
  );
  const pid = Number(
    db.prepare("INSERT INTO products (local_id,name,price) VALUES ('p1','قهوة شرقي',15)").run().lastInsertRowid
  );
  const pid2 = Number(
    db.prepare("INSERT INTO products (local_id,name,price) VALUES ('p2','شاي',10)").run().lastInsertRowid
  );

  // ===== كلمة السر =====
  throws(() => usersRepository.changeOwnPassword(u.id, "غلط", "5678"), "كلمة سر قديمة غلط → مرفوضة");
  throws(() => usersRepository.changeOwnPassword(u.id, "1234", "12"), "كلمة سر جديدة قصيرة → مرفوضة");
  usersRepository.changeOwnPassword(u.id, "1234", "5678");
  ok(!!usersRepository.verifyPassword("ahmed", "5678"), "كلمة السر الجديدة شغّالة");
  ok(!usersRepository.verifyPassword("ahmed", "1234"), "كلمة السر القديمة بطّلت تشتغل");

  // ===== مفيش اختصارات كاشير =====
  // ⚠️ «زر كيبورد = منتج» اتشال مع شاشة الكاشير. **الجدول `user_shortcuts`
  // فاضل في الداتابيز** (ممنوع تعديل migration اتطبّق) ومحدش بيكتب فيه.
  for (const gone of ["getShortcuts", "setShortcut", "deleteShortcut"]) {
    ok(typeof usersRepository[gone] !== "function", `الريبو مافيهوش ${gone}`);
  }
  ok(
    !!getDatabase().prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_shortcuts'").get(),
    "والجدول فاضل في الداتابيز زي ما هو"
  );

  console.log(process.exitCode ? "\n❌ فيه فشل" : "\n✅ الملف الشخصي: كلمة السر + الاختصارات سليمة");
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message, err.stack);
  process.exit(1);
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
