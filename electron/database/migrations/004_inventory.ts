import type Database from "better-sqlite3";

// Migration 004 — الموردين والمخزون وحركاته (PRD-04)
export const migration_004 = {
  version: 4,
  name: "inventory",
  up: (db: Database.Database) => {
    // الموردين
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id    TEXT UNIQUE NOT NULL,
        name        TEXT NOT NULL,
        phone       TEXT,
        email       TEXT,
        address     TEXT,
        notes       TEXT,
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

    // مواد المخزون
    db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id         TEXT UNIQUE NOT NULL,
        name             TEXT NOT NULL,
        unit             TEXT NOT NULL,
        current_quantity REAL DEFAULT 0,
        alert_threshold  REAL NOT NULL,
        waste_percentage REAL DEFAULT 0,
        cost_per_unit    REAL DEFAULT 0,
        supplier_id      INTEGER REFERENCES suppliers(id),
        status           TEXT DEFAULT 'sufficient',
        created_by       INTEGER,
        updated_by       INTEGER,
        created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status      TEXT DEFAULT 'pending',
        synced_at        DATETIME,
        is_deleted       INTEGER DEFAULT 0,
        deleted_by       INTEGER,
        deleted_at       DATETIME
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_items(status, is_deleted);`
    );

    // حركات المخزون
    db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id        TEXT UNIQUE NOT NULL,
        item_id         INTEGER REFERENCES inventory_items(id),
        item_name       TEXT NOT NULL,
        unit            TEXT NOT NULL,
        type            TEXT NOT NULL,
        quantity        REAL NOT NULL,
        quantity_before REAL NOT NULL,
        quantity_after  REAL NOT NULL,
        reason          TEXT,
        order_id        INTEGER,
        created_by      INTEGER,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status     TEXT DEFAULT 'pending',
        synced_at       DATETIME
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_inv_tx_item ON inventory_transactions(item_id, created_at);`
    );

    // إعداد الإخفاء التلقائي عند نفاد المخزون (PRD-04)
    const cols = db
      .prepare("PRAGMA table_info(settings)")
      .all() as { name: string }[];
    if (!cols.some((c) => c.name === "auto_hide_out_of_stock")) {
      db.exec(
        `ALTER TABLE settings ADD COLUMN auto_hide_out_of_stock INTEGER DEFAULT 1;`
      );
    }
  },
};
