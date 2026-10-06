// اختبار «خدمات بس» — من وصلة الواجهة (الـIPC) مش من الريبو.
//
// سياسة الشركة: نسخة التجميل للخدمات بس. اللي عايز يبيع كريمات وبضاعة بياخد
// نسخة البيع بالتجزئة. فالقفل لازم يكون في الـ**main** مش في الواجهة، لأن فيه
// **تلات أبواب** بتوصل للريبو من غير ما تعدّي على المودال:
//   ① `products:create` بلا `is_service` خالص (برنامج تاني · سكربت · واجهة قديمة)
//   ② `products:update` ببعت `is_service: false` صريح
//   ③ **استيراد الإكسل** — وده كان أخطرهم: ماكانش بيبعت `is_service` خالص،
//      فكل سطر من ملف إكسل كان بيدخل **منتج بضاعة**.
//
// وبيتأكد كمان إن المخزون والموردين وفواتير الشرا والجرد **لسه شغّالين**:
// `products` مالهاش عمود رصيد أصلاً، والرصيد في `inventory_items` — فالخدمة
// بتستهلك مواد بوصفة والجرد مابيتكسرش.
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-services-only.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { productsRepository } = require(path.join(base, "repositories", "products.repository.js"));
const { inventoryRepository } = require(path.join(base, "repositories", "inventory.repository.js"));
const { stocktakeRepository } = require(path.join(base, "repositories", "stocktake.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

// ⚠️ استثناء مش متمسوك في إلكترون بيفتح ديالوج ويوقف كل الاختبارات
process.on("uncaughtException", (e) => {
  console.log(`✗ FAIL استثناء: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.log(`✗ FAIL رفض غير متمسوك: ${e}`);
  process.exit(1);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-services-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  const actorId = Number(
    db
      .prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u','مدير','m','manager',1)")
      .run().lastInsertRowid
  );
  const cat = Number(
    db
      .prepare("INSERT INTO categories (local_id, name, sort_order, sync_status) VALUES ('c','شعر',1,'pending')")
      .run().lastInsertRowid
  );
  const isService = (id) => db.prepare("SELECT is_service FROM products WHERE id = ?").get(id).is_service;

  // ===== ① الإنشاء بلا نوع =====
  console.log("\n— الإنشاء بلا نوع —");
  const bare = productsRepository.create({ name: "قص", category_id: cat, price: 80 }, actorId);
  ok(isService(bare.id) === 1, `منتج بلا \`is_service\` دخل **خدمة** (الفعلي ${isService(bare.id)})`);
  ok(bare.is_service === true, "والـDTO بيقول خدمة");

  // ===== ② محاولة صريحة تخليه بضاعة =====
  console.log("\n— محاولة صريحة تخليه بضاعة —");
  const asGoods = productsRepository.create(
    { name: "شامبو للبيع", category_id: cat, price: 120, is_service: false },
    actorId
  );
  ok(isService(asGoods.id) === 1, `\`is_service: false\` في الإنشاء **اتجاهل** (الفعلي ${isService(asGoods.id)})`);
  productsRepository.update({ id: bare.id, is_service: false }, actorId);
  ok(isService(bare.id) === 1, "و`is_service: false` في التعديل اتجاهل كمان");

  // ===== ③ مفيش بيع بالوزن ولا باركود =====
  console.log("\n— مفيش وزن ولا باركود —");
  const weighed = productsRepository.create(
    { name: "حنة بالكيلو", category_id: cat, price: 40, sale_type: "weight" },
    actorId
  );
  const row = db.prepare("SELECT sale_type, barcode FROM products WHERE id = ?").get(weighed.id);
  ok(row.sale_type === "piece", `«weight» اتحوّل لـ«piece» (الفعلي ${row.sale_type})`);
  ok(!row.barcode, "ومفيش باركود (الخدمة مالهاش باركود)");

  // ===== ④ المخزون والوصفة لسه شغّالين =====
  // ⚠️ ده جوهر القرار: الخدمة **بتستهلك مواد**. لو الوصفة اتكسرت، تكلفة الخدمة
  // بتبقى صفر والمحل بيفتكر إن الصبغة مجانية.
  console.log("\n— الخدمة بتستهلك مواد —");
  const dyeItem = inventoryRepository.create(
    {
      name: "صبغة",
      unit: "جرام",
      current_quantity: 1000,
      alert_threshold: 100,
      waste_percentage: 0,
      cost_per_unit: 0.5,
    },
    actorId
  );
  productsRepository.saveRecipe(bare.id, [{ inventory_item_id: dyeItem.id, standard_qty: 60 }], actorId);
  const summary = productsRepository.calculateCost(bare.id);
  ok(
    Math.abs(summary.cost - 30) < 0.01,
    `تكلفة الخدمة من موادها = ٣٠ (٦٠ جرام × ٠٫٥) — الفعلي ${summary.cost}`
  );
  ok(summary.price === 80, `وسعر الخدمة ١٠ (الفعلي ${summary.price})`.replace("١٠", "٨٠"));

  // ===== ⑤ الجرد مابيشوفش الخدمات أصلاً =====
  // `products` مالهاش عمود رصيد — الرصيد كله في `inventory_items`.
  console.log("\n— الجرد على المواد مش على الخدمات —");
  const cols = db.prepare("PRAGMA table_info(products)").all().map((c) => c.name);
  ok(
    !cols.includes("quantity") && !cols.includes("stock_qty"),
    `جدول products مالوش عمود رصيد (الأعمدة: ${cols.filter((c) => /qty|quantity|stock/.test(c)).join(",") || "مفيش"})`
  );
  const sheet = stocktakeRepository.getCountRows({ type: "all" });
  ok(Array.isArray(sheet) && sheet.length === 1, `ورقة الجرد فيها المادة بس (الفعلي ${sheet.length})`);
  ok(sheet[0].item_name === "صبغة", `واللي فيها «صبغة» مش «قص» (الفعلي «${sheet[0].item_name}»)`);

  // ===== ⑥ الموردين وفواتير الشرا لسه شغّالين =====
  console.log("\n— الموردين وفواتير الشرا —");
  for (const [file, name, fn] of [
    ["suppliers.repository.js", "suppliersRepository", "getAll"],
    ["purchases.repository.js", "purchasesRepository", "getInvoices"],
  ]) {
    const mod = require(path.join(base, "repositories", file));
    ok(
      mod[name] != null && typeof mod[name][fn] === "function",
      `${name}.${fn}() لسه موجود وشغّال`
    );
  }

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ خدمات بس — والمخزون سليم");
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
