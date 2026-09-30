// اختبار **دفعات المطبخ** — من وصلة الواجهة (gamingRepository).
//
// المشكلة اللي بيحرسها: كل صنف بيتضاف لطاولة كان بيطبع ورقة تجهيز لوحده —
// طاولة واخدة ١٠ أصناف = **١٠ ورقات**. الحل: المعلّق (`quantity - sent_qty`)
// بيطلع في **تذكرة واحدة**، وبعدها الأصناف بتتعلّم إنها راحت.
//
//   • ٣ أصناف → المعلّق ٣ → إرسال → المعلّق صفر ودفعة ١.
//   • صنفين جداد → المعلّق **٢ بس** (مش ٥) → إرسال → دفعة ٢.
//   • زيادة بند راح خلاص من ١ لـ٢ → المعلّق **١ (الفرق)** مش ٢ — المطبخ مايعيدش.
//   • تقليل بند تحت المرسَل → `sent_qty` بيتقصّر والمعلّق مايبقاش سالب.
//   • دمج طاولتين → `sent_qty` بيتجمع فالمرسَل ماينرسلش تاني.
//   • الحجم والإضافات والملاحظة بتطلع في بند المعلّق (التذكرة بتحتاجهم).
//
// ⚠️ الاختبار على **الريبو** مش على الطباعة: الريبو مايعرفش الطابعة عن قصد
// (الـIPC بيطبع بين `pendingKitchenItems` و`markKitchenSent`)، فالمنطق يتجرّب
// من غير نافذة ولا طابعة.
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-kitchen-batches.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { gamingRepository } = require(path.join(base, "repositories", "gaming.repository.js"));
const { productsRepository } = require(path.join(base, "repositories", "products.repository.js"));
const { sizesRepository } = require(path.join(base, "repositories", "sizes.repository.js"));

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-kitchen-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  const actorId = Number(
    db
      .prepare(
        "INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u1','مدير','m','manager',1)"
      )
      .run().lastInsertRowid
  );
  const actor = { id: actorId, name: "مدير" };
  const cat = Number(
    db
      .prepare(
        "INSERT INTO categories (local_id, name, icon, sort_order, sync_status) VALUES ('cat','أكل','pizza',1,'pending')"
      )
      .run().lastInsertRowid
  );

  const pizza = productsRepository.create({ name: "بيتزا", category_id: cat, price: 1 }, actorId);
  const sizes = sizesRepository.save(
    { product_id: pizza.id, sizes: [{ size: "لارج", price_override: 180 }] },
    actorId
  );
  const large = sizes[0];
  productsRepository.update(
    {
      id: pizza.id,
      modifiers: [
        {
          id: "g1",
          name: "إضافات",
          is_required: false,
          multi_select: true,
          options: [{ id: "o-cheese", name: "جبنة إضافي", price_adjustment: 10 }],
        },
      ],
    },
    actorId
  );
  const cola = productsRepository.create({ name: "كولا", category_id: cat, price: 15 }, actorId);
  const water = productsRepository.create({ name: "مياه", category_id: cat, price: 5 }, actorId);

  const t1 = gamingRepository.saveRoom({ name: "طاولة 1", area: "الصالة" }, actorId).room;
  const t2 = gamingRepository.saveRoom({ name: "طاولة 2", area: "الصالة" }, actorId).room;
  const s1 = gamingRepository.openSession({ room_id: t1.id }, actor);

  const pending = (sid) => gamingRepository.pendingKitchenItems(sid);
  const batches = (sid) => gamingRepository.getSession(sid).kitchen_batches;

  // ===== ① الدفعة الأولى =====
  console.log("\n— الدفعة الأولى —");
  gamingRepository.addItem(
    { session_id: s1.id, product_id: pizza.id, quantity: 1, variant_id: large.id, modifier_option_ids: ["o-cheese"], notes: "بلا زيتون" },
    actor
  );
  gamingRepository.addItem({ session_id: s1.id, product_id: cola.id, quantity: 2 }, actor);
  gamingRepository.addItem({ session_id: s1.id, product_id: water.id, quantity: 1 }, actor);

  let p = pending(s1.id);
  ok(p.length === 3, `المعلّق ٣ أصناف (الفعلي ${p.length})`);
  const pz = p.find((x) => x.name === "بيتزا");
  ok(pz.size === "لارج", "وبند البيتزا فيه الحجم (التذكرة محتاجاه)");
  ok(pz.options.length === 1 && pz.options[0] === "جبنة إضافي", "والإضافة المختارة");
  ok(pz.notes === "بلا زيتون", "والملاحظة");
  ok(near(p.find((x) => x.name === "كولا").quantity, 2), "والكمية صح");

  ok(batches(s1.id) === 0, "مفيش دفعات لسه");
  const b1 = gamingRepository.markKitchenSent(s1.id, actor);
  ok(b1 === 1, `الدفعة الأولى رقمها ١ (الفعلي ${b1})`);
  ok(pending(s1.id).length === 0, "**وبعد الإرسال المعلّق صفر** — إعادة الإرسال مابتطبعش حاجة");

  // ===== ② دفعة تانية بالجديد بس =====
  console.log("\n— الدفعة التانية —");
  const juice = productsRepository.create({ name: "عصير", category_id: cat, price: 20 }, actorId);
  const salad = productsRepository.create({ name: "سلطة", category_id: cat, price: 25 }, actorId);
  gamingRepository.addItem({ session_id: s1.id, product_id: juice.id, quantity: 1 }, actor);
  gamingRepository.addItem({ session_id: s1.id, product_id: salad.id, quantity: 1 }, actor);

  p = pending(s1.id);
  ok(p.length === 2, `المعلّق ٢ بس مش ٥ (الفعلي ${p.length}) — المطبخ مايعيدش اللي عمله`);
  ok(
    p.every((x) => x.name === "عصير" || x.name === "سلطة"),
    "والأصناف الجديدة بس هي اللي في التذكرة"
  );
  const b2 = gamingRepository.markKitchenSent(s1.id, actor);
  ok(b2 === 2, `الدفعة التانية رقمها ٢ (الفعلي ${b2})`);

  // ===== ③ زيادة كمية بند راح خلاص → الفرق بس =====
  console.log("\n— زيادة بعد الإرسال —");
  const colaItem = gamingRepository.getSession(s1.id).items.find((i) => i.product_name === "كولا");
  ok(near(colaItem.sent_qty, 2), "الكولا راحت ٢");
  gamingRepository.updateItemQuantity(colaItem.id, 3);
  p = pending(s1.id);
  ok(p.length === 1 && near(p[0].quantity, 1), `المعلّق «كولا ×١» — الفرق بس (الفعلي ${p.length ? p[0].quantity : "—"})`);
  gamingRepository.markKitchenSent(s1.id, actor);
  ok(pending(s1.id).length === 0, "وبعد الإرسال خلاص");

  // ===== ④ تقليل تحت المرسَل =====
  console.log("\n— تقليل بعد الإرسال —");
  gamingRepository.updateItemQuantity(colaItem.id, 1);
  const after = gamingRepository.getSession(s1.id).items.find((i) => i.id === colaItem.id);
  ok(near(after.quantity, 1) && near(after.sent_qty, 1), "sent_qty اتقصّر للكمية الجديدة");
  ok(pending(s1.id).length === 0, "**والمعلّق مابقاش سالب** (كان هيلخبط الدفعة الجاية)");

  // ===== ⑤ الدمج =====
  console.log("\n— دمج طاولتين —");
  const s2 = gamingRepository.openSession({ room_id: t2.id }, actor);
  // نفس الصنف بنفس الخيارات على الطاولة التانية، وراح للمطبخ هناك
  gamingRepository.addItem({ session_id: s2.id, product_id: water.id, quantity: 2 }, actor);
  gamingRepository.markKitchenSent(s2.id, actor);
  ok(pending(s2.id).length === 0, "مياه الطاولة ٢ راحت للمطبخ");

  gamingRepository.mergeSessions(s2.id, s1.id, actor);
  const merged = gamingRepository.getSession(s1.id).items.find((i) => i.product_name === "مياه");
  ok(near(merged.quantity, 3), `المياه بقت ٣ بعد الدمج (الفعلي ${merged.quantity})`);
  ok(near(merged.sent_qty, 3), `**و sent_qty بقى ٣ كمان** (الفعلي ${merged.sent_qty})`);
  ok(
    pending(s1.id).length === 0,
    "فالأصناف اللي راحت للمطبخ في الطاولتين **ماترجعش تتطبع تاني** بعد الدمج"
  );

  // ===== ⑥ الحساب بمعلّق =====
  console.log("\n— الحساب بمعلّق —");
  gamingRepository.addItem({ session_id: s1.id, product_id: salad.id, quantity: 1 }, actor);
  ok(pending(s1.id).length === 1, "صنف جديد معلّق قبل الحساب");
  const res = gamingRepository.checkout(
    { session_id: s1.id, payment_method: "cash", amount_paid: 10000, discount_type: "none", discount_value: 0 },
    actor
  );
  ok(res.order.id > 0, "الحساب اتسجّل");
  // ⚠️ الطباعة التلقائية في الـIPC مش في الريبو — الاختبار بيثبت إن المعلّق كان
  // موجود وقت الحساب (يعني فيه حاجة للـIPC يطبعها)، والحارس الثابت بيثبت الربط.
  ok(
    gamingRepository.getSession(s1.id).status === "closed",
    "والحساب اتقفل"
  );

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ دفعات المطبخ سليمة");
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
