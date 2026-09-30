// حارس عزل المجال (فحص ثابت — بلا إلكترون).
// التشغيل: node scripts/verify-isolation.js
//
// ليه موجود: إلكترون بيشتق مجلد البيانات من app.getName() = (productName ?? name)
// في package.json → %APPDATA%/<الاسم ده>/database.db
// **appId و productName في electron-builder.config.js مالهمش أي علاقة بالمسار.**
//
// يعني حقل `name` في package.json هو **المفتاح الوحيد** اللي بيعزل قاعدة بيانات
// نسخة البلايستيشن عن قاعدة بيانات المحل العام. لو اترجّع للأساس بالغلط (دمج/نسخ)،
// النسخة دي هتفتح **قاعدة بيانات التجزئة الحيّة** وتطبّق عليها migrations الجيمنج — بصمت.
//
// الفحص ده بيمسك الحالة دي في ثانية، من غير بناء ولا تشغيل.
const path = require("node:path");
const fs = require("node:fs");
const pkg = require(path.join(__dirname, "..", "package.json"));

// نسخة «كافيه» بس — برنامج منفصل ببيانات مستقلة: بيتثبّت **جنب** البلايستيشن و«بلايستيشن + كافيه»
// مش فوقهم، فلازم مجلد بيانات مختلف عنهم وعن التجزئة.
const EXPECTED_NAME = "flexpay-desktop-restaurant";
const BASE_NAME = "flexpay-desktop"; // اسم المحل العام (التجزئة)
const GAMING_NAME = "flexpay-desktop-gaming"; // نسخة البلايستيشن
const GAMING_CAFE_NAME = "flexpay-desktop-gaming-cafe"; // «بلايستيشن + كافيه» اللي اتنسخنا منها

let ok = true;
const fail = (m) => {
  console.log("✗ " + m);
  ok = false;
};

console.log(`package.json name = "${pkg.name}"`);
console.log(`مجلد البيانات المتوقّع = %APPDATA%\\${EXPECTED_NAME}\n`);

if (pkg.name === BASE_NAME) {
  fail(`خطر قاتل: name = "${BASE_NAME}" → النسخة دي هتفتح قاعدة بيانات المحل العام!`);
} else if (pkg.name === GAMING_CAFE_NAME) {
  fail(`خطر قاتل: name = "${GAMING_CAFE_NAME}" → النسخة دي هتفتح قاعدة بيانات **«بلايستيشن + كافيه»** على نفس الجهاز!`);
} else if (pkg.name === GAMING_NAME) {
  fail(`خطر قاتل: name = "${GAMING_NAME}" → النسخة دي هتفتح قاعدة بيانات **البلايستيشن** على نفس الجهاز وتطبّق عليها migrations الطاولات!`);
} else if (pkg.name !== EXPECTED_NAME) {
  fail(`name = "${pkg.name}" والمتوقّع "${EXPECTED_NAME}".`);
} else {
  console.log("✓ name صح — قاعدة البيانات معزولة.");
}

// productName في package.json بيغلب name عند إلكترون → مفتاح تاني للمسار. ممنوع.
if (pkg.productName !== undefined) {
  fail(`ممنوع "productName" في package.json (إلكترون بيفضّله على name فيغيّر مسار البيانات). شيله — مكانه electron-builder.config.js بس.`);
} else {
  console.log("✓ مفيش productName في package.json (المسار بيتحدد من name بس).");
}

// setName في main.ts لازم يطابق الاسم — وإلا تشغيل dev بمسار ملف بيرجّع "Electron" (مجلد مشترك)
const mainSrc = fs.readFileSync(path.join(__dirname, "..", "electron", "main.ts"), "utf8");
if (!mainSrc.includes(`const APP_NAME = "${EXPECTED_NAME}"`) || !mainSrc.includes("app.setName(")) {
  fail(`electron/main.ts لازم فيه const APP_NAME = "${EXPECTED_NAME}" + app.setName(...) قبل أول getPath("userData").`);
} else {
  console.log("✓ app.setName موجود بالاسم الصح في main.ts.");
}

const builder = require(path.join(__dirname, "..", "electron-builder.config.js"));
if (builder.appId !== "com.flexpay.restaurant") {
  fail(`appId = "${builder.appId}" والمتوقّع "com.flexpay.restaurant" — appId نسخة تانية = التثبيت بيكتب فوقها.`);
} else {
  console.log("✓ appId مختلف عن البلايستيشن و«بلايستيشن + كافيه» (بيتثبّت جنبهم).");
}

if (!/^1\./.test(pkg.version)) {
  console.log(`⚠ version = ${pkg.version} — نسخ المجالات بتبدأ من 1.0.0.`);
}

console.log(ok ? "\n✅ العزل سليم" : "\n❌ العزل مكسور — متبنيش exe قبل ما تصلّحه");
process.exit(ok ? 0 : 1);
