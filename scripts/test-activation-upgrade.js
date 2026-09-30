// اختبار الترقية الحقيقي لمحل **شغّال ومفعّل**: عميل على v26 (exe 1.7.0) عنده
// بيانات وهوية مزامنة → يثبّت النسخة الجديدة (v27).
//
// ⚠️ ليه الاختبار ده موجود: فيه عملاء بيشتغلوا بالنسخة دي على بياناتهم الحقيقية
// دلوقتي. التعديل بيشيل `shop_code`/`secret_key` من الحقول القابلة للتحديث —
// والسؤال اللي لازم يتجاوب **قبل** التسليم: هل ده بيمسّ القيم المخزّنة عندهم؟
// الإجابة لازم تتقاس على قاعدة **فيها بيانات**، مش على قاعدة فاضية: الفاضية
// مابتكشفش الصفوف القديمة الناقصة ولا تعارض الفهارس.
//
// تشغيل: node scripts/run-electron.js scripts/test-activation-upgrade.js
const Database = require("better-sqlite3");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron");
const { migrations, runMigrations } = require(path.join(base, "electron", "database", "migrations", "index.js"));
const { initDatabase, closeDatabase } = require(path.join(base, "electron", "database", "connection.js"));
const { settingsRepository } = require(path.join(base, "electron", "repositories", "settings.repository.js"));
const { SyncEngine } = require(path.join(base, "electron", "sync", "sync-engine.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

// القيم دي بتمثّل محل مفعّل فعلاً — لازم تخرج من الترقية زي ما دخلت بالحرف
const LIVE_CODE = "FLEX-7741";
const LIVE_SECRET = "sk_live_9c41d0aa27fe4b18";
const LIVE_URL = "https://app.flexpay.example";
// ⚠️ محسوبة مش مثبّتة — الرقم الصريح بيبقى قديم مع أول migration جديدة،
// فالاختبار يفضل «ناجح» وهو بيقيس ترقية مالهاش وجود. ونفس الملف بيشتغل في
// التلات نسخ رغم اختلاف أرقام الـmigrations بينهم.
const LATEST = Math.max(...migrations.map((m) => m.version));
// ⚠️ نقطة البداية = **قبل** migration المزامنة بالاسم مش برقم ثابت ولا بـ`LATEST - 1`.
// بالرقم الثابت الاختبار بيبقى قديم، وبـ`LATEST - 1` بقى بيبني قاعدة فيها
// `sync_enabled` أصلاً — يعني بيقيس ترقية مالهاش وجود. بالاسم: الفرضية تفضل صح
// مهما زادت الـmigrations، والمسار اللي بيتقاس هو **أطول ترقية حقيقية** عند العملاء.
const SYNC_TOGGLE = migrations.find((m) => m.name === "sync_toggle");
if (!SYNC_TOGGLE) throw new Error("migration «sync_toggle» مش موجودة — الاختبار ده مبني عليها");
const PREV_VERSION = SYNC_TOGGLE.version - 1;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-act-upg-"));
const dbPath = path.join(dir, "database.db");
try {
  // ===== ① ابني قاعدة «عميل شغّال على v26» فيها بيانات وهوية =====
  const db0 = new Database(dbPath);
  for (const m of migrations
    .filter((x) => x.version <= PREV_VERSION)
    .sort((a, b) => a.version - b.version)) {
    db0.transaction(() => {
      m.up(db0);
      db0.pragma(`user_version = ${m.version}`);
    })();
  }
  ok(
    db0.pragma("user_version", { simple: true }) === PREV_VERSION,
    `اتبنت قاعدة على v${PREV_VERSION} (زي العميل الحالي)`
  );

  const cols0 = db0.prepare("PRAGMA table_info(settings)").all().map((c) => c.name);
  ok(!cols0.includes("sync_enabled"), "القاعدة القديمة مافيهاش عمود sync_enabled (نقطة البداية صح)");

  db0.prepare(
    "INSERT INTO users (local_id,name,username,role,is_active) VALUES ('u1','صاحب المحل','owner',1,1)"
  ).run();
  db0.prepare(
    "INSERT INTO products (local_id,name,price,is_active) VALUES ('p1','شاي',15,1)"
  ).run();
  db0.prepare(
    "INSERT INTO customers (local_id,name,phone) VALUES ('c1','أحمد','01000000000')"
  ).run();

  // الصف ده هو بيت القصيد: هوية محل مفعّل
  db0.prepare(
    `INSERT INTO settings (id, local_id, shop_name, shop_code, secret_key, sync_server_url, updated_at, sync_status)
     VALUES (1,'s1','محل الأمانة',@code,@secret,@url,'2026-08-01T10:00:00.000Z','synced')`
  ).run({ code: LIVE_CODE, secret: LIVE_SECRET, url: LIVE_URL });

  const before = {
    settings: db0.prepare("SELECT * FROM settings WHERE id = 1").get(),
    products: db0.prepare("SELECT COUNT(*) AS c FROM products").get().c,
    customers: db0.prepare("SELECT COUNT(*) AS c FROM customers").get().c,
    users: db0.prepare("SELECT COUNT(*) AS c FROM users").get().c,
  };
  db0.close();

  // ===== ② التثبيت فوق القديم — الترقية بتجري لوحدها عند الإقلاع =====
  const db = new Database(dbPath);
  runMigrations(db);
  ok(
    db.pragma("user_version", { simple: true }) === LATEST,
    `بعد الترقية: user_version = ${LATEST}`
  );

  // ===== ③ الهوية زي ما هي بالحرف — أهم فحص في الملف =====
  const after = db.prepare("SELECT * FROM settings WHERE id = 1").get();
  ok(after.shop_code === LIVE_CODE, `كود المحل زي ما هو (${after.shop_code})`);
  ok(after.secret_key === LIVE_SECRET, "المفتاح السري زي ما هو بالحرف");
  ok(after.sync_server_url === LIVE_URL, "رابط السيرفر زي ما هو");
  ok(after.shop_name === before.settings.shop_name, "اسم المحل زي ما هو");
  ok(
    after.updated_at === before.settings.updated_at,
    "updated_at مااتغيّرش (الترقية مالمستش الصف)"
  );

  // ===== ④ العمود الجديد بيدي «شغّالة» للكل =====
  ok(after.sync_enabled === 1, "sync_enabled = 1 تلقائي (المزامنة مش هتقف عند حد)");

  // ===== ⑤ البيانات القديمة كاملة =====
  ok(
    db.prepare("SELECT COUNT(*) AS c FROM products").get().c === before.products &&
      db.prepare("SELECT COUNT(*) AS c FROM customers").get().c === before.customers &&
      db.prepare("SELECT COUNT(*) AS c FROM users").get().c === before.users,
    "المنتجات والعملاء والمستخدمين عددهم ثابت (مفيش فقدان)"
  );
  db.close();

  // ===== ⑥ التطبيق بيفتح شغّال ومفعّل بعد الترقية =====
  // الفحص من نفس المسار اللي التطبيق بيستخدمه، مش باستعلام مباشر.
  const live = initDatabase(dir);
  const state = settingsRepository.getActivationState();
  ok(state.activated === true, "التطبيق بيفتح **مفعّل** (مفيش شاشة تفعيل للعميل)");

  const dto = settingsRepository.get();
  ok(dto.shopCode === LIVE_CODE, "الواجهة شايفة كود المحل");
  ok(dto.secretKeyTail === LIVE_SECRET.slice(-4), "الواجهة شايفة آخر ٤ خانات بس");
  ok(!("secretKey" in dto), "المفتاح الكامل مش بيوصل للواجهة");
  ok(dto.syncEnabled === true, "الواجهة شايفة المزامنة شغّالة");

  ok(
    new SyncEngine(live).readConfig() !== null,
    "محرك المزامنة شغّال بعد الترقية (البيانات هتفضل توصل للوحة)"
  );

  // ===== ⑦ وبعد كل ده: الهوية بقت محميّة =====
  settingsRepository.update({ shopName: "اسم جديد" }, null);
  const tampered = live.prepare("SELECT shop_code, secret_key FROM settings WHERE id = 1").get();
  ok(
    tampered.shop_code === LIVE_CODE && tampered.secret_key === LIVE_SECRET,
    "تحديث الإعدادات العادي مابيلمسش الهوية"
  );
} finally {
  try {
    closeDatabase();
  } catch {
    /* تجاهل */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* تجاهل */
  }
  // إلكترون بيفضل شغّال من غير نافذة — لازم خروج صريح عشان الـCI مايعلّقش
  process.exit(process.exitCode ?? 0);
}
