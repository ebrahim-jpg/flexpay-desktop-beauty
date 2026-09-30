// اختبار **عمولة الحلاقين** — من وصلة الواجهة (gamingRepository → ordersRepository.create).
//
// ده أخطر منطق في نسخة التجميل: فلوس الحلاقين بتتحدد منه.
//
//   • الجلسة **مابتتفتحش بلا حلاق** (ولا بحلاق موقوف/مش موجود).
//   • الخدمة بتورث الحلاق الأساسي تلقائي.
//   • خدمة بحلاق تاني → بتتسجّل باسمه هو.
//   • نفس الخدمة بحلاقين مختلفين = **بندين** (مش بند واحد بكمية ٢) وإلا العمولة
//     بتروح كلها لواحد.
//   • عند الحساب: `order_sellers` فيه كل حلاق بـ`attributed_amount` =
//     **مجموع أسعار بنوده بالظبط**، ومجموعهم = إجمالي البنود.
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-stylist-commission.js
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
function rejects(fn, m, contains) {
  try {
    fn();
    ok(false, `${m} — عدّى وهو المفروض يترفض`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ok(msg.includes(contains), `${m} («${msg}»)`);
  }
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-beauty-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  const mkUser = (localId, name, role, active = 1) =>
    Number(
      db
        .prepare(
          "INSERT INTO users (local_id, name, username, role, is_active) VALUES (?,?,?,?,?)"
        )
        .run(localId, name, localId, role, active).lastInsertRowid
    );
  const managerId = mkUser("u-m", "مدير", "manager");
  const samah = mkUser("u-s", "سماح", "stylist");
  const mona = mkUser("u-n", "منى", "stylist");
  const stopped = mkUser("u-x", "موقوفة", "stylist", 0);
  const actor = { id: managerId, name: "مدير" };

  const cat = Number(
    db
      .prepare(
        "INSERT INTO categories (local_id, name, icon, sort_order, sync_status) VALUES ('c','خدمات','scissors',1,'pending')"
      )
      .run().lastInsertRowid
  );
  const dye = productsRepository.create({ name: "صبغة", category_id: cat, price: 300 }, managerId);
  const blow = productsRepository.create({ name: "استشوار", category_id: cat, price: 100 }, managerId);
  const cut = productsRepository.create({ name: "قص", category_id: cat, price: 80 }, managerId);

  const chair = gamingRepository.saveRoom({ name: "كرسي 1", area: "الصالة" }, managerId).room;

  // ===== ① الحلاق إجباري =====
  console.log("\n— الحلاق إجباري —");
  rejects(
    () => gamingRepository.openSession({ room_id: chair.id, staff_id: 99999 }, actor),
    "حلاق مش موجود = مرفوض",
    "الموظف غير موجود"
  );
  rejects(
    () => gamingRepository.openSession({ room_id: chair.id, staff_id: stopped }, actor),
    "حلاق موقوف = مرفوض",
    "موقوف"
  );

  const s = gamingRepository.openSession({ room_id: chair.id, staff_id: samah }, actor);
  ok(s.staff_id === samah && s.staff_name === "سماح", "الجلسة اتفتحت بسماح كحلاق أساسي");

  // ===== ② التوريث والتحديد الصريح =====
  console.log("\n— التوريث والتحديد —");
  gamingRepository.addItem({ session_id: s.id, product_id: dye.id, quantity: 1 }, actor);
  let items = gamingRepository.getSession(s.id).items;
  ok(items[0].staff_id === samah, "الصبغة ورثت سماح تلقائي (من غير ما نحددها)");

  gamingRepository.addItem(
    { session_id: s.id, product_id: blow.id, quantity: 1, staff_id: mona },
    actor
  );
  items = gamingRepository.getSession(s.id).items;
  const blowItem = items.find((i) => i.product_name === "استشوار");
  ok(blowItem.staff_id === mona && blowItem.staff_name === "منى", "والاستشوار اتسجّل لمنى صراحةً");

  // نفس الخدمة بحلاقين مختلفين = بندين
  gamingRepository.addItem({ session_id: s.id, product_id: cut.id, quantity: 1 }, actor);
  gamingRepository.addItem(
    { session_id: s.id, product_id: cut.id, quantity: 1, staff_id: mona },
    actor
  );
  items = gamingRepository.getSession(s.id).items;
  const cuts = items.filter((i) => i.product_name === "قص");
  ok(cuts.length === 2, `«قص» بحلاقين = **بندين** (الفعلي ${cuts.length}) — وإلا العمولة تروح لواحد`);
  ok(
    cuts.some((c) => c.staff_id === samah) && cuts.some((c) => c.staff_id === mona),
    "وكل بند باسم صاحبه"
  );

  // ===== ③ العمولة عند الحساب =====
  console.log("\n— العمولة في الفاتورة —");
  // سماح: صبغة 300 + قص 80 = 380 · منى: استشوار 100 + قص 80 = 180 · الإجمالي 560
  const res = gamingRepository.checkout(
    { session_id: s.id, payment_method: "cash", amount_paid: 1000, discount_type: "none", discount_value: 0 },
    actor
  );
  const sellers = db
    .prepare(
      "SELECT seller_id, seller_name, attributed_amount FROM order_sellers WHERE order_id = ? ORDER BY seller_id"
    )
    .all(res.order.id);
  ok(sellers.length === 2, `الفاتورة فيها إسناد لحلاقين (الفعلي ${sellers.length})`);
  const share = (id) => sellers.find((x) => x.seller_id === id)?.attributed_amount ?? -1;
  ok(near(share(samah), 380), `نصيب سماح = ٣٨٠ (صبغة ٣٠٠ + قص ٨٠) — الفعلي ${share(samah)}`);
  ok(near(share(mona), 180), `ونصيب منى = ١٨٠ (استشوار ١٠٠ + قص ٨٠) — الفعلي ${share(mona)}`);
  ok(
    near(share(samah) + share(mona), 560),
    `**ومجموعهم = إجمالي البنود ٥٦٠** (الفعلي ${share(samah) + share(mona)})`
  );
  ok(
    sellers.every((x) => x.seller_name),
    "ولقطة الاسم محفوظة (الفاتورة القديمة تفضل مقروءة لو الموظف اتشال)"
  );

  // ===== ⑦ تقرير أداء الحلاقين =====
  console.log("\n— تقرير الأداء —");
  const bd = db.prepare("SELECT business_date FROM orders WHERE id = ?").get(res.order.id).business_date;
  const perf = gamingRepository.stylistPerformance(bd, bd);
  ok(perf.length === 2, `التقرير فيه الحلاقين الاتنين (الفعلي ${perf.length})`);
  const pr = (id) => perf.find((x) => x.staff_id === id);
  ok(
    near(pr(samah).revenue, 380),
    `إيراد سماح ٣٨٠ — من order_sellers مش من بنود الجلسة (الفعلي ${pr(samah).revenue})`
  );
  ok(near(pr(mona).revenue, 180), `وإيراد منى ١٨٠ (الفعلي ${pr(mona).revenue})`);
  ok(pr(samah).sessions === 1, "وسماح كانت الحلاق الأساسي في جلسة واحدة");
  ok(
    pr(mona).sessions === 0,
    "ومنى ماكانتش أساسية في أي جلسة — بس ليها خدمات وإيراد"
  );
  ok(pr(samah).services === 2 && pr(mona).services === 2, "وكل واحدة ليها خدمتين");
  ok(perf[0].staff_id === samah, "والترتيب بالإيراد (الأعلى الأول)");

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ عمولة الحلاقين وتقريرهم سليمين");
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

// ⚠️ خروج صريح: إلكترون بيسيب الـevent loop شغّال فالاختبار بيفضل معلّق للأبد.
process.exit(process.exitCode ?? 0);
