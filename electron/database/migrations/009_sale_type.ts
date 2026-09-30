import type Database from "better-sqlite3";

// Migration 009 — نوع البيع: بالقطعة أو بالوزن (كيلو)
export const migration_009 = {
  version: 9,
  name: "sale_type",
  up: (db: Database.Database) => {
    const prodCols = (db.prepare("PRAGMA table_info(products)").all() as {
      name: string;
    }[]).map((c) => c.name);
    if (!prodCols.includes("sale_type")) {
      db.exec("ALTER TABLE products ADD COLUMN sale_type TEXT DEFAULT 'piece';");
    }

    const itemCols = (db.prepare("PRAGMA table_info(order_items)").all() as {
      name: string;
    }[]).map((c) => c.name);
    if (!itemCols.includes("sale_type")) {
      db.exec("ALTER TABLE order_items ADD COLUMN sale_type TEXT DEFAULT 'piece';");
    }
  },
};
