// اختبار صمود المزامنة — فشل الشبكة مايحرقش محاولات + الفاشلة تتصلّح.
// تشغيل: node scripts/run-electron.js scripts/test-sync-resilience.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase } = require(path.join(base, "database", "connection.js"));
const q = require(path.join(base, "sync", "sync-queue.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-sync-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  db.prepare("DELETE FROM sync_queue").run();

  // 3 أحداث في الطابور
  for (let i = 0; i < 3; i++) {
    q.enqueueSync(db, { localId: `L${i}`, entityType: "order", eventType: "CREATED", payload: { i } });
  }
  const ids = db.prepare("SELECT id FROM sync_queue ORDER BY id").all().map((r) => r.id);
  ok(q.getPendingCount(db) === 3, "3 أحداث pending");

  // ===== فشل شبكة: markSyncing ثم releaseBatch — مايحرقش محاولة =====
  q.markSyncing(db, ids);
  ok(db.prepare("SELECT COUNT(*) c FROM sync_queue WHERE status='syncing'").get().c === 3, "اتعلّمت syncing");
  q.releaseBatch(db, ids);
  const afterRelease = db.prepare("SELECT status, attempts FROM sync_queue").all();
  ok(afterRelease.every((r) => r.status === "pending"), "بعد فشل الشبكة: رجعت pending");
  ok(afterRelease.every((r) => r.attempts === 0), "بعد فشل الشبكة: المحاولات = 0 (مش محروقة) ✅");

  // ===== محاكاة شهر أوفلاين: 100 دورة فشل شبكة — لازم تفضل صفر محاولات =====
  for (let cycle = 0; cycle < 100; cycle++) {
    q.markSyncing(db, ids);
    q.releaseBatch(db, ids);
  }
  const afterMonth = db.prepare("SELECT status, attempts FROM sync_queue").all();
  ok(
    afterMonth.every((r) => r.status === "pending" && r.attempts === 0),
    "شهر أوفلاين (100 دورة فشل شبكة): كله pending + 0 محاولات — هيترفع نضيف لما النت يرجع ✅"
  );

  // ===== فشل سيرفر حقيقي: markBatchFailed × 5 → failed =====
  for (let i = 0; i < 5; i++) q.markBatchFailed(db, ids, "HTTP 500", 5);
  const failed = db.prepare("SELECT COUNT(*) c FROM sync_queue WHERE status='failed'").get().c;
  ok(failed === 3, "فشل السيرفر 5 مرات → failed (3)");

  // ===== الشفاء الذاتي: resetFailed (بيتنادى عند رجوع النت) → pending =====
  const reset = q.resetFailed(db);
  ok(reset === 3, `resetFailed رجّع 3 (${reset})`);
  const healed = db.prepare("SELECT status, attempts FROM sync_queue").all();
  ok(
    healed.every((r) => r.status === "pending" && r.attempts === 0),
    "الشفاء الذاتي: الفاشلة رجعت pending + 0 محاولات (مفيش زرار يدوي محتاجه) ✅"
  );

  console.log(process.exitCode ? "\n❌ فيه فشل" : "\n✅ المزامنة صامدة: شبكة مابتحرقش محاولات + الفاشلة تتصلّح تلقائياً");
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message, err.stack);
  process.exit(1);
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}
