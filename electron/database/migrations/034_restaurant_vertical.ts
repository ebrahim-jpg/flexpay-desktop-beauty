import type Database from "better-sqlite3";

// Migration 034 — نسخة «مطاعم»: ختم المجال + طابعة المطبخ. **إضافة بس** — صفر مساس بالبيانات.
//
// ⚠️ النسخة دي منسوخة من الكافيه، و033 عندها trigger بيختم أي صف إعدادات جديد `cafe`.
// مينفعش نعدّل 033 (ممنوع تعديل migration اتطبّق)، فهنا بنشيله ونحط واحد بيختم `restaurant` —
// وإلا النسخة الاحتياطية من المطعم كانت هتترستور جوّه الكافيه، والويب كان هيعامله كافيه.
//
// وطابعة المطبخ عمود مستقل عن `printer_name`: تذكرة المطبخ بتطلع على طابعة الشيف،
// والفاتورة على طابعة الكاشير. `NULL` = استخدم طابعة الفاتورة (سلوك محل بطابعة واحدة).
export const migration_034 = {
  version: 34,
  name: "restaurant_vertical",
  up: (db: Database.Database) => {
    db.exec("DROP TRIGGER IF EXISTS trg_settings_vertical_cafe;");
    db.prepare("UPDATE settings SET vertical = 'restaurant'").run();
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_settings_vertical_restaurant
      AFTER INSERT ON settings
      BEGIN
        UPDATE settings SET vertical = 'restaurant' WHERE id = NEW.id;
      END;
    `);

    // الحارس مبني على السكيما الفعلية مش على افتراض إن القاعدة قديمة
    const cols = db.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "kitchen_printer_name")) {
      db.exec("ALTER TABLE settings ADD COLUMN kitchen_printer_name TEXT");
    }
  },
};
