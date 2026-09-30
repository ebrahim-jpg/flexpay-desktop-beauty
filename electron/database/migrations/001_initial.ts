import type Database from "better-sqlite3";

// Migration 001 — جداول مرحلة الأساس والمصادقة (PRD-01)
export const migration_001 = {
  version: 1,
  name: "initial",
  up: (db: Database.Database) => {
    // جدول المستخدمين
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id      TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        username      TEXT NOT NULL,
        password_hash TEXT,
        pin_hash      TEXT,
        role          TEXT NOT NULL,
        permissions   TEXT DEFAULT '{}',
        is_active     INTEGER DEFAULT 1,
        last_login_at DATETIME,
        created_by    INTEGER,
        updated_by    INTEGER,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status   TEXT DEFAULT 'pending',
        synced_at     DATETIME,
        is_deleted    INTEGER DEFAULT 0,
        deleted_by    INTEGER,
        deleted_at    DATETIME
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active, is_deleted);
    `);

    // سجل العمليات (Audit Log)
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id    TEXT UNIQUE NOT NULL,
        user_id     INTEGER NOT NULL,
        user_name   TEXT NOT NULL,
        action      TEXT NOT NULL,
        entity_type TEXT,
        entity_id   INTEGER,
        old_value   TEXT,
        new_value   TEXT,
        timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'pending',
        synced_at   DATETIME
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    `);

    // قائمة انتظار المزامنة
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id        TEXT NOT NULL,
        entity_type     TEXT NOT NULL,
        event_type      TEXT NOT NULL,
        payload         TEXT NOT NULL,
        status          TEXT DEFAULT 'pending',
        attempts        INTEGER DEFAULT 0,
        last_attempt_at DATETIME,
        error_message   TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status);
    `);
  },
};
