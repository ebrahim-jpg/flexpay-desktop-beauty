// يطبع إعداد المزامنة في الديسكتوب (من غير السر الكامل) — للتشخيص.
// تشغيل: node scripts/run-electron.js scripts/show-sync-config.js
const Database = require("better-sqlite3");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const candidates = [
  path.join(os.homedir(), "AppData", "Roaming", "Electron", "database.db"),
  path.join(os.homedir(), "AppData", "Roaming", "flexpay-desktop", "database.db"),
  path.join(os.homedir(), "AppData", "Roaming", "FlexPay", "database.db"),
];

for (const p of candidates) {
  if (!fs.existsSync(p)) continue;
  try {
    const db = new Database(p, { readonly: true, fileMustExist: true });
    const row = db.prepare(
      "SELECT shop_code, secret_key, sync_server_url FROM settings WHERE id = 1"
    ).get();
    const mtime = fs.statSync(p).mtime.toISOString();
    console.log(`\n📁 ${p}  (آخر تعديل: ${mtime})`);
    if (!row) {
      console.log("  مفيش صف settings");
    } else {
      const sk = row.secret_key || "";
      console.log("  shop_code   :", row.shop_code || "(فاضي)");
      console.log("  server_url  :", row.sync_server_url || "(فاضي)");
      console.log(
        "  secret_key  :",
        sk ? `مضبوط (طول ${sk.length}، يبدأ بـ ${sk.slice(0, 4)}…)` : "(فاضي)"
      );
    }
    db.close();
  } catch (e) {
    console.log(`  ✗ تعذّر فتح ${p}: ${e.message}`);
  }
}
process.exit(0);
