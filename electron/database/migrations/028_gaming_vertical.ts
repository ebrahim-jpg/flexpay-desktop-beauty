import type Database from "better-sqlite3";

// Migration 028 — ختم المجال (نسخة البلايستيشن).
// بيسجّل إن قاعدة البيانات دي بتاعة مجال «gaming» عشان:
//   • حارس النسخ الاحتياطي يرفض ترستور نسخة مجال تاني (تجزئة/ملابس/موبايل) هنا والعكس.
//   • أي تشخيص مستقبلي يعرف قاعدة البيانات دي بتاعة أنهي مجال.
// مضاف فقط (ALTER ADD COLUMN + UPDATE على صف الإعدادات الوحيد) — صفر مساس ببيانات تانية.
//
// ⚠️ الرقم 028 = بعد آخر migration في الأساس (027_sync_toggle). أي migration أساس جديدة
// بتتنقل هنا **برقم النسخة دي التالي**، مش برقمها في الأساس (نفس اللي اتعمل في الموبايل).
export const migration_028 = {
  version: 28,
  name: "gaming_vertical",
  up: (db: Database.Database) => {
    const cols = db.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "vertical")) {
      // ⚠️ الـDEFAULT مش رفاهية: الـseed بيعمل صف الإعدادات **بعد** الـmigrations
      // (connection.ts: runMigrations ثم seedDatabase)، فـUPDATE لوحده بيأثر على صفر صفوف
      // في قاعدة بيانات جديدة ويسيب الختم NULL → حارس النسخ الاحتياطي يرفض نسخة شرعية.
      db.exec("ALTER TABLE settings ADD COLUMN vertical TEXT DEFAULT 'gaming';");
    }
    // أمان إضافي لأي صف قديم سايب الختم فاضي أو غلط
    db.prepare(
      "UPDATE settings SET vertical = 'gaming' WHERE vertical IS NULL OR vertical <> 'gaming'"
    ).run();
  },
};
