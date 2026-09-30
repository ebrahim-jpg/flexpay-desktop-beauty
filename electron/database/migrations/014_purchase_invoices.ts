import type Database from "better-sqlite3";

// Migration 014 — فواتير التوريد + تحسين نسب مصروف الدرج (PRD المخزون)
// ⚠️ إضافي بحت (CREATE TABLE + ADD COLUMN بقيم افتراضية):
//   - البيانات القديمة متتأثرش إطلاقاً، والأعمدة الجديدة NULL/0 للقديم.
//   - المنطق القديم يفضل شغّال على المصاريف القديمة (drawer_owner فاضي → created_by زي ما هو).
export const migration_014 = {
  version: 14,
  name: "purchase_invoices",
  up: (db: Database.Database) => {
    // ===== فواتير التوريد (رأس) =====
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id          TEXT UNIQUE NOT NULL,
        reference         TEXT,                              -- رقم/اسم الفاتورة (اختياري)
        invoice_date      TEXT NOT NULL,                     -- YYYY-MM-DD
        supplier_id       INTEGER REFERENCES suppliers(id),
        supplier_name     TEXT,
        payment_type      TEXT NOT NULL DEFAULT 'cash',      -- cash | credit
        total_cost        REAL NOT NULL DEFAULT 0,           -- إجمالي تكلفة البضاعة
        paid_amount       REAL NOT NULL DEFAULT 0,           -- المدفوع دلوقتي (درج + مالك)
        drawer_amount     REAL NOT NULL DEFAULT 0,           -- اللي خرج من الدرج فعلياً
        drawer_owner_id   INTEGER REFERENCES users(id),      -- درج/وردية مين
        drawer_owner_name TEXT,
        notes             TEXT,
        created_by        INTEGER NOT NULL,                  -- مين سجّل الفاتورة (المدير)
        created_by_name   TEXT NOT NULL,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status       TEXT DEFAULT 'pending',
        synced_at         DATETIME,
        is_deleted        INTEGER DEFAULT 0
      );
    `);

    // ===== بنود الفاتورة =====
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id          TEXT UNIQUE NOT NULL,
        invoice_id        INTEGER NOT NULL REFERENCES purchase_invoices(id),
        invoice_local_id  TEXT NOT NULL,
        inventory_item_id INTEGER NOT NULL,
        item_name         TEXT NOT NULL,
        unit              TEXT,
        quantity          REAL NOT NULL,
        unit_cost         REAL NOT NULL,
        line_cost         REAL NOT NULL,
        sync_status       TEXT DEFAULT 'pending'
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pinv_items_invoice ON purchase_invoice_items(invoice_id);`
    );

    // ===== أعمدة إضافية على المصاريف =====
    // recorded_by: مين سجّل المصروف فعلياً (تدقيق) — created_by يبقى = صاحب الدرج/الوردية.
    // owner_paid_amount: المدفوع من غير الدرج (فلوس المالك) — يدخل في صافي المالية بس مش في تقفيل أي درج.
    db.exec(`ALTER TABLE expenses ADD COLUMN recorded_by_id INTEGER;`);
    db.exec(`ALTER TABLE expenses ADD COLUMN recorded_by_name TEXT;`);
    db.exec(`ALTER TABLE expenses ADD COLUMN owner_paid_amount REAL DEFAULT 0;`);
  },
};
