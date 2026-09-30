import type Database from "better-sqlite3";

// Migration 037 — نسخة «تجميل وحلاقة»: ختم المجال + الخدمة + إسناد الحلاق.
//
// ⚠️ النسخة منسوخة من المطعم، و034 عندها trigger بيختم أي صف إعدادات جديد `restaurant`.
// مينفعش نعدّل 034 (ممنوع تعديل migration اتطبّق)، فهنا بنشيله ونحط واحد بيختم `beauty` —
// وإلا النسخة الاحتياطية من التجميل كانت هتترستور جوّه المطعم، والويب كان هيعامله مطعم.
//
// ===== إسناد الحلاق: أخطر حقل في النسخة دي =====
// فلوس الحلاقين بتتحدد منه. القرار (شوف docs/BEAUTY-VERTICAL-PLAN.md):
//   • `gaming_sessions.staff_id`      = الحلاق **الأساسي** للجلسة (بيتحدد وقت الفتح)
//   • `gaming_session_items.staff_id` = اللي عمل **الخدمة دي** — بيورث الأساسي لو فاضي
// ليه على البند كمان مش على الجلسة بس: سماح عملت الصبغة ومنى عملت الاستشوار في نفس
// القعدة. الإسناد على الجلسة بس كان هيقسّم العمولة **بالتقريب**، وده فلوس ناس.
//
// ⚠️ **إضافة بس** (`ALTER TABLE ADD COLUMN` بحارس على السكيما الفعلية).
export const migration_037 = {
  version: 37,
  name: "beauty_vertical",
  up: (db: Database.Database) => {
    // ===== ختم المجال =====
    db.exec("DROP TRIGGER IF EXISTS trg_settings_vertical_restaurant;");
    db.prepare("UPDATE settings SET vertical = 'beauty'").run();
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_settings_vertical_beauty
      AFTER INSERT ON settings
      BEGIN
        UPDATE settings SET vertical = 'beauty' WHERE id = NEW.id;
      END;
    `);

    // ===== الخدمة =====
    // ⚠️ الخدمة **مش** منتج بلا وصفة: وصفتها بتشتغل زي ما هي (الصبغة بتستهلك صبغة
    // وفويل من المخزن). العلم ده بيفرّقها في **العرض والجرد** بس: الخدمة مالهاش
    // «رصيد بضاعة» تتعدّ في الجرد، وتقريرها منفصل عن مبيعات المنتجات.
    addColumn(db, "products", "is_service", "INTEGER NOT NULL DEFAULT 0");

    // مدة الخدمة بالدقايق — أساس المواعيد بعدين، ومقارنة «المدة المتوقّعة» بالفعلية
    addColumn(db, "products", "duration_minutes", "INTEGER NOT NULL DEFAULT 0");

    // ===== إسناد الحلاق =====
    addColumn(db, "gaming_sessions", "staff_id", "INTEGER");
    addColumn(db, "gaming_sessions", "staff_name", "TEXT");
    addColumn(db, "gaming_session_items", "staff_id", "INTEGER");
    addColumn(db, "gaming_session_items", "staff_name", "TEXT");
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_items_staff
      ON gaming_session_items(staff_id);
    `);
  },
};

// إضافة عمود بأمان — الحارس على السكيما الفعلية مش على افتراض
function addColumn(db: Database.Database, table: string, column: string, def: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
}
