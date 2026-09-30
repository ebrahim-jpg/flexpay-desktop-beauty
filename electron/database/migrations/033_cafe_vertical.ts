import type Database from "better-sqlite3";

// Migration 033 — ختم المجال «كافيه» بس. **إضافة بس** — صفر مساس بالبيانات.
//
// النسخة دي منسوخة من «بلايستيشن + كافيه»، و032 عندها trigger بيختم أي صف إعدادات جديد
// `gaming_cafe`. مينفعش نعدّل 032 (never edit an applied migration)، فهنا بنشيل الـtrigger ده
// ونحط واحد بيختم `cafe` — وإلا النسخة الاحتياطية من الكافيه كانت هتترستور جوّه «بلايستيشن + كافيه».
export const migration_033 = {
  version: 33,
  name: "cafe_vertical",
  up: (db: Database.Database) => {
    db.exec("DROP TRIGGER IF EXISTS trg_settings_vertical_gaming_cafe;");
    db.prepare("UPDATE settings SET vertical = 'cafe'").run();
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_settings_vertical_cafe
      AFTER INSERT ON settings
      BEGIN
        UPDATE settings SET vertical = 'cafe' WHERE id = NEW.id;
      END;
    `);
  },
};
