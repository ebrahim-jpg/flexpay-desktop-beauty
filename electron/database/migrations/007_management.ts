import type Database from "better-sqlite3";

// Migration 007 — الحضور والمصاريف (PRD-07)
export const migration_007 = {
  version: 7,
  name: "management",
  up: (db: Database.Database) => {
    // الحضور والانصراف
    db.exec(`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id      TEXT UNIQUE NOT NULL,
        user_id       INTEGER REFERENCES users(id),
        user_name     TEXT NOT NULL,
        type          TEXT NOT NULL,
        timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
        business_date TEXT NOT NULL,
        note          TEXT,
        created_by    INTEGER,
        sync_status   TEXT DEFAULT 'pending',
        synced_at     DATETIME
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_logs(user_id);`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_logs(business_date);`
    );

    // المصاريف
    db.exec(`
      CREATE TABLE IF NOT EXISTS expenses (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id            TEXT UNIQUE NOT NULL,
        category            TEXT NOT NULL,
        description         TEXT NOT NULL,
        amount              REAL NOT NULL,
        drawer_amount       REAL NOT NULL,
        staff_id            INTEGER REFERENCES users(id),
        staff_name          TEXT,
        inventory_item_id   INTEGER,
        inventory_item_name TEXT,
        is_recurring        INTEGER DEFAULT 0,
        recurrence_type     TEXT,
        expense_date        TEXT NOT NULL,
        created_by          INTEGER NOT NULL,
        created_by_name     TEXT NOT NULL,
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status         TEXT DEFAULT 'pending',
        synced_at           DATETIME,
        is_deleted          INTEGER DEFAULT 0,
        deleted_by          INTEGER,
        deleted_at          DATETIME
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date, is_deleted);`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);`
    );
  },
};
