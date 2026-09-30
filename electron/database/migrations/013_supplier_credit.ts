import type Database from "better-sqlite3";

// Migration 013 — آجل ودفعات الموردين (حسابات دائنة)
// suppliers.balance = الرصيد المستحق للمورد (اللي احنا مدينينله).
// supplier_transactions = كشف حساب: كل آجل (purchase) وكل دفعة (payment).
export const migration_013 = {
  version: 13,
  name: "supplier_credit",
  up: (db: Database.Database) => {
    db.exec(`ALTER TABLE suppliers ADD COLUMN balance REAL DEFAULT 0;`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_transactions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id        TEXT UNIQUE NOT NULL,
        supplier_id     INTEGER NOT NULL REFERENCES suppliers(id),
        supplier_name   TEXT NOT NULL,
        type            TEXT NOT NULL,            -- 'purchase' | 'payment'
        total_amount    REAL NOT NULL DEFAULT 0,  -- purchase: التكلفة الكلية | payment: مبلغ الدفعة
        paid_amount     REAL NOT NULL DEFAULT 0,  -- المدفوع وقتها
        drawer_amount   REAL NOT NULL DEFAULT 0,  -- اللي خرج من درج النهاردة
        balance_change  REAL NOT NULL DEFAULT 0,  -- +دين (purchase) | −دفعة (payment)
        balance_after   REAL NOT NULL DEFAULT 0,
        description     TEXT,
        business_date   TEXT NOT NULL,
        created_by      INTEGER,
        created_by_name TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status     TEXT DEFAULT 'pending',
        synced_at       DATETIME,
        is_deleted      INTEGER DEFAULT 0,
        deleted_by      INTEGER,
        deleted_at      DATETIME
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_supplier_tx ON supplier_transactions(supplier_id, created_at);`
    );
  },
};
