import type Database from "better-sqlite3";

// Migration 003 — الفئات والمنتجات والوصفات (PRD-03)
export const migration_003 = {
  version: 3,
  name: "products",
  up: (db: Database.Database) => {
    // الفئات
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id    TEXT UNIQUE NOT NULL,
        name        TEXT NOT NULL,
        icon        TEXT,
        sort_order  INTEGER DEFAULT 0,
        is_active   INTEGER DEFAULT 1,
        created_by  INTEGER,
        updated_by  INTEGER,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'pending',
        synced_at   DATETIME,
        is_deleted  INTEGER DEFAULT 0,
        deleted_by  INTEGER,
        deleted_at  DATETIME
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order, is_deleted);`
    );

    // المنتجات
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id     TEXT UNIQUE NOT NULL,
        name         TEXT NOT NULL,
        description  TEXT,
        category_id  INTEGER REFERENCES categories(id),
        price        REAL NOT NULL,
        barcode      TEXT,
        image_path   TEXT,
        is_active    INTEGER DEFAULT 1,
        is_available INTEGER DEFAULT 1,
        modifiers    TEXT DEFAULT '[]',
        cost_price   REAL DEFAULT 0,
        created_by   INTEGER,
        updated_by   INTEGER,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status  TEXT DEFAULT 'pending',
        synced_at    DATETIME,
        is_deleted   INTEGER DEFAULT 0,
        deleted_by   INTEGER,
        deleted_at   DATETIME
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, is_deleted);`
    );
    // الباركود فريد فقط بين المنتجات غير المحذوفة (يتوافق مع الـ Soft Delete)
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode
      ON products(barcode) WHERE barcode IS NOT NULL AND is_deleted = 0;
    `);

    // الوصفات — ربط المنتج بمكوناته من المخزون
    // ملاحظة: inventory_item_id بدون REFERENCES لأن جدول inventory_items يُنشأ في PRD-04.
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_recipes (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id            TEXT UNIQUE NOT NULL,
        product_id          INTEGER REFERENCES products(id),
        inventory_item_id   INTEGER,
        inventory_item_name TEXT NOT NULL,
        unit                TEXT NOT NULL,
        standard_qty        REAL NOT NULL,
        created_by          INTEGER,
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status         TEXT DEFAULT 'pending',
        synced_at           DATETIME,
        is_deleted          INTEGER DEFAULT 0,
        deleted_by          INTEGER,
        deleted_at          DATETIME
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_recipes_product ON product_recipes(product_id, is_deleted);`
    );
  },
};
