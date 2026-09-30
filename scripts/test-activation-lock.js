// اختبار قفل هوية المزامنة — **الهوية بتيجي من كود التفعيل بس**.
//
// السياق: كود المحل والمفتاح السري كانوا خانتين حرّتين في شاشة الإعدادات. خطأ
// بشري أو تخريب بيكسر هوية المحل، والمفتاح **مايتشافش تاني من لوحة الشركة**
// (بيتولّد مرة واحدة ومتخزّن هاش).
//
// ⚠️ والأخطر إن `activated = !!(shop_code && secret_key)` — يعني تفضية الخانتين
// مكانتش بتوقّف المزامنة بس، كانت **بتقفل التطبيق كله** ورا شاشة التفعيل. المحل
// مايقدرش يبيع.
//
// ⚠️ الفخ اللي الاختبار ده بيحرسه: القفل **مش في الواجهة**. لو الخانات اتخفت من
// الشاشة والمستودع لسه بيقبل الحقلين، أول نداء `settings:update` من أي مكان
// بيكتب فوق الهوية تاني. عشان كده كل الفحوص هنا على **المستودع** مش على الواجهة.
//
// تشغيل: node scripts/run-electron.js scripts/test-activation-lock.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron");
const { initDatabase, getDatabase } = require(path.join(base, "electron", "database", "connection.js"));
const { settingsRepository } = require(path.join(base, "electron", "repositories", "settings.repository.js"));
const { SyncEngine } = require(path.join(base, "electron", "sync", "sync-engine.js"));

// الوحدات الجديدة — لو لسه مش موجودة، الفحوص اللي بتعتمد عليها بتفشل بالاسم
// بدل ما السكربت كله يقع من أول سطر.
function tryRequire(...segments) {
  try {
    return require(path.join(base, ...segments));
  } catch {
    return null;
  }
}
const reactivateMod = tryRequire("electron", "sync", "reactivate.js");
const settingsShared = tryRequire("shared", "settings.js");

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const REAL_CODE = "SHOP-0001";
const REAL_SECRET = "sk_real_secret_value_9f3a";
const SERVER = "https://sync.example.com";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-activation-lock-"));
const results = [];

async function main() {
  initDatabase(dir);
  const db = getDatabase();

  const creds = () =>
    db.prepare("SELECT shop_code, secret_key, sync_server_url FROM settings WHERE id = 1").get();

  // ===== ① المسار الشرعي: setActivation هو اللي بيكتب =====
  settingsRepository.setActivation({
    shopCode: REAL_CODE,
    secretKey: REAL_SECRET,
    serverUrl: SERVER,
  });
  const afterActivation = creds();
  ok(
    afterActivation.shop_code === REAL_CODE && afterActivation.secret_key === REAL_SECRET,
    "setActivation لسه بيكتب الهوية (المسار الشرعي مانكسرش)"
  );

  // ===== ② الكتابة فوق الهوية من settings:update مستحيلة =====
  // ده الفحص المركزي: الواجهة ممكن تتغيّر، المستودع هو الحارس.
  settingsRepository.update(
    { shopCode: "HACKED-9999", secretKey: "sk_attacker_key", shopName: "محل مخترَق" },
    null
  );
  const afterTamper = creds();
  ok(
    afterTamper.shop_code === REAL_CODE,
    "كود المحل مااتغيّرش من settings:update"
  );
  ok(
    afterTamper.secret_key === REAL_SECRET,
    "المفتاح السري مااتغيّرش من settings:update"
  );
  ok(
    settingsRepository.get().shopName === "محل مخترَق",
    "باقي الحقول لسه بتتحدّث عادي (مامنعناش الإعدادات كلها)"
  );

  // ===== ③ التفضية مستحيلة — التطبيق مايتقفلش =====
  settingsRepository.update({ shopCode: null, secretKey: null }, null);
  ok(
    settingsRepository.getActivationState().activated === true,
    "تفضية الخانتين مابتقفلش التطبيق (activated لسه true)"
  );

  // ===== ④ المفتاح مايخرجش للواجهة =====
  const dto = settingsRepository.get();
  ok(!("secretKey" in dto), "الـDTO مافيهاش secretKey (المفتاح مايوصلش للـrenderer)");
  ok(
    dto.secretKeyTail === REAL_SECRET.slice(-4),
    `الـDTO فيها secretKeyTail بآخر ٤ خانات (${dto.secretKeyTail})`
  );
  ok(dto.shopCode === REAL_CODE, "كود المحل لسه بيتعرض (مش سر)");

  // ===== ⑤ تنقية سجل التدقيق =====
  // ⚠️ logSettingsChange كان بيسجّل oldValue/newValue كاملين — يعني المفتاح
  // بيتكتب plain في السجل المحلي في **كل** تغيير إعدادات.
  if (!settingsShared || typeof settingsShared.redactSettings !== "function") {
    ok(false, "redactSettings موجودة في shared/settings");
  } else {
    const redacted = settingsShared.redactSettings({
      shopName: "محل",
      shopCode: REAL_CODE,
      secretKey: REAL_SECRET,
      secretKeyTail: "9f3a",
      syncServerUrl: SERVER,
    });
    const serialized = JSON.stringify(redacted);
    ok(
      !serialized.includes(REAL_SECRET) && !serialized.includes("9f3a"),
      "redactSettings بتشيل المفتاح من اللي بيتسجّل"
    );
    ok(
      serialized.includes(REAL_CODE) && redacted.shopName === "محل",
      "redactSettings بتسيب باقي الحقول زي ما هي"
    );
  }

  // ===== ⑥ مفتاح إيقاف المزامنة =====
  const engine = new SyncEngine(db);
  ok(engine.readConfig() !== null, "المزامنة شغّالة والإعدادات كاملة");

  let toggleWorks = false;
  try {
    db.prepare("UPDATE settings SET sync_enabled = 0 WHERE id = 1").run();
    toggleWorks = true;
  } catch {
    toggleWorks = false;
  }
  ok(toggleWorks, "عمود sync_enabled موجود (migration اتطبّقت)");
  if (toggleWorks) {
    ok(engine.readConfig() === null, "sync_enabled = 0 بتوقّف المحرك");
    db.prepare("UPDATE settings SET sync_enabled = 1 WHERE id = 1").run();
    ok(engine.readConfig() !== null, "sync_enabled = 1 بترجّع المحرك");
  }

  // ===== ⑦ إعادة التفعيل الذرّية =====
  if (!reactivateMod || typeof reactivateMod.reactivate !== "function") {
    ok(false, "reactivate موجودة في electron/sync/reactivate");
    ok(false, "إعادة تفعيل بكود لمحل تاني بتترفض");
    ok(false, "فشل السيرفر مابيلمسش الهوية القديمة");
    ok(false, "إعادة تفعيل ناجحة بتبدّل المفتاح");
    return;
  }

  const { reactivate } = reactivateMod;
  const makeDeps = (request) => {
    const applied = [];
    return {
      applied,
      deps: {
        getStoredShopCode: () => creds().shop_code,
        getServerUrl: () => creds().sync_server_url,
        request,
        apply: (c) => {
          applied.push(c);
          settingsRepository.setActivation(c);
        },
      },
    };
  };

  // ⑦أ — كود بتاع محل تاني: رفض، والهوية مابتتلمسش.
  // ⚠️ من غير الحارس ده، كود مولّد بالغلط بيربط بيانات المحل بحساب محل تاني.
  {
    const { applied, deps } = makeDeps(async () => ({
      shopCode: "SHOP-0002",
      secretKey: "sk_other_shop",
      shopName: "محل تاني",
    }));
    let threw = false;
    try {
      await reactivate("CODE-OTHER", deps);
    } catch {
      threw = true;
    }
    const now = creds();
    ok(
      threw && applied.length === 0 && now.secret_key === REAL_SECRET,
      "كود بتاع محل تاني بيترفض والهوية القديمة زي ما هي"
    );
  }

  // ⑦ب — السيرفر رفض/النت فاصل: الهوية مابتتلمسش.
  // ⚠️ ده سبب وجود إعادة التفعيل الذرّية أصلاً — مفيش لحظة المحل فيها بلا هوية.
  {
    const { applied, deps } = makeDeps(async () => {
      throw new Error("تعذّر الاتصال بالسيرفر");
    });
    let threw = false;
    try {
      await reactivate("CODE-NET-FAIL", deps);
    } catch {
      threw = true;
    }
    const now = creds();
    ok(
      threw && applied.length === 0 && now.secret_key === REAL_SECRET,
      "فشل السيرفر مابيلمسش الهوية القديمة"
    );
  }

  // ⑦ج — كود صحيح لنفس المحل: المفتاح بيتدوّر.
  {
    const { applied, deps } = makeDeps(async () => ({
      shopCode: REAL_CODE,
      secretKey: "sk_rotated_key_beef",
      shopName: "محلي",
    }));
    const res = await reactivate("CODE-GOOD", deps);
    const now = creds();
    ok(
      applied.length === 1 &&
        now.secret_key === "sk_rotated_key_beef" &&
        now.shop_code === REAL_CODE &&
        res.shopName === "محلي",
      "إعادة تفعيل ناجحة بتدوّر المفتاح وتسيب كود المحل"
    );
  }
}

main()
  .catch((err) => {
    console.error("✗ FAIL خطأ غير متوقع:", err && err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* تجاهل */
    }
    console.log(results.join(""));
    process.exit(process.exitCode ?? 0);
  });
