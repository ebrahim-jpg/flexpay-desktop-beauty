import type Database from "better-sqlite3";

// Migration 006 — توسيع جدول العملاء (PRD-06)
// جدول customers اتعمل في migration 005؛ هنا بنضيف أعمدة البروفايل الإضافية.
export const migration_006 = {
  version: 6,
  name: "customers",
  up: (db: Database.Database) => {
    const cols = (db.prepare("PRAGMA table_info(customers)").all() as {
      name: string;
    }[]).map((c) => c.name);

    if (!cols.includes("avg_spent")) {
      db.exec("ALTER TABLE customers ADD COLUMN avg_spent REAL DEFAULT 0;");
    }
    if (!cols.includes("favorite_product_id")) {
      db.exec("ALTER TABLE customers ADD COLUMN favorite_product_id INTEGER;");
    }
    if (!cols.includes("favorite_product_name")) {
      db.exec("ALTER TABLE customers ADD COLUMN favorite_product_name TEXT;");
    }

    // موبايل فريد بين العملاء غير المحذوفين (يتوافق مع Soft Delete)
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique
      ON customers(phone) WHERE phone IS NOT NULL AND is_deleted = 0;
    `);
  },
};
