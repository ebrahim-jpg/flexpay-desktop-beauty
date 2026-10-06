// اختبار الترقية على قاعدة فيها بيانات — **مش قاعدة فاضية**.
// تشغيل: node scripts/run-electron.js scripts/test-import-upgrade.js
//
// ⚠️ فيه محلات شغّالة على النسخة دي. الفحص ده بيتأكد من التلاتة اللي بيهموا
// صاحب المشروع: البيانات القديمة ماتلمستش · الترقية تلقائية · ومفيش migration
// جديدة أصلاً في الميزة دي.

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(
  path.join(base, "database", "connection.js")
);
const { productsRepository } = require(path.join(base, "repositories", "products.repository.js"));
const { categoriesRepository } = require(path.join(base, "repositories", "categories.repository.js"));
const { customersRepository } = require(path.join(base, "repositories", "customers.repository.js"));
const { ordersRepository } = require(path.join(base, "repositories", "orders.repository.js"));
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-upg-"));
initDatabase(dir);
let db = getDatabase();

// ===== محل «شغّال»: بيانات وتاريخ =====
console.log("— بنجهّز محل فيه بيانات —");
const cat = categoriesRepository.create({ name: "مشروبات" }, null);
const p1 = productsRepository.create(
  { name: "بيبسي", category_id: cat.id, price: 15, barcode: "6223000083758" },
  null
);
const p2 = productsRepository.create({ name: "شيبسي", category_id: cat.id, price: 10 }, null);
const cust = customersRepository.create({ phone: "01012345678", name: "عميل قديم" }, null);
const versionBefore = db.pragma("user_version", { simple: true });
const snapshot = {
  products: db.prepare("SELECT id, local_id, name, price FROM products ORDER BY id").all(),
  customers: db.prepare("SELECT id, local_id, name, phone FROM customers ORDER BY id").all(),
  categories: db.prepare("SELECT id, local_id, name FROM categories ORDER BY id").all(),
};
console.log(`  ${snapshot.products.length} منتج · ${snapshot.customers.length} عميل · نسخة القاعدة ${versionBefore}`);

// ===== الترقية: نقفل ونفتح تاني (زي ما بيحصل مع exe جديد) =====
console.log("\n— الترقية (قفل وفتح زي ما الـexe بيعمل) —");
// ⚠️ `closeDatabase()` مش `db.close()` — الوحدة بتمسك الاتصال في متغيّر،
// و`initDatabase` بترجّع القديم لو لسه مفتوح. من غير كده الفحص بيعيد استخدام
// نفس الاتصال ومابيختبرش الترقية أصلاً.
closeDatabase();
initDatabase(dir);
db = getDatabase();
const versionAfter = db.pragma("user_version", { simple: true });

ok(versionAfter === versionBefore, `نسخة القاعدة ماتغيّرتش (${versionBefore} → ${versionAfter}) — الميزة مالهاش migration`);

const after = {
  products: db.prepare("SELECT id, local_id, name, price FROM products ORDER BY id").all(),
  customers: db.prepare("SELECT id, local_id, name, phone FROM customers ORDER BY id").all(),
  categories: db.prepare("SELECT id, local_id, name FROM categories ORDER BY id").all(),
};
ok(
  JSON.stringify(after) === JSON.stringify(snapshot),
  "⚠️ كل البيانات القديمة زي ما هي بالحرف بعد الترقية"
);

// ===== استيراد على المحل الشغّال =====
console.log("\n— استيراد على محل فيه بيانات —");
const beforeCount = db.prepare("SELECT COUNT(*) c FROM products").get().c;
importer.applyProducts(
  [
    // تحديث سعر منتج موجود
    { row: 2, name: "بيبسي", price: 18, barcode: "6223000083758", category: "مشروبات", saleType: "", cost: null },
    // منتج جديد في فئة جديدة
    { row: 3, name: "عصير", price: 12, barcode: "", category: "عصائر", saleType: "", cost: 8 },
  ],
  null
);

const bibsi = productsRepository.getAll().find((p) => p.id === p1.id);
ok(bibsi.price === 18, "السعر اتحدّث");
ok(bibsi.local_id === p1.local_id, "⚠️ local_id للمنتج المحدَّث مااتغيّرش");
ok(bibsi.barcode === "6223000083758", "الباركود زي ما هو");

const shipsy = productsRepository.getAll().find((p) => p.id === p2.id);
ok(shipsy.price === 10, "⚠️ المنتج اللي **مش في الملف** ماتلمسش خالص");
ok(shipsy.is_active === true, "⚠️ ولا اتوقّف");

const afterCount = db.prepare("SELECT COUNT(*) c FROM products").get().c;
ok(afterCount === beforeCount + 1, `اتضاف منتج واحد بس (${beforeCount} → ${afterCount}) — مفيش تكرار`);

const c = db.prepare("SELECT name, phone FROM customers WHERE id = ?").get(cust.id);
ok(c.name === "عميل قديم", "⚠️ استيراد المنتجات مالمسش العملاء");

const deleted = db.prepare("SELECT COUNT(*) c FROM products WHERE is_deleted = 1").get().c;
ok(deleted === 0, "⚠️ مفيش أي منتج اتحذف");

// ===== الفشل بيرجّع كل حاجة =====
console.log("\n— الفشل بيرجّع المعاملة كاملة —");
{
  const countBefore = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  const priceBefore = productsRepository.getAll().find((p) => p.id === p1.id).price;
  let threw = false;
  try {
    importer.applyProducts(
      [
        { row: 2, name: "بيبسي", price: 99, category: "مشروبات", cost: null },
        // ⚠️ سعر سالب → `create` بترمي جوّه الترانزاكشن **بعد** ما السطر
        // الأول اتكتب — وده اللي الاختبار عاوز يقيسه.
        // (قبل كده كان بيستخدم **تعارض باركود**، والباركود اتشال من استيراد
        //  الخدمات — فماكانش فيه فشل أصلاً والفحص بقى بيقيس سكوت.)
        { row: 3, name: "منتج سالب", price: -5, category: "عصائر", cost: null },
      ],
      null
    );
  } catch {
    threw = true;
  }
  const countAfter = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  const priceAfter = productsRepository.getAll().find((p) => p.id === p1.id).price;
  ok(countAfter === countBefore, `عدد المنتجات زي ما هو بعد الفشل (${countBefore})`);
  ok(
    threw ? priceAfter === priceBefore : true,
    "⚠️ لو الاستيراد فشل، السعر اللي اتغيّر في نفس المعاملة رجع"
  );
}

console.log(`\n${fails.length === 0 ? "✅" : "❌"} نجح ${pass} فحص` + (fails.length ? ` · فشل ${fails.length}` : ""));
for (const f of fails) console.log("  · " + f);

try {
  closeDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
} catch {
  /* تنظيف */
}
process.exit(process.exitCode ?? 0);
