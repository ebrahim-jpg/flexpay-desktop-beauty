// اختبار أحجام المنتج — **الوصفات والمخزون** من وصلة الواجهة (saveRecipe → ordersRepository.create).
//
// المشكلة اللي بيحرسها: `deductForOrder` كانت بتجيب `product_recipes WHERE product_id = ?`
// بس، فتلات وصفات لتلات أحجام على نفس المنتج = **التلاتة بيتخصموا مع كل بيعة**.
// (ده بالظبط السبب المكتوب في migration 027 بتاعة الملابس اللي خلّاها تسيب الوصفات.)
//
//   • بيع اللارج يخصم **وصفة اللارج + المشترك** بس — صفر من مكوّن السمول.
//   • حفظ وصفة حجم **مابيمسحش** وصفة حجم تاني ولا المشترك (أخطر باج ممكن).
//   • تكلفة كل حجم = وصفته + المشترك، وتكلفة المنتج = تكلفة أرخص حجم.
//   • `variant_cost_price` على البند = تكلفة الوحدة الحقيقية → COGS على الويب.
//   • الإضافة اللي بتخصم مادة («جبنة إضافي» = ٣٠ج) بتتخصم وبتدخل في تكلفة البند.
//   • الإتاحة: مكوّن **خاص باللارج** خلص → البيتزا **فاضلة في المنيو** (السمول ينفع).
//     ومكوّن **مشترك** خلص → المنتج كله مش متاح.
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-sizes-recipes.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { productsRepository } = require(path.join(base, "repositories", "products.repository.js"));
const { sizesRepository } = require(path.join(base, "repositories", "sizes.repository.js"));
const { inventoryRepository } = require(path.join(base, "repositories", "inventory.repository.js"));
const { ordersRepository } = require(path.join(base, "repositories", "orders.repository.js"));

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-sizes-recipe-"));
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

  // مواد: عجين (تكلفة ٢ للوحدة) · جبنة (٣) · كرتونة (٥ للواحدة) · زيتون خاص باللارج (١)
  const item = (localId, name, unit, qty, cost) =>
    Number(
      db
        .prepare(
          `INSERT INTO inventory_items (local_id, name, unit, current_quantity, alert_threshold,
             cost_per_unit, status, sync_status) VALUES (?,?,?,?,1,?,'sufficient','pending')`
        )
        .run(localId, name, unit, qty, cost).lastInsertRowid
    );
  const dough = item("i-dough", "عجين", "جرام", 10000, 2);
  const cheese = item("i-cheese", "جبنة", "جرام", 10000, 3);
  const box = item("i-box", "كرتونة", "قطعة", 100, 5);
  const olive = item("i-olive", "زيتون", "جرام", 200, 1);
  const stock = (id) => db.prepare("SELECT current_quantity FROM inventory_items WHERE id = ?").get(id).current_quantity;
  const available = (id) => db.prepare("SELECT is_available FROM products WHERE id = ?").get(id).is_available;

  const sell = (items) =>
    ordersRepository.create(
      {
        items,
        is_guest: true,
        order_type: "counter",
        payment_method: "cash",
        amount_paid: 10000,
        discount_type: "none",
        discount_value: 0,
      },
      actorId,
      "مدير"
    );

  const pizza = productsRepository.create({ name: "بيتزا", category_id: cat, price: 1 }, actorId);
  const sizes = sizesRepository.save(
    {
      product_id: pizza.id,
      sizes: [
        { size: "سمول", price_override: 100, sort_order: 0 },
        { size: "لارج", price_override: 180, sort_order: 1 },
      ],
    },
    actorId
  );
  const small = sizes.find((s) => s.size === "سمول");
  const large = sizes.find((s) => s.size === "لارج");

  // ===== ① وصفة مشتركة + وصفة لكل حجم =====
  console.log("\n— نطاقات الوصفة —");
  // المشترك: كرتونة واحدة لأي حجم
  productsRepository.saveRecipe(pizza.id, [{ inventory_item_id: box, standard_qty: 1 }], actorId, null);
  // السمول: عجين ١٥٠
  productsRepository.saveRecipe(pizza.id, [{ inventory_item_id: dough, standard_qty: 150 }], actorId, small.id);
  // اللارج: عجين ٣٠٠ + زيتون ٢٠
  productsRepository.saveRecipe(
    pizza.id,
    [
      { inventory_item_id: dough, standard_qty: 300 },
      { inventory_item_id: olive, standard_qty: 20 },
    ],
    actorId,
    large.id
  );

  ok(productsRepository.getRecipe(pizza.id, null).length === 1, "المشترك فيه بند واحد (الكرتونة)");
  ok(productsRepository.getRecipe(pizza.id, small.id).length === 1, "وصفة السمول بند واحد");
  ok(productsRepository.getRecipe(pizza.id, large.id).length === 2, "ووصفة اللارج بندين");
  ok(productsRepository.getRecipe(pizza.id).length === 4, "وكل صفوف المنتج = ٤");

  // إعادة حفظ وصفة اللارج مالهاش أي أثر على السمول ولا المشترك
  productsRepository.saveRecipe(
    pizza.id,
    [
      { inventory_item_id: dough, standard_qty: 300 },
      { inventory_item_id: olive, standard_qty: 25 },
    ],
    actorId,
    large.id
  );
  ok(productsRepository.getRecipe(pizza.id, null).length === 1, "حفظ وصفة اللارج مامسحش المشترك");
  ok(productsRepository.getRecipe(pizza.id, small.id).length === 1, "ولا مسح وصفة السمول");

  // ===== ② التكلفة =====
  console.log("\n— التكلفة —");
  const sizeCost = (id) => sizesRepository.getById(id).cost_price;
  // سمول = كرتونة ٥ + عجين ١٥٠×٢ = ٣٠٥
  ok(near(sizeCost(small.id), 305), `تكلفة السمول = ٣٠٥ (وصفتها + المشترك) — الفعلي ${sizeCost(small.id)}`);
  // لارج = ٥ + ٣٠٠×٢ + ٢٥×١ = ٦٣٠
  ok(near(sizeCost(large.id), 630), `تكلفة اللارج = ٦٣٠ — الفعلي ${sizeCost(large.id)}`);
  const prod = db.prepare("SELECT price, cost_price FROM products WHERE id = ?").get(pizza.id);
  ok(near(prod.cost_price, 305), `تكلفة المنتج = تكلفة أرخص حجم (٣٠٥) مش مجموع الأحجام — الفعلي ${prod.cost_price}`);
  ok(near(prod.price, 100), "وسعره = سعر نفس الحجم (١٠٠) فالهامش متطابق");

  // ===== ③ الخصم: وصفة الحجم المباع بس =====
  console.log("\n— الخصم —");
  const d0 = stock(dough);
  const b0 = stock(box);
  const o0 = stock(olive);
  const lineL = sell([
    { product_id: pizza.id, quantity: 2, modifier_option_ids: [], variant_id: large.id },
  ]).order.items[0];
  ok(near(d0 - stock(dough), 600), `لارج × ٢ خصم ٦٠٠ عجين (الفعلي ${d0 - stock(dough)})`);
  ok(near(b0 - stock(box), 2), "وكرتونتين من المشترك");
  ok(near(o0 - stock(olive), 50), "وزيتون اللارج ٥٠");
  ok(near(lineL.unit_price, 180), "والسعر سعر اللارج");
  const lineRow = db
    .prepare("SELECT variant_cost_price, variant_size FROM order_items WHERE id = ?")
    .get(lineL.id);
  ok(near(lineRow.variant_cost_price, 630), `لقطة تكلفة البند = ٦٣٠ → COGS على الويب (الفعلي ${lineRow.variant_cost_price})`);

  const d1 = stock(dough);
  const o1 = stock(olive);
  sell([{ product_id: pizza.id, quantity: 1, modifier_option_ids: [], variant_id: small.id }]);
  ok(near(d1 - stock(dough), 150), `سمول خصم ١٥٠ عجين بس (الفعلي ${d1 - stock(dough)})`);
  ok(near(o1 - stock(olive), 0), "و**صفر** من زيتون اللارج — ده لبّ الإصلاح");

  // ===== ④ الإضافة اللي بتخصم مادة =====
  console.log("\n— إضافة بتخصم مخزون —");
  productsRepository.update(
    {
      id: pizza.id,
      modifiers: [
        {
          id: "g1",
          name: "إضافات",
          is_required: false,
          multi_select: true,
          options: [
            { id: "o-cheese", name: "جبنة إضافي", price_adjustment: 10, inventory_item_id: cheese, consume_qty: 30 },
            { id: "o-nothing", name: "بلا بصل", price_adjustment: 0 },
          ],
        },
      ],
    },
    actorId
  );
  const c0 = stock(cheese);
  const lineAddon = sell([
    {
      product_id: pizza.id,
      quantity: 2,
      modifier_option_ids: ["o-cheese"],
      variant_id: small.id,
    },
  ]).order.items[0];
  ok(near(c0 - stock(cheese), 60), `جبنة إضافي × ٢ خصمت ٦٠ جرام (الفعلي ${c0 - stock(cheese)})`);
  ok(near(lineAddon.unit_price, 110), "والسعر = سعر السمول + ١٠");
  const addonRow = db
    .prepare("SELECT variant_cost_price FROM order_items WHERE id = ?")
    .get(lineAddon.id);
  // ٣٠٥ (السمول) + ٣٠×٣ (جبنة) = ٣٩٥
  ok(near(addonRow.variant_cost_price, 395), `وتكلفة البند بقت ٣٩٥ (السمول + الجبنة) — الفعلي ${addonRow.variant_cost_price}`);

  const c1 = stock(cheese);
  sell([{ product_id: pizza.id, quantity: 1, modifier_option_ids: ["o-nothing"], variant_id: small.id }]);
  ok(near(c1 - stock(cheese), 0), "وخيار مالوش مادة (بلا بصل) مابيخصمش حاجة");

  // ===== ⑤ الإتاحة =====
  console.log("\n— الإتاحة —");
  ok(available(pizza.id) === 1, "البيتزا متاحة");
  // الزيتون (خاص باللارج) يخلص → السمول لسه ينفع → المنتج **فاضل متاح**
  inventoryRepository.adjustWaste(olive, stock(olive), "اختبار", actorId);
  ok(stock(olive) === 0, "الزيتون خلص");
  ok(
    available(pizza.id) === 1,
    "مكوّن خاص باللارج خلص → البيتزا **فاضلة في المنيو** (السمول ينفع) — قبل الإصلاح كانت تختفي"
  );
  // الكرتونة (مشترك) تخلص → كل الأحجام تقع → المنتج مش متاح
  inventoryRepository.adjustWaste(box, stock(box), "اختبار", actorId);
  ok(available(pizza.id) === 0, "ومكوّن مشترك خلص → المنتج كله مش متاح");

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ وصفات الأحجام والإضافات سليمة");
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

// ⚠️ لازم خروج صريح: إلكترون بيسيب الـevent loop شغّال لما الـapp يفضل حيّ، فالاختبار
// بيطبع نتيجته وبيفضل معلّق للأبد (والسويت بعده مابتشتغلش).
process.exit(process.exitCode ?? 0);
