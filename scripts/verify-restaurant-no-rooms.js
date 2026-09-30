// حارس نسخة «المطاعم» — مفيش أي منطق غرف بلايستيشن ولا تسعير بالوقت (فحص ثابت بلا إلكترون).
// التشغيل: node scripts/verify-restaurant-no-rooms.js
//
// النسخة دي منسوخة من الكافيه (وهو منسوخ من «بلايستيشن + كافيه»). أي دمج بيرجّع صفحة الغرف أو تسعير الوقت أو
// ألفاظ «غرفة/بلايستيشن/سنجل/مالتي» بصمت — الفحص ده بيمسكها في ثانية.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
};
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(root, rel), "utf8") : "");
function stripComments(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:"'`\w])\/\/.*$/, "$1"))
    .join("\n");
}
const code = (rel) => stripComments(read(rel));
function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

// ===== ① الملفات والقنوات =====
console.log("\n— مفيش شاشات ولا قنوات غرف —");
for (const rel of ["app/(main)/rooms", "components/gaming/RoomsManager.tsx", "components/gaming/GamingPricingSettings.tsx"]) {
  ok(!exists(rel), `${rel} مش موجود`);
}
const ipc = code("electron/ipc/gaming.ipc.ts");
for (const ch of ["gaming:session:extend", "gaming:session:switchMode"]) {
  ok(!ipc.includes(`"${ch}"`), `قناة ${ch} (مدة/وضع الغرفة) مش متسجّلة`);
}
const types = code("types/ipc.types.ts");
ok(!/"gaming:session:(extend|switchMode)"/.test(types), "أنواع IPC مافيهاش قنوات الغرف");

// ===== ② المنطق =====
console.log("\n— مفيش تسعير وقت —");
const shared = code("shared/gaming.ts");
for (const fn of ["computeSessionCharge", "sessionTimer", "rateFor", "timeLineName"]) {
  ok(!new RegExp(`export function ${fn}\\b`).test(shared), `shared/gaming.ts مافيهوش ${fn}`);
}
const repo = code("electron/repositories/gaming.repository.ts");
ok(!/computeSessionCharge|gaming_session_segments|switchMode|extendSession/.test(repo), "الريبو مافيهوش فترات وقت ولا وضع ولا تمديد");
ok(/kind\s*=\s*"table"|const kind: RoomKind = "table"/.test(repo), "حفظ المكان بيعمل طاولة دايماً");
ok(/للكافيه|للمطعم/.test(repo), "فتح حساب على غير طاولة مرفوض برسالة واضحة");
// ⚠️ "gaming_session" نفسها اسم كيان المزامنة (لازم يفضل) — الممنوع إنها تبقى **مصدر فاتورة**
ok(!/source:\s*"gaming_session"|SESSION_SOURCE\[/.test(repo) && /source:\s*TABLE_SESSION_SOURCE/.test(repo), "مصدر الفاتورة table_session بس (مفيش gaming_session)");
ok(!/gaming_session'|GAMING_TIME_CATEGORY/.test(code("electron/repositories/reports.repository.ts")), "التقارير مافيهاش فرع «بند الوقت = الغرف»");

// ===== ③ النصوص الظاهرة =====
console.log("\n— مفيش «غرفة/بلايستيشن/سنجل/مالتي» في أي نص ظاهر —");
const IGNORE = new Set(["app/(main)/store-orders/page.tsx"]);
const ui = [...walk("app"), ...walk("components"), ...walk("store"), ...walk("hooks"), "electron/lib/receipt-html.ts", "electron/lib/report-receipt-html.ts"].filter(
  (f) => exists(f) && !IGNORE.has(f)
);
const leaks = ui.filter((f) => /غرف|بلايستيشن|سنجل|مالتي|PS5|Gamepad2/.test(code(f)));
ok(leaks.length === 0, leaks.length ? `لسه فيه ألفاظ غرف في: ${leaks.join(" · ")}` : `مفيش ألفاظ غرف في ${ui.length} ملف`);

// ===== ④ التنقّل والهوية =====
console.log("\n— التنقّل والهوية —");
const nav = code("components/shared/nav-items.ts");
const hrefs = [...nav.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
ok(hrefs[0] === "/tables", `«الطاولات» أول عنصر (الفعلي ${hrefs[0]})`);
ok(!hrefs.includes("/rooms"), "مفيش لينك للغرف");
ok(/FlexPay Restaurant/.test(code("components/shared/AppSidebar.tsx")), "الشريط الجانبي «FlexPay Restaurant»");
ok(/VERTICAL = "restaurant"/.test(read("electron/ipc/backup.ipc.ts")), "النسخة الاحتياطية بتقبل ختم «restaurant» بس");

console.log(failed === 0 ? "\n✅ نسخة المطعم من غير أي غرف" : `\n❌ ${failed} فحص فشل`);
process.exit(failed === 0 ? 0 : 1);
