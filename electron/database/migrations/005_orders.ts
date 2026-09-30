import type Database from "better-sqlite3";

// Migration 005 — العملاء والطلبات وبنودها (PRD-05)
// (جدول customers يُنشأ هنا لأن الطلبات تربطه؛ واجهة العملاء تكتمل في PRD-06)
export const migration_005 = {
  version: 5,
  name: "orders",
  up: (db: Database.Database) => {
    // العملاء
    db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id             TEXT UNIQUE NOT NULL,
        name                 TEXT NOT NULL,
        phone                TEXT,
        gender               TEXT,
        nationality          TEXT,
        notes                TEXT,
        total_visits         INTEGER DEFAULT 0,
        total_spent          REAL DEFAULT 0,
        avg_session_duration REAL DEFAULT 0,
        last_visit_at        DATETIME,
        first_visit_at       DATETIME,
        classification       TEXT,
        favorite_items       TEXT DEFAULT '[]',
        created_by           INTEGER,
        updated_by           INTEGER,
        created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status          TEXT DEFAULT 'pending',
        synced_at            DATETIME,
        is_deleted           INTEGER DEFAULT 0,
        deleted_by           INTEGER,
        deleted_at           DATETIME
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);`);

    // الطلبات
    db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id        TEXT UNIQUE NOT NULL,
        receipt_number  INTEGER NOT NULL,
        customer_id     INTEGER REFERENCES customers(id),
        customer_name   TEXT,
        is_guest        INTEGER DEFAULT 1,
        order_type      TEXT DEFAULT 'counter',
        subtotal        REAL NOT NULL,
        discount_type   TEXT DEFAULT 'none',
        discount_value  REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        tax_rate        REAL DEFAULT 0,
        tax_amount      REAL DEFAULT 0,
        total           REAL NOT NULL,
        payment_method  TEXT NOT NULL,
        amount_paid     REAL NOT NULL,
        change_amount   REAL DEFAULT 0,
        status          TEXT DEFAULT 'paid',
        notes           TEXT,
        cashier_id      INTEGER NOT NULL REFERENCES users(id),
        cashier_name    TEXT NOT NULL,
        cancelled_by    INTEGER REFERENCES users(id),
        cancel_reason   TEXT,
        cancelled_at    DATETIME,
        business_date   TEXT NOT NULL,
        created_by      INTEGER,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status     TEXT DEFAULT 'pending',
        synced_at       DATETIME,
        is_deleted      INTEGER DEFAULT 0,
        deleted_by      INTEGER,
        deleted_at      DATETIME
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_business_date ON orders(business_date);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_cashier ON orders(cashier_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);`);

    // بنود الطلبات
    db.exec(`
      CREATE TABLE IF NOT EXISTS order_items (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id           TEXT UNIQUE NOT NULL,
        order_id           INTEGER REFERENCES orders(id),
        product_id         INTEGER REFERENCES products(id),
        product_name       TEXT NOT NULL,
        base_price         REAL NOT NULL,
        selected_modifiers TEXT DEFAULT '[]',
        unit_price         REAL NOT NULL,
        quantity           INTEGER DEFAULT 1,
        total_price        REAL NOT NULL,
        notes              TEXT,
        created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status        TEXT DEFAULT 'pending',
        synced_at          DATETIME
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);`);
  },
};
