// اختبار **الخدمة** — خدمة مش بضاعة، بس **بتستهلك مواد** زي أي منتج.
//
// الفخ اللي بيحرسه: «خدمة» في سيستمات تانية معناها «بند بلا مخزون» — وده غلط في
// الصالون: الصبغة بتخصم صبغة وفويل من المخزن فعلاً. العلم `is_service` بيفرّقها
// في **العرض والجرد والتقارير** بس، والوصفة بتشتغل زي ما هي.
//
//   • خدمة بوصفة → البيع بيخصم موادها بالكمية الصح.
//   • الخدمة **مابتظهرش في الجرد** (الجرد على المواد، مش على المنتجات).
//   • مدة الخدمة بتتحفظ وبترجع.
//   • المنتج العادي `is_service = false` وسلوكه زي ما هو.
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-service-stock.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { productsRepository } = require(path.join(base, "repositories", "products.repository.js"));
const { gamingRepository } = require(path.join(base, "repositories", "gaming.repository.js"));
const { stocktakeRepository } = require(path.join(base, "repositories", "stocktake.repository.js"));

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-beauty-svc-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  const actorId = Number(
    db
      .prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u1','سماح','s','stylist',1)")
      .run().lastInsertRowid
  );
  const actor = { id: actorId, name: "سماح" };
  const cat = Number(
    db
      .prepare(
        "INSERT INTO categories (local_id, name, icon, sort_order, sync_status) VALUES ('c','شعر','scissors',1,'pending')"
      )
      .run().lastInsertRowid
  );
  const item = (localId, name, unit, qty, cost) =>
    Number(
      db
        .prepare(
          `INSERT INTO inventory_items (local_id, name, unit, current_quantity, alert_threshold,
             cost_per_unit, status, sync_status) VALUES (?,?,?,?,1,?,'sufficient','pending')`
        )
        .run(localId, name, unit, qty, cost).lastInsertRowid
    );
  const dyeMat = item("i-d", "صبغة", "جرام", 5000, 2);
  const foil = item("i-f", "فويل", "قطعة", 500, 1);
  const stock = (id) =>
    db.prepare("SELECT current_quantity FROM inventory_items WHERE id = ?").get(id).current_quantity;

  // ===== ① الخدمة بنوعها ومدتها =====
  console.log("\n— الخدمة —");
  const dye = productsRepository.create(
    { name: "صبغة شعر", category_id: cat, price: 300, is_service: true, duration_minutes: 90 },
    actorId
  );
  ok(dye.is_service === true, "الصنف اتحفظ كخدمة");
  ok(dye.duration_minutes === 90, `ومدتها ٩٠ دقيقة (الفعلي ${dye.duration_minutes})`);

  // ⚠️ الفحص ده **انقلب**: النسخة بقت **خدمات بس**، فالافتراضي هو الخدمة.
  // اللي بيبيع شامبو وبضاعة بياخد نسخة البيع بالتجزئة (سياسة الشركة).
  const plain = productsRepository.create({ name: "تنظيف بشرة", category_id: cat, price: 120 }, actorId);
  ok(plain.is_service === true, "وأي بند جديد بيدخل **خدمة** تلقائي (مفيش بضاعة)");

  // ===== ② وصفة الخدمة بتخصم =====
  console.log("\n— الخدمة بتستهلك مواد —");
  productsRepository.saveRecipe(
    dye.id,
    [
      { inventory_item_id: dyeMat, standard_qty: 60 },
      { inventory_item_id: foil, standard_qty: 10 },
    ],
    actorId
  );
  const cost = productsRepository.calculateCost(dye.id);
  ok(near(cost.cost, 60 * 2 + 10 * 1), `تكلفة الخدمة اتحسبت من وصفتها = ${cost.cost}`);

  const chair = gamingRepository.saveRoom({ name: "كرسي 1", area: "الصالة" }, actorId).room;
  const s = gamingRepository.openSession({ room_id: chair.id, staff_id: actorId }, actor);
  const d0 = stock(dyeMat);
  const f0 = stock(foil);
  gamingRepository.addItem({ session_id: s.id, product_id: dye.id, quantity: 2 }, actor);
  gamingRepository.checkout(
    { session_id: s.id, payment_method: "cash", amount_paid: 1000, discount_type: "none", discount_value: 0 },
    actor
  );
  ok(near(d0 - stock(dyeMat), 120), `صبغتين خصمت ١٢٠ جرام صبغة (الفعلي ${d0 - stock(dyeMat)})`);
  ok(near(f0 - stock(foil), 20), `و٢٠ فويل (الفعلي ${f0 - stock(foil)})`);

  // ===== ③ الخدمة مش في الجرد =====
  console.log("\n— الجرد —");
  const rows = stocktakeRepository.getCountRows({ type: "all" });
  const names = rows.map((r) => r.item_name ?? r.name);
  ok(
    !names.includes("صبغة شعر"),
    "**الخدمة مابتظهرش في الجرد** (الجرد على المواد مش على المنتجات)"
  );
  ok(names.includes("صبغة") && names.includes("فويل"), "والمواد نفسها موجودة في الجرد");

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ الخدمة والمخزون سليمين");
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
