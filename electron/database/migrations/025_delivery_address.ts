import type Database from "better-sqlite3";

// Migration 025 — عنوان التوصيل على الأوردر (يتطبع في الفاتورة للدليفري).
// مضاف فقط (ALTER ADD COLUMN) — صفر تعديل على البيانات القديمة.
export const migration_025 = {
  version: 25,
  name: "delivery_address",
  up: (db: Database.Database) => {
    const cols = db.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "delivery_address")) {
      db.exec("ALTER TABLE orders ADD COLUMN delivery_address TEXT;");
    }
  },
};
