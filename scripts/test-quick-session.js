// اختبار **الجلسة السريعة** — حلاق + خدمة + حساب في مسار واحد.
//
// الجلسة السريعة مش مسار تاني للفلوس: هي **نفس** `open → addItem → checkout`
// بالحرف. الاختبار ده بيثبّت الحاجة اللي عشانها الجلسة موجودة من الأصل:
//
//   • الزمن بيتسجّل (`started_at` و `ended_at`) — حتى لو القعدة ثانية واحدة.
//   • العمولة بتتحسب زي أي جلسة (الخدمة باسم اللي عملها).
//   • الكرسي بيفضى بعدها على طول (جلسة تانية تنفع فوراً).
//   • الفاتورة مصدرها جلسة مش بيع سريع.
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-quick-session.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { gamingRepository } = require(path.join(base, "repositories", "gaming.repository.js"));
const { productsRepository } = require(path.join(base, "repositories", "products.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}
const near = (a, b) => Math.abs(a - b) < 0.001;

process.on("uncaughtException", (e) => {
  console.log(`✗ FAIL استثناء: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.log(`✗ FAIL رفض غير متمسوك: ${e}`);
  process.exit(1);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-quick-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  const stylist = Number(
    db
      .prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u1','منى','m','stylist',1)")
      .run().lastInsertRowid
  );
  const actor = { id: stylist, name: "منى" };
  const cat = Number(
    db
      .prepare(
        "INSERT INTO categories (local_id, name, icon, sort_order, sync_status) VALUES ('c','شعر','scissors',1,'pending')"
      )
      .run().lastInsertRowid
  );
  const cut = productsRepository.create(
    { name: "قص", category_id: cat, price: 80, is_service: true, duration_minutes: 20 },
    stylist
  );
  const chair = gamingRepository.saveRoom({ name: "كرسي 1", area: "الصالة" }, stylist).room;

  // ===== المسار السريع بالحرف اللي الواجهة بتعمله =====
  console.log("\n— جلسة سريعة —");
  const s = gamingRepository.openSession({ room_id: chair.id, staff_id: stylist }, actor);
  gamingRepository.addItem({ session_id: s.id, product_id: cut.id, quantity: 1 }, actor);
  const res = gamingRepository.checkout(
    { session_id: s.id, payment_method: "cash", amount_paid: 80, discount_type: "none", discount_value: 0 },
    actor
  );

  ok(near(res.order.total, 80), `الفاتورة ٨٠ (الفعلي ${res.order.total})`);
  ok(res.order.source === "table_session", `مصدرها جلسة مش بيع سريع (الفعلي ${res.order.source})`);

  const closed = gamingRepository.getSession(s.id);
  ok(closed.status === "closed", "والجلسة اتقفلت");
  ok(!!closed.started_at && !!closed.ended_at, "**والزمن اتسجّل** (بداية ونهاية) — ده سبب وجود الجلسة");
  ok(
    Date.parse(closed.ended_at) >= Date.parse(closed.started_at),
    "والنهاية بعد البداية (مش تواريخ متلغبطة)"
  );

  // العمولة زي أي جلسة
  const sellers = db
    .prepare("SELECT seller_id, attributed_amount FROM order_sellers WHERE order_id = ?")
    .all(res.order.id);
  ok(sellers.length === 1 && sellers[0].seller_id === stylist, "العمولة اتسجّلت لمنى");
  ok(near(sellers[0].attributed_amount, 80), `ونصيبها ٨٠ (الفعلي ${sellers[0].attributed_amount})`);

  // الكرسي فضي فوراً
  console.log("\n— الكرسي بيفضى على طول —");
  const s2 = gamingRepository.openSession({ room_id: chair.id, staff_id: stylist }, actor);
  ok(s2.id !== s.id && s2.status === "open", "جلسة تانية على نفس الكرسي فوراً — مفيش قفل");

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ الجلسة السريعة سليمة");
} finally {
  try {
    closeDatabase();
  } catch {
    /* اتقفلت خلاص */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ويندوز بيقفل ملف الـWAL لحظة */
  }
}

process.exit(process.exitCode ?? 0);
