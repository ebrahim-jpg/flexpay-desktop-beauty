import type Database from "better-sqlite3";

// Migration 023 — كود الحضور (بديل البصمة) + الانصراف التلقائي والتحذير.
// كله مضاف فقط (ALTER ADD COLUMN) — صفر تعديل على البيانات القديمة.
export const migration_023 = {
  version: 23,
  name: "attendance_codes",
  up: (db: Database.Database) => {
    // كود حضور خاص بكل مستخدم (5 أرقام، مشفّر) — منفصل تماماً عن باسورد/PIN الدخول.
    // كل موظف بيسجّل حضوره/انصرافه بكوده لوحده (زي البصمة) — يمنع التلاعب.
    addColumn(db, "users", "attendance_code_hash", "TEXT");

    // تخصيص اختياري لكل موظف (NULL = استخدم القيمة العامة من الإعدادات).
    addColumn(db, "users", "auto_clockout_hours", "REAL"); // انصراف تلقائي بعد كذا ساعة
    addColumn(db, "users", "warn_hours", "REAL"); // تحذير «لسه موجود؟» بعد كذا ساعة

    // القيم العامة الافتراضية للكل (0 = متعطّلة).
    addColumn(db, "settings", "auto_clockout_hours", "REAL DEFAULT 0");
    addColumn(db, "settings", "attendance_warn_hours", "REAL DEFAULT 0");
  },
};

// إضافة عمود بأمان — يتجاهل لو موجود (لبيانات قديمة اتطبّق عليها جزئياً)
function addColumn(db: Database.Database, table: string, column: string, def: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
}
