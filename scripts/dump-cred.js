// يكتب {shop_code, secret_key} في ملف مؤقّت للتشخيص (مش بيطبع السر).
// تشغيل: node scripts/run-electron.js scripts/dump-cred.js
const Database = require("better-sqlite3");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const dbPath = path.join(os.homedir(), "AppData", "Roaming", "Electron", "database.db");
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const row = db.prepare("SELECT shop_code, secret_key FROM settings WHERE id = 1").get();
db.close();

const out = path.join(os.tmpdir(), "flexpay-cred.json");
fs.writeFileSync(out, JSON.stringify({ shop_code: row?.shop_code, secret_key: row?.secret_key }));
console.log("✓ اتكتب الإعداد في", out, "(shop_code:", row?.shop_code + ")");
process.exit(0);
