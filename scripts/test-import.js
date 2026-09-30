// اختبار استيراد/تصدير إكسل.
// تشغيل: node scripts/run-electron.js scripts/test-import.js
//
// ⚠️ الميزة دي فيها فخّين بيفشلوا **بصمت**، ودول أهم فحصين في الملف:
//   ① الباركود المدمج لازم يتخزّن ٧ أرقام — وإلا الكاشير يمسح ومايلاقيش
//   ② كل صف مستورد لازم يضيف حدث في `sync_queue` — وإلا مايظهرش على الويب أبداً
// الاتنين مايظهروش في typecheck ولا في البناء ولا حتى على الشاشة.

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const shared = path.resolve(__dirname, "..", "dist-electron", "shared");
const { initDatabase, getDatabase } = require(path.join(base, "database", "connection.js"));
const { productsRepository } = require(path.join(base, "repositories", "products.repository.js"));
const { categoriesRepository } = require(path.join(base, "repositories", "categories.repository.js"));
const { customersRepository } = require(path.join(base, "repositories", "customers.repository.js"));
const dt = require(path.join(shared, "data-transfer.js"));
const { barcodeForStorage } = require(path.join(shared, "barcode.js"));
const importer = require(path.join(base, "lib", "data-transfer", "import.js"));

let pass = 0;
const fails = [];
function ok(cond, label) {
  if (cond) {
    console.log("✓ " + label);
    pass++;
  } else {
    console.log("✗ " + label);
    fails.push(label);
    process.exitCode = 1;
  }
}
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${label} (${JSON.stringify(a)} ≟ ${JSON.stringify(b)})`);
}

// قاعدة مؤقتة — ممنوع نلمس بيانات محل حقيقي
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-import-"));
initDatabase(dir);
const db = getDatabase();
const pendingCount = () =>
  db.prepare("SELECT COUNT(*) c FROM sync_queue WHERE status = 'pending'").get().c;

console.log("— التطبيع —");
eq(dt.toEnglishDigits("٠١٠١٢٣٤٥٦٧٨"), "01012345678", "الأرقام العربية بتتحوّل");
eq(dt.toEnglishDigits("۰۱۰"), "010", "الأرقام الفارسية بتتحوّل");
eq(dt.normalizePhone("٠١٠ ١٢٣ ٤٥٦٧٨"), "01012345678", "موبايل عربي بمسافات");
eq(dt.normalizePhone("+201012345678"), "01012345678", "موبايل بـ+20");
eq(dt.normalizePhone("0020 1012345678"), "01012345678", "موبايل بـ0020");
eq(dt.normalizePhone("010-123-45678"), "01012345678", "موبايل بشرط");
ok(dt.isValidPhone(dt.normalizePhone("٠١٠١٢٣٤٥٦٧٨")), "الموبايل العربي بيعدّي التحقق بعد التطبيع");
eq(dt.parseSaleType("كيلو"), "weight", "«كيلو» = وزن");
eq(dt.parseSaleType("بالوزن"), "weight", "«بالوزن» = وزن");
eq(dt.parseSaleType("قطعة"), "piece", "«قطعة» = قطعة");
eq(dt.parseSaleType(""), "piece", "الفاضي = قطعة (الافتراضي)");
eq(dt.cellNumber(""), null, "خانة فاضية = null (مش صفر)");
ok(Number.isNaN(dt.cellNumber("كلام")), "نص مش رقم = NaN (عشان نفرّقه عن الفاضي)");
eq(dt.cellNumber("١٢٥٫٥".replace("٫", ".")), 125.5, "رقم عربي بكسور");

// ===== ① الفخ الأول: الباركود المدمج =====
console.log("\n— الباركود المدمج (فخ الكاشير) —");
{
  // EAN-13 بيبدأ 21 = وزن؛ التخزين المفروض يبقى أول ٧ أرقام بس
  const embedded = "2112345067890";
  const stored = barcodeForStorage(embedded);
  eq(stored, "2112345", "الباركود المدمج بيتخزّن ٧ أرقام (البادئة + كود الصنف)");
  ok(stored !== embedded, "مش بيتخزّن كامل — لو اتخزّن كامل الكاشير مش هيلاقي المنتج");

  const normal = "6223000083758";
  eq(barcodeForStorage(normal), normal, "الباركود العادي بيتخزّن كامل");
}

console.log("\n— مطابقة الصفوف —");
{
  const cat = categoriesRepository.create({ name: "مشروبات" }, null);
  const p1 = productsRepository.create(
    { name: "بيبسي", category_id: cat.id, price: 15, barcode: "12345" },
    null
  );
  const p2 = productsRepository.create({ name: "كيلو", category_id: cat.id, price: 30 }, null);
  const cat2 = categoriesRepository.create({ name: "فاكهة" }, null);
  productsRepository.create({ name: "كيلو", category_id: cat2.id, price: 50 }, null);

  const plan = importer.planProducts([
    { row: 2, name: "بيبسي", price: 20, barcode: "12345", category: "مشروبات", saleType: "", cost: null },
    { row: 3, name: "كيلو", price: 35, barcode: "", category: "مشروبات", saleType: "كيلو", cost: null },
    { row: 4, name: "كيلو", price: 55, barcode: "", category: "فاكهة", saleType: "كيلو", cost: null },
    { row: 5, name: "شيبسي", price: 10, barcode: "", category: "سناكس", saleType: "", cost: null },
  ], []);

  eq(plan.counts, { create: 1, update: 3, skip: 0, error: 0 }, "٣ تحديث + ١ جديد");
  eq(plan.newCategories, ["سناكس"], "فئة واحدة جديدة بس");
  eq(plan.rows[0].targetId, p1.id, "الباركود بيطابق المنتج الصح");
  eq(plan.rows[1].targetId, p2.id, "الاسم+الفئة بيطابق «كيلو» بتاعة المشروبات");
  ok(
    plan.rows[2].targetId !== p2.id,
    "«كيلو» في الفاكهة **مش** نفس «كيلو» في المشروبات (الفئة جزء من المفتاح)"
  );
  ok(plan.rows[0].changes && plan.rows[0].changes["السعر"], "المعاينة بتوري تغيير السعر");

  // إعادة استيراد نفس الملف بلا تغيير
  const same = importer.planProducts([
    { row: 2, name: "بيبسي", price: 15, barcode: "12345", category: "مشروبات", saleType: "", cost: null },
  ], []);
  eq(same.counts.create, 0, "إعادة الاستيراد مابتكرّرش");
  eq(same.rows[0].action, "skip", "صف بلا تغيير = تخطّي مش تحديث");
}

// ===== ② الفخ التاني: المزامنة =====
console.log("\n— أحداث المزامنة (فخ الويب) —");
{
  const before = pendingCount();
  const res = importer.applyProducts(
    [
      { row: 2, name: "منتج مزامنة ١", price: 10, barcode: "", category: "قسم جديد", saleType: "", cost: 6 },
      { row: 3, name: "منتج مزامنة ٢", price: 20, barcode: "999888", category: "قسم جديد", saleType: "كيلو", cost: null },
    ],
    null
  );
  const after = pendingCount();
  eq(res.created, 2, "اتعمل منتجين");
  // ٢ منتج + ١ فئة جديدة = ٣ أحداث على الأقل
  ok(after - before >= 3, `الطابور زاد ${after - before} حدث (منتجين + فئة) — مش صفر`);

  // نقرا آخر ٦ — الاستيراد بيضيف فئة + منتجين + تحديث تكلفة، فآخر ٣ مش كفاية
  const q = db
    .prepare("SELECT entity_type, event_type FROM sync_queue ORDER BY id DESC LIMIT 6")
    .all();
  ok(
    q.some((r) => r.entity_type === "product" && r.event_type === "CREATED"),
    "فيه حدث product/CREATED في الطابور"
  );
  ok(
    q.some((r) => r.entity_type === "category" && r.event_type === "CREATED"),
    "الفئة الجديدة كمان اتضافت للطابور"
  );

  // الباركود اتخزّن مطبّع
  const found = productsRepository.getByBarcode("999888");
  ok(found && found.name === "منتج مزامنة ٢", "المنتج بيتلاقى بالباركود بعد الاستيراد");
  // التكلفة اتسجّلت
  const all = productsRepository.getAll();
  const withCost = all.find((p) => p.name === "منتج مزامنة ١");
  eq(withCost.cost_price, 6, "التكلفة من الإكسل اتسجّلت (مش صفر)");
}

console.log("\n— التحديث الجزئي: الفاضي مايمسحش —");
{
  const cat = categoriesRepository.create({ name: "جزئي" }, null);
  const p = productsRepository.create(
    { name: "منتج جزئي", category_id: cat.id, price: 100, barcode: "777666" },
    null
  );
  // ⚠️ التكلفة ليها دالة مستقلة — `update()` مافيهوش `cost_price` خالص،
  // وتمريره ليه بيتجاهل **بصمت** (اكتشفناه من الفحص ده نفسه)
  productsRepository.setCostPrice(p.id, 40, null);

  // ملف فيه السعر بس — التكلفة والباركود فاضيين
  importer.applyProducts(
    [{ row: 2, name: "منتج جزئي", price: 120, barcode: "", category: "جزئي", saleType: "", cost: null }],
    null
  );
  const after = productsRepository.getAll().find((x) => x.id === p.id);
  eq(after.price, 120, "السعر اتحدّث");
  eq(after.cost_price, 40, "⚠️ التكلفة الفاضية في الملف **مامسحتش** القيمة الموجودة");
  eq(after.barcode, "777666", "⚠️ الباركود الفاضي في الملف **مامسحش** الباركود الموجود");
  ok(after.local_id === p.local_id, "local_id مااتغيّرش (وإلا الويب هيعمل نسخة تانية)");
}

console.log("\n— العملاء: الموجود يتجاهل —");
{
  customersRepository.create({ phone: "01111111111", name: "عميل قديم" }, null);
  const plan = importer.planCustomers([
    { row: 2, name: "اسم جديد خالص", phone: "٠١١١١١١١١١١" },
    { row: 3, name: "عميل جديد", phone: "01222222222" },
    { row: 4, name: "غلط", phone: "0111" },
  ]);
  eq(plan.counts, { create: 1, update: 0, skip: 1, error: 1 }, "موجود=تخطّي · جديد=إضافة · قصير=خطأ");
  ok(plan.rows[0].action === "skip", "الموبايل الموجود (بأرقام عربية) اتعرف واتخطّى");
  ok(plan.rows[2].message && plan.rows[2].message.includes("11"), "رسالة الخطأ بتقول السبب");

  importer.applyCustomers(plan.rows, null);
  const still = db.prepare("SELECT name FROM customers WHERE phone = ?").get("01111111111");
  eq(still.name, "عميل قديم", "⚠️ بيانات العميل الموجود **ماتغيّرتش** خالص");

  const added = db.prepare("SELECT gender, nationality FROM customers WHERE phone = ?").get("01222222222");
  eq(added.gender, "male", "الجنس الافتراضي");
  ok(added.nationality && added.nationality.length > 0, "الجنسية الافتراضية من الإعدادات");
}

// ===== الرحلة الكاملة: تصدير → استيراد =====
// ⚠️ ده الفحص اللي بيثبت إن الملف اللي بنصدّره يرجع يتستورد **بلا أي تعديل**.
// أشهر فشل هنا: الباركود بيتحوّل لصيغة علمية في إكسل (6.223E+12) والملف يرجع
// بباركود مكسور — عشان كده العمود متعرّف كنص.
(async () => {
  console.log("\n— رحلة كاملة: تصدير ثم استيراد —");
  const excel = require(path.join(base, "lib", "data-transfer", "excel.js"));
  const file = path.join(dir, "roundtrip.xlsx");

  const before = productsRepository.getAll();
  await excel.writeProducts(
    file,
    before.map((p) => ({
      name: p.name,
      price: p.price,
      cost_price: p.cost_price,
      barcode: p.barcode,
      category_name: p.category_name,
      sale_type: p.sale_type,
    }))
  );
  ok(fs.existsSync(file), "الملف اتكتب");

  const read = await excel.readProductRows(file);
  eq(read.rows.length, before.length, "كل الصفوف اترجعت");
  eq(read.unknownHeaders, [], "مفيش عمود مش متعرّف عليه (الملف بتاعنا)");

  const long = before.find((p) => p.barcode && p.barcode.length >= 13);
  if (long) {
    const back = read.rows.find((r) => r.name === long.name);
    eq(back.barcode, long.barcode, "الباركود الطويل رجع نص مش صيغة علمية");
  }

  const plan = importer.planProducts(read.rows, read.unknownHeaders);
  eq(
    { create: plan.counts.create, update: plan.counts.update, error: plan.counts.error },
    { create: 0, update: 0, error: 0 },
    "⚠️ استيراد الملف المصدَّر = **صفر تغيير**"
  );
  eq(plan.newCategories, [], "مفيش فئة جديدة (كلها موجودة)");

  console.log(`\n${fails.length === 0 ? "✅" : "❌"} نجح ${pass} فحص` + (fails.length ? ` · فشل ${fails.length}` : ""));
  for (const f of fails) console.log("  · " + f);
  try {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* تنظيف */
  }
  process.exit(process.exitCode ?? 0);
})();
