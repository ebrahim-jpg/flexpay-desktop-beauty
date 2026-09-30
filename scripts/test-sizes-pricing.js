// اختبار أحجام المنتج — **التسعير** من وصلة الواجهة (sizesRepository → ordersRepository.create).
//
// المشكلة اللي بيحرسها: الخيارات (`modifiers`) بتزوّد السعر (`price_adjustment`)، فبيتزا
// سعرها الأساسي = سعر السمول كانت بتاخد زيادة **تانية** أول ما الكاشير يختار «سمول».
// الحجم **بديل سعر** — بيستبدل سعر المنتج، والإضافات بتتجمع فوقه.
//
//   • سعر كل حجم هو سعر البند (مش سعر المنتج + زيادة).
//   • السعر الأساسي للمنتج بيتحسب لوحده = **أرخص حجم فعّال**.
//   • إضافة +١٠ على اللارج = سعر اللارج + ١٠ (الإضافات لسه بتتجمع).
//   • منتج بأحجام بلا حجم = **مرفوض**؛ وكل الأحجام موقوفة = مرفوض برسالة مختلفة.
//   • منتج بلا أحجام (كولا) بيتباع زي الأساس بالحرف.
//   • المزامنة: الأحجام جوّه payload المنتج، المصفوفة كاملة، وبلا stock_qty.
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-sizes-pricing.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { productsRepository } = require(path.join(base, "repositories", "products.repository.js"));
const { sizesRepository } = require(path.join(base, "repositories", "sizes.repository.js"));
const { ordersRepository } = require(path.join(base, "repositories", "orders.repository.js"));

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

// ⚠️ أي استثناء مش متمسوك في إلكترون بيفتح **ديالوج** بيوقف التشغيل لحد ما حد يدوس OK
process.on("uncaughtException", (e) => {
  console.log(`✗ FAIL استثناء: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.log(`✗ FAIL رفض غير متمسوك: ${e}`);
  process.exit(1);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-sizes-price-"));
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
  const cat = Number(
    db
      .prepare(
        "INSERT INTO categories (local_id, name, icon, sort_order, sync_status) VALUES ('cat','بيتزا','pizza',1,'pending')"
      )
      .run().lastInsertRowid
  );
  const sell = (items) =>
    ordersRepository.create(
      {
        items,
        is_guest: true,
        order_type: "counter",
        payment_method: "cash",
        amount_paid: 1000,
        discount_type: "none",
        discount_value: 0,
      },
      actorId,
      "مدير"
    );
  const productRow = (id) => db.prepare("SELECT price, cost_price, has_sizes FROM products WHERE id = ?").get(id);

  // ===== ① السلوك القديم لسه زي ما هو =====
  console.log("\n— منتج بلا أحجام: سلوك الأساس بالحرف —");
  // ⚠️ سعر البيتزا ١ عن قصد: بعد إضافة الأحجام المفروض **يتجاهل** ويتحسب من أرخص حجم
  const pizza = productsRepository.create({ name: "بيتزا", category_id: cat, price: 1 }, actorId);
  const cola = productsRepository.create({ name: "كولا", category_id: cat, price: 15 }, actorId);

  const before = sell([{ product_id: pizza.id, quantity: 1, modifier_option_ids: [] }]);
  ok(near(before.order.items[0].unit_price, 1), "بلا أحجام: السعر = سعر المنتج");
  ok(before.order.items[0].variant_id === null, "وبلا لقطة حجم على البند");

  // ===== ② الأحجام والسعر الأساسي المحسوب =====
  console.log("\n— الأحجام والسعر الأساسي —");
  const saved = sizesRepository.save(
    {
      product_id: pizza.id,
      sizes: [
        { size: "سمول", price_override: 100, sort_order: 0 },
        { size: "ميديم", price_override: 140, sort_order: 1 },
        { size: "لارج", price_override: 180, sort_order: 2 },
      ],
    },
    actorId
  );
  ok(saved.length === 3, "٣ أحجام اتحفظوا بالترتيب");
  const small = saved.find((s) => s.size === "سمول");
  const large = saved.find((s) => s.size === "لارج");

  const p1 = productRow(pizza.id);
  ok(p1.has_sizes === 1, "العلم has_sizes اتحط (نية صريحة مش عدّ مشتق)");
  ok(near(p1.price, 100), `السعر الأساسي اتحسب لوحده من أرخص حجم = ١٠٠ (الفعلي ${p1.price})`);

  // تكرار حجم مرفوض قبل أي كتابة
  rejects(
    () =>
      sizesRepository.save(
        { product_id: pizza.id, sizes: [{ size: "لارج" }, { size: "لارج" }] },
        actorId
      ),
    "حجم مكرر = مرفوض",
    "مكرر"
  );
  ok(sizesRepository.getByProduct(pizza.id).length === 3, "والرفض مامسّش الأحجام الموجودة");

  // ===== ③ التسعير: بديل مش زيادة =====
  console.log("\n— التسعير: الحجم بديل مش زيادة —");
  const lineL = sell([
    { product_id: pizza.id, quantity: 1, modifier_option_ids: [], variant_id: large.id },
  ]).order.items[0];
  ok(near(lineL.unit_price, 180), `لارج = ١٨٠ بالظبط مش ١٠٠+زيادة (الفعلي ${lineL.unit_price})`);
  ok(near(lineL.base_price, 180), "و base_price على البند = سعر الحجم");
  ok(lineL.variant_size === "لارج" && lineL.variant_id === large.id, "لقطة الحجم على البند");

  const lineS = sell([
    { product_id: pizza.id, quantity: 2, modifier_option_ids: [], variant_id: small.id },
  ]).order.items[0];
  ok(near(lineS.total_price, 200), `سمول × ٢ = ٢٠٠ — مفيش أي زيادة على السمول (الفعلي ${lineS.total_price})`);

  // ===== ④ الإضافة لسه بتتجمع فوق سعر الحجم =====
  console.log("\n— الإضافة زيادة فوق سعر الحجم —");
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
  const lineAddon = sell([
    { product_id: pizza.id, quantity: 1, modifier_option_ids: ["o-cheese"], variant_id: large.id },
  ]).order.items[0];
  ok(near(lineAddon.unit_price, 190), `لارج + جبنة = ١٩٠ (الفعلي ${lineAddon.unit_price})`);

  // ===== ⑤ الحراس =====
  console.log("\n— الحراس —");
  rejects(
    () => sell([{ product_id: pizza.id, quantity: 1, modifier_option_ids: [] }]),
    "منتج بأحجام بلا حجم = مرفوض",
    "لازم تختار حجم"
  );
  rejects(
    () => sell([{ product_id: pizza.id, quantity: 1, modifier_option_ids: [], variant_id: 99999 }]),
    "حجم مش موجود = مرفوض",
    "الحجم غير موجود"
  );
  const lineCola = sell([{ product_id: cola.id, quantity: 1, modifier_option_ids: [] }]).order.items[0];
  ok(near(lineCola.unit_price, 15), "الكولا (بلا أحجام) بتتباع عادي — الفرق عن الملابس");

  // إيقاف أرخص حجم
  sizesRepository.save(
    {
      product_id: pizza.id,
      sizes: [
        { id: small.id, size: "سمول", price_override: 100, sort_order: 0, is_active: false },
        { id: large.id, size: "لارج", price_override: 180, sort_order: 1 },
      ],
    },
    actorId
  );
  rejects(
    () => sell([{ product_id: pizza.id, quantity: 1, modifier_option_ids: [], variant_id: small.id }]),
    "حجم موقوف = مرفوض",
    "موقوف"
  );
  ok(
    near(productRow(pizza.id).price, 180),
    `إيقاف أرخص حجم بيرفع السعر الأساسي لأرخص حجم **فعّال** (الفعلي ${productRow(pizza.id).price})`
  );
  ok(sizesRepository.getByProduct(pizza.id).length === 2, "الحجم اللي اختفى من المصفوفة (ميديم) اتشال");

  // كل الأحجام موقوفة → رسالة مختلفة (مش بيعة بالسعر الأساسي بصمت — ده باج الملابس)
  sizesRepository.save(
    {
      product_id: pizza.id,
      sizes: [
        { id: small.id, size: "سمول", price_override: 100, sort_order: 0, is_active: false },
        { id: large.id, size: "لارج", price_override: 180, sort_order: 1, is_active: false },
      ],
    },
    actorId
  );
  rejects(
    () => sell([{ product_id: pizza.id, quantity: 1, modifier_option_ids: [] }]),
    "كل الأحجام موقوفة = مرفوض برسالة واضحة",
    "كل أحجام"
  );
  ok(productRow(pizza.id).has_sizes === 1, "والعلم فاضل ١ (مايتشالش غير بحذف الأحجام كلها)");

  // ===== ⑥ المزامنة =====
  console.log("\n— المزامنة —");
  const payloads = db
    .prepare("SELECT payload FROM sync_queue WHERE entity_type = 'product' ORDER BY id DESC")
    .all()
    .map((r) => JSON.parse(r.payload));
  const withVariants = payloads.find((r) => Array.isArray(r.variants));
  ok(!!withVariants, "الأحجام بتتبعت جوّه payload المنتج (مالهاش entity لوحدها)");
  ok(withVariants.variants.length === 2, "والمصفوفة **كاملة** — $set على الويب بيستبدل");
  ok(
    withVariants.variants.every((v) => "size" in v && "price_override" in v && "cost_price" in v),
    "بأسماء الحقول اللي الويب بيعرفها (size/price_override/cost_price)"
  );
  ok(withVariants.has_sizes === true, "و has_sizes بيتبعت للويب");
  ok(
    withVariants.variants.every((v) => !("stock_qty" in v)),
    "وبلا stock_qty — الرصيد في المواد مش على الحجم"
  );

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ تسعير الأحجام سليم");
} finally {
  try {
    closeDatabase();
  } catch {
    /* اتقفلت خلاص */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ويندوز بيقفل ملف الـWAL لحظة — التنضيف مش جزء من الاختبار */
  }
}

// ⚠️ لازم خروج صريح: إلكترون بيسيب الـevent loop شغّال لما الـapp يفضل حيّ، فالاختبار
// بيطبع نتيجته وبيفضل معلّق للأبد (والسويت بعده مابتشتغلش).
process.exit(process.exitCode ?? 0);
