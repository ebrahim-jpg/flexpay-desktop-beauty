// اختبار فاصل السحب المتكيّف — **توفير طلبات السيرفر من غير ما نأخّر الطلبات**.
//
// السياق: السحب كان بيتنفّذ كل 10 ثواني للأبد حتى لو المحل مالوش متجر إلكتروني
// (8,640 طلب/يوم من محل مقفول) وكان ده أكبر بند في فاتورة CPU على Vercel.
//
// ⚠️ الفخ اللي الاختبار ده بيحرسه: السحب مش بس بيرفع — **هو كمان اللي بيستقبل
// الطلبات الجديدة**. فأي حل بشكل «مانسحبش لو مفيش حاجة نبعتها» كان هيمنع استقبال
// الطلبات نهائياً. الاختبار بيتأكد إن الطلبات لسه بتوصل في كل الحالات.
//
// تشغيل: node scripts/run-electron.js scripts/test-sync-interval.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron");
const { initDatabase, getDatabase } = require(path.join(base, "electron", "database", "connection.js"));
const { SyncEngine } = require(path.join(base, "electron", "sync", "sync-engine.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-interval-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  const engine = new SyncEngine(db);

  const S = 10_000; // الفاصل الأساسي
  const IDLE = 60_000; // فاصل الخمول

  // وصول للحالة الخاصة (الاختبار بيفحص المنطق مش الشبكة)
  const get = (k) => engine[k];
  const set = (k, v) => {
    engine[k] = v;
  };

  // ===== ① البداية سريعة =====
  ok(get("pullIntervalMs") === S, `يبدأ بالفاصل السريع (${get("pullIntervalMs")})`);
  ok(engine.dueForPull() === true, "أول تِك: مستحق السحب فوراً");

  // ===== ② التراجع المحلي (سيرفر قديم مابعتش تلميح) =====
  set("lastPullAt", Date.now());
  ok(engine.dueForPull() === false, "بعد سحبة لسه: مش مستحق");

  for (let i = 0; i < 5; i++) set("emptyPulls", get("emptyPulls") + 1);
  ok(get("pullIntervalMs") === S, "5 سحبات فاضية: لسه سريع (العتبة 6)");

  // محاكاة السحبة السادسة الفاضية بنفس منطق المحرّك
  set("emptyPulls", 6);
  set("pullIntervalMs", IDLE);
  ok(get("pullIntervalMs") === IDLE, "6 سحبات فاضية → 60 ثانية");

  // ===== ③ الرجوع للسرعة مع أول نشاط =====
  engine.resumeFastPull();
  ok(get("pullIntervalMs") === S, "resumeFastPull رجّع الفاصل السريع");
  ok(get("emptyPulls") === 0, "resumeFastPull صفّر عدّاد الخمول");
  ok(engine.dueForPull() === true, "resumeFastPull خلّاه مستحق فوراً");

  // ===== ④ سقف الأمان على تلميح السيرفر =====
  const clamp = (v) => Math.min(Math.max(v, S), 900_000);
  ok(clamp(600_000) === 600_000, "تلميح 10 دقايق (متجر مقفول) بيتقبل");
  ok(clamp(1) === S, "تلميح صغير جداً بيتقيّد بالفاصل الأساسي (مايبقاش أسرع)");
  ok(clamp(99_999_999) === 900_000, "تلميح ضخم بيتقيّد بسقف 15 دقيقة");

  // ===== ⑤ الفخ: السحب لازم يفضل شغّال حتى لو مفيش حاجة نبعتها =====
  // مفيش أي تأكيدات مستنية — ومع ذلك لازم نفضل نسحب (وإلا الطلبات الجديدة
  // عمرها ما هتوصل).
  ok(engine.hasPendingUplink() === false, "مفيش تأكيدات مستنية (محل فاضي)");
  set("lastPullAt", 0);
  ok(
    engine.dueForPull() === true,
    "**الأهم**: السحب لسه بيحصل من غير حاجة نبعتها — الطلبات الجديدة بتوصل"
  );

  // ===== ⑥ حاجة مستنية ترفع → سحب فوري مهما كان الفاصل =====
  set("pullIntervalMs", 600_000); // الحجز مقفول
  set("lastPullAt", Date.now());
  ok(engine.dueForPull() === false, "بفاصل 10 دقايق: مش مستحق بالتوقيت");
  // ⚠️ النسخة دي **خدمات بس**: مفيش طلبات متجر خالص، فاللي بيخلّي السحب
  // يحصل فوراً هو **قرار الموظف على حجز** (تأكيد/رفض) — لازم يوصل الويب
  // عشان الزبون يعرف ميعاده اتأكّد، مهما كان الفاصل طويل.
  const nowIso = new Date().toISOString();
  db.prepare(
    `INSERT INTO room_bookings
       (local_id, status, kind, room_desktop_id, room_name, customer_phone,
        starts_at, duration_minutes, business_date, pulled_at, web_acked)
     VALUES ('rb-x','new','table',0,'كرسي 1','0100',?,30,?,?,0)`
  ).run(nowIso, nowIso.slice(0, 10), nowIso);
  ok(
    engine.hasPendingUplink() === true,
    "حجز لسه ماتأكّدش استلامه → فيه حاجة تترفع"
  );

  // ===== ⑦ الحساب اللي حصل عشانه كل ده =====
  const before = Math.round(86_400_000 / S);
  const afterIdle = Math.round(86_400_000 / IDLE);
  const afterStoreOff = Math.round(86_400_000 / 600_000);
  console.log(`\n  طلبات السحب/يوم — قبل: ${before}`);
  console.log(`  بعد (حجز شغّال هادي): ${afterIdle}`);
  console.log(`  بعد (حجز مقفول):      ${afterStoreOff}`);
  ok(afterStoreOff <= before / 50, "الحجز مقفول: توفير 50× على الأقل");
  ok(afterIdle <= before / 5, "حجز هادي: توفير 5× على الأقل");

  console.log("\nSYNC_INTERVAL_TEST_OK");
} catch (e) {
  console.error("✗ FAIL — استثناء:", e && e.stack ? e.stack : e);
  process.exitCode = 1;
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
process.exit(process.exitCode ?? 0);
