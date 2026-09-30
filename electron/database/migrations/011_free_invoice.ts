import type Database from "better-sqlite3";

// Migration 011 — فاتورة مجانية
// is_free = 1 يعني فاتورة اتعملت مجاناً: تخصم المخزون عادي لكن متتحسبش في الفلوس.
export const migration_011 = {
  version: 11,
  name: "free_invoice",
  up: (db: Database.Database) => {
    db.exec(`ALTER TABLE orders ADD COLUMN is_free INTEGER DEFAULT 0;`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_orders_is_free ON orders(business_date, is_free);`
    );
  },
};
