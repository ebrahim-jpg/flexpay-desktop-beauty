import type Database from "better-sqlite3";

// Migration 024 — تخصيص البائع لفئات معيّنة + نصيبه المحسوب لكل فاتورة.
// كله مضاف فقط (ALTER ADD COLUMN) — صفر تعديل على البيانات القديمة.
export const migration_024 = {
  version: 24,
  name: "seller_categories",
  up: (db: Database.Database) => {
    // فئات البائع: JSON array بـ category ids — NULL/فاضي = بائع عام (كل الفئات)
    addColumn(db, "users", "seller_categories", "TEXT");

    // نصيب البائع من الفاتورة (مجموع أسعار الأصناف اللي من فئاته) — يُحسب وقت البيع.
    // NULL في الفواتير القديمة → الويب يرجع لإجمالي الفاتورة (توافق خلفي).
    addColumn(db, "order_sellers", "attributed_amount", "REAL");
  },
};

function addColumn(db: Database.Database, table: string, column: string, def: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
}
