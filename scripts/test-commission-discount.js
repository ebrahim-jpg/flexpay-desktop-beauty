// 🔴 **العمولة مع الخصم** — أخطر حساب في نسخة التجميل.
//
// القاعدة: **مجموع `order_sellers.attributed_amount` = صافي الفاتورة بعد الخصم**
// (قبل الضريبة — الضريبة مش إيراد المحل ولا نصيب حلاق).
//
// الباج اللي الاختبار ده بيمسكه: `staffShares` كان بيسعّر كل بند بـ
// `discount_type: "none"` فالعمولات بتتجمع **قبل الخصم** والفاتورة **بعده** →
// فاتورة ٥٦٠ بخصم ٦٠ = ٥٠٠ في الدرج و٥٦٠ في العمولات. وتقرير الأداء بيجمع من
// `order_sellers` فإيراد كل حلاق بيطلع مضروب، والمحل بيدفع عمولة على فلوس مادخلتش.
//
// وبيختبر كمان:
//   • خصم بالنسبة (بيوزّع نفسه بالتناسب لوحده)
//   • **الكسور**: ٣ حلاقين على ٢٠ جنيه صافي — المجموع لازم يطلع ٢٠.٠٠ بالمليم
//     مش ٢٠.٠١، فلازم فضلة التقريب تروح لواحد مش تتوزّع على الكل
//   • **الفاتورة المجانية**: صفر فلوس = صفر عمولة
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-commission-discount.js
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
// مليم واحد — الفلوس مابتتقارنش بـ===
const near = (a, b) => Math.abs(a - b) < 0.005;
const money = (n) => n.toFixed(2);

// ⚠️ استثناء مش متمسوك في إلكترون بيفتح ديالوج ويوقف كل الاختبارات
process.on("uncaughtException", (e) => {
  console.log(`✗ FAIL استثناء: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.log(`✗ FAIL رفض غير متمسوك: ${e}`);
  process.exit(1);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-commission-"));
try {
  initDatabase(dir);
  const db = getDatabase();

  const mkUser = (localId, name, role) =>
    Number(
      db
        .prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES (?,?,?,?,1)")
        .run(localId, name, localId, role).lastInsertRowid
    );
  const managerId = mkUser("u-m", "مدير", "manager");
  const samah = mkUser("u-s", "سماح", "stylist");
  const mona = mkUser("u-n", "منى", "stylist");
  const hoda = mkUser("u-h", "هدى", "stylist");
  const actor = { id: managerId, name: "مدير" };

  const cat = Number(
    db
      .prepare(
        "INSERT INTO categories (local_id, name, sort_order, sync_status) VALUES ('c','خدمات',1,'pending')"
      )
      .run().lastInsertRowid
  );
  const svc = (name, price) => productsRepository.create({ name, category_id: cat, price }, managerId);
  const dye = svc("صبغة", 300);
  const blow = svc("استشوار", 100);
  const cut = svc("قص", 80);
  const ten = svc("تنظيف سريع", 10);

  const chairs = [1, 2, 3].map((n) => gamingRepository.saveRoom({ name: `كرسي ${n}` }, managerId).room);

  // نصيب كل حلاق من فاتورة معيّنة
  const sellersOf = (orderId) =>
    db
      .prepare("SELECT seller_id, seller_name, attributed_amount FROM order_sellers WHERE order_id = ?")
      .all(orderId);
  const share = (rows, id) => rows.find((r) => r.seller_id === id)?.attributed_amount ?? -1;
  const sum = (rows) => rows.reduce((s, r) => s + r.attributed_amount, 0);

  // ===== ① خصم مبلغ ثابت =====
  // سماح: صبغة ٣٠٠ + قص ٨٠ = ٣٨٠ · منى: استشوار ١٠٠ = ١٠٠ · الإجمالي ٤٨٠
  // خصم ٨٠ → الصافي ٤٠٠. نصيب سماح ٣٨٠ − ٨٠×(٣٨٠/٤٨٠) = ٣١٦٫٦٧ · منى ٨٣٫٣٣
  console.log("\n— خصم مبلغ ثابت —");
  const s1 = gamingRepository.openSession({ room_id: chairs[0].id, staff_id: samah }, actor);
  gamingRepository.addItem({ session_id: s1.id, product_id: dye.id, quantity: 1 }, actor);
  gamingRepository.addItem({ session_id: s1.id, product_id: cut.id, quantity: 1 }, actor);
  gamingRepository.addItem({ session_id: s1.id, product_id: blow.id, quantity: 1, staff_id: mona }, actor);
  const r1 = gamingRepository.checkout(
    {
      session_id: s1.id,
      payment_method: "cash",
      amount_paid: 500,
      discount_type: "fixed",
      discount_value: 80,
    },
    actor
  );
  const o1 = r1.order;
  const sl1 = sellersOf(o1.id);
  ok(near(o1.total, 400), `الفاتورة ٤٠٠ بعد خصم ٨٠ (الفعلي ${money(o1.total)})`);
  ok(
    near(sum(sl1), o1.total),
    `🔴 **مجموع العمولات = إجمالي الفاتورة** — المفروض ${money(o1.total)} والفعلي ${money(sum(sl1))}`
  );
  ok(near(share(sl1, samah), 316.67), `نصيب سماح ٣١٦٫٦٧ بالتناسب (الفعلي ${money(share(sl1, samah))})`);
  ok(near(share(sl1, mona), 83.33), `ونصيب منى ٨٣٫٣٣ (الفعلي ${money(share(sl1, mona))})`);

  // ===== ② خصم بالنسبة =====
  // سماح صبغة ٣٠٠ · منى قص ٨٠ → ٣٨٠، خصم ١٠٪ = ٣٨ → الصافي ٣٤٢
  // النسبة بتوزّع نفسها: سماح ٢٧٠ · منى ٧٢
  console.log("\n— خصم بالنسبة —");
  const s2 = gamingRepository.openSession({ room_id: chairs[1].id, staff_id: samah }, actor);
  gamingRepository.addItem({ session_id: s2.id, product_id: dye.id, quantity: 1 }, actor);
  gamingRepository.addItem({ session_id: s2.id, product_id: cut.id, quantity: 1, staff_id: mona }, actor);
  const r2 = gamingRepository.checkout(
    {
      session_id: s2.id,
      payment_method: "cash",
      amount_paid: 400,
      discount_type: "percentage",
      discount_value: 10,
    },
    actor
  );
  const sl2 = sellersOf(r2.order.id);
  ok(near(r2.order.total, 342), `الفاتورة ٣٤٢ بعد ١٠٪ (الفعلي ${money(r2.order.total)})`);
  ok(near(sum(sl2), r2.order.total), `ومجموع العمولات = ٣٤٢ (الفعلي ${money(sum(sl2))})`);
  ok(near(share(sl2, samah), 270), `سماح ٢٧٠ (الفعلي ${money(share(sl2, samah))})`);
  ok(near(share(sl2, mona), 72), `ومنى ٧٢ (الفعلي ${money(share(sl2, mona))})`);

  // ===== ③ الكسور — أخطر حالة في التقريب =====
  // ٣ حلاقين كل واحد خدمة بـ١٠ = ٣٠، خصم ١٠ → الصافي ٢٠.
  // نصيب كل واحد = ٦٫٦٦٦٧ → لو كل واحد اتقرّب لوحده: ٦٫٦٧×٣ = ٢٠٫٠١ ≠ ٢٠.
  // فلازم الفضلة تتصحّح في واحد — والمجموع يطلع ٢٠٫٠٠ بالمليم.
  console.log("\n— الكسور: المجموع لازم يقفل بالمليم —");
  const s3 = gamingRepository.openSession({ room_id: chairs[2].id, staff_id: samah }, actor);
  gamingRepository.addItem({ session_id: s3.id, product_id: ten.id, quantity: 1 }, actor);
  gamingRepository.addItem({ session_id: s3.id, product_id: ten.id, quantity: 1, staff_id: mona }, actor);
  gamingRepository.addItem({ session_id: s3.id, product_id: ten.id, quantity: 1, staff_id: hoda }, actor);
  const r3 = gamingRepository.checkout(
    {
      session_id: s3.id,
      payment_method: "cash",
      amount_paid: 50,
      discount_type: "fixed",
      discount_value: 10,
    },
    actor
  );
  const sl3 = sellersOf(r3.order.id);
  ok(near(r3.order.total, 20), `الفاتورة ٢٠ (الفعلي ${money(r3.order.total)})`);
  ok(sl3.length === 3, `التلات حلاقين في الإسناد (الفعلي ${sl3.length})`);
  ok(
    near(sum(sl3), 20),
    `**المجموع ٢٠٫٠٠ بالمليم مش ٢٠٫٠١** (الفعلي ${money(sum(sl3))})`
  );
  ok(
    sl3.every((r) => r.attributed_amount > 6.6 && r.attributed_amount < 6.75),
    `وكل واحد قريب من ٦٫٦٧ — مفيش واحد شايل الفضلة كلها (${sl3.map((r) => money(r.attributed_amount)).join(" · ")})`
  );

  // ===== ④ الفاتورة المجانية = صفر عمولة =====
  // الفلوس المجانية برّه حساب المحل، فمفيش عمولة على فلوس مادخلتش.
  console.log("\n— الفاتورة المجانية —");
  gamingRepository.saveRoom({ name: "كرسي 4" }, managerId);
  const chair4 = gamingRepository.listRooms().find((r) => r.name === "كرسي 4");
  const s4 = gamingRepository.openSession({ room_id: chair4.id, staff_id: samah }, actor);
  gamingRepository.addItem({ session_id: s4.id, product_id: dye.id, quantity: 1 }, actor);
  const r4 = gamingRepository.checkout(
    {
      session_id: s4.id,
      payment_method: "cash",
      amount_paid: 0,
      discount_type: "none",
      discount_value: 0,
      is_free: true,
      free_recipient_type: "customer",
      free_recipient_name: "بنت صاحب المحل",
    },
    actor
  );
  const sl4 = sellersOf(r4.order.id);
  // ⚠️ الفاتورة المجانية **بتحفظ قيمتها** (٣٠٠) — الصفر في المدفوع مش في الإجمالي.
  ok(near(r4.order.total, 300), `الفاتورة المجانية قيمتها محفوظة ٣٠٠ (الفعلي ${money(r4.order.total)})`);
  ok(near(r4.order.amount_paid, 0), `والمدفوع صفر (الفعلي ${money(r4.order.amount_paid)})`);
  ok(
    near(sum(sl4), 0),
    `**وصفر عمولة** — المحل ماخدش فلوس فمايدفعش عمولة على هدية (الفعلي ${money(sum(sl4))})`
  );

  // ===== ⑤ تقرير الأداء بيطابق الفلوس =====
  // التقرير بيجمع من `order_sellers`، فلو العمولة بايظة التقرير بايظ معاها.
  console.log("\n— تقرير الأداء بيطابق الدرج —");
  const bd = db.prepare("SELECT business_date FROM orders WHERE id = ?").get(o1.id).business_date;
  const perf = gamingRepository.stylistPerformance(bd, bd);
  const paid = db
    .prepare("SELECT COALESCE(SUM(total), 0) t FROM orders WHERE business_date = ? AND is_free = 0 AND status = 'paid'")
    .get(bd).t;
  const reported = perf.reduce((s, p) => s + p.revenue, 0);
  ok(
    near(reported, paid),
    `مجموع إيراد الحلاقين = مبيعات اليوم — المفروض ${money(paid)} والفعلي ${money(reported)}`
  );

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ العمولة بتطابق الفلوس بالمليم");
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

// ⚠️ خروج صريح: إلكترون بيسيب الـevent loop شغّال فالاختبار بيفضل معلّق للأبد
process.exit(process.exitCode ?? 0);
