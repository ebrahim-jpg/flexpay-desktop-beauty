import type Database from "better-sqlite3";

// Migration 015 — الجرد (Stocktake) + فئات لمواد المخزون
// ⚠️ إضافي بحت (ADD COLUMN nullable + CREATE TABLE):
//   - المواد القديمة category = NULL (تظهر "بدون فئة") — مفيش تأثير على أي سلوك.
//   - جداول الجرد جديدة تمامًا.
export const migration_015 = {
  version: 15,
  name: "stocktake",
  up: (db: Database.Database) => {
    // فئة لمواد المخزون (لتقسيم الجرد) — اختيارية
    db.exec(`ALTER TABLE inventory_items ADD COLUMN category TEXT;`);

    // ===== جلسة جرد (رأس) =====
    db.exec(`
      CREATE TABLE IF NOT EXISTS stocktakes (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id             TEXT UNIQUE NOT NULL,
        reference            TEXT,                       -- اسم/وصف الجرد (اختياري)
        scope                TEXT,                       -- وصف النطاق (JSON: {type, categories[]})
        counted_at           TEXT NOT NULL,              -- اليوم التجاري للجرد (YYYY-MM-DD)
        item_count           INTEGER NOT NULL DEFAULT 0,
        shortage_value       REAL NOT NULL DEFAULT 0,    -- مجموع قيمة العجز (موجب)
        surplus_value        REAL NOT NULL DEFAULT 0,    -- مجموع قيمة الزيادة (موجب)
        variance_value       REAL NOT NULL DEFAULT 0,    -- صافي الفرق بالتكلفة (surplus - shortage)
        notes                TEXT,
        created_by           INTEGER NOT NULL,
        created_by_name      TEXT NOT NULL,
        created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status          TEXT DEFAULT 'pending',
        synced_at            DATETIME,
        is_deleted           INTEGER DEFAULT 0
      );
    `);

    // ===== بنود الجرد (لقطة لكل مادة وقت الجرد) =====
    db.exec(`
      CREATE TABLE IF NOT EXISTS stocktake_items (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id             TEXT UNIQUE NOT NULL,
        stocktake_id         INTEGER NOT NULL REFERENCES stocktakes(id),
        stocktake_local_id   TEXT NOT NULL,
        inventory_item_id    INTEGER NOT NULL,
        item_name            TEXT NOT NULL,
        unit                 TEXT,
        category             TEXT,
        expected_qty         REAL NOT NULL,              -- اللي السيستم شايفه
        counted_qty          REAL NOT NULL,              -- اللي اتعدّ فعليًا
        variance_qty         REAL NOT NULL,              -- counted - expected (سالب = عجز)
        cost_per_unit        REAL NOT NULL DEFAULT 0,
        variance_value       REAL NOT NULL DEFAULT 0,    -- variance_qty * cost_per_unit
        sync_status          TEXT DEFAULT 'pending'
        -- ملاحظة: expected_min + waste_percentage اتضافوا في migration 016 (مش هنا
        --   عشان القواعد اللي طبّقت 015 قبل تحديث التهدير متترقّى بأمان)
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_stk_items_stocktake ON stocktake_items(stocktake_id);`
    );
  },
};
