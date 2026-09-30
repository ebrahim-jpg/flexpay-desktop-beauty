import type Database from "better-sqlite3";

// Migration 010 — سجل عمليات المزامنة (PRD-08)
// يخزّن نتيجة كل دفعة مزامنة لعرضها في شاشة مراقب المزامنة.
export const migration_010 = {
  version: 10,
  name: "sync_log",
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
        result        TEXT NOT NULL,        -- 'success' | 'error'
        records_count INTEGER DEFAULT 0,
        message       TEXT
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp ON sync_log(timestamp);`
    );
    // فهرس لتسريع سحب الدُفعات المنتظرة بالترتيب الزمني
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_sync_queue_status_created ON sync_queue(status, created_at);`
    );
  },
};
