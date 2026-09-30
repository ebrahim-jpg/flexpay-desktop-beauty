import type Database from "better-sqlite3";

// Migration 002 — جدول الإعدادات (PRD-02). صف واحد دائماً (id = 1).
export const migration_002 = {
  version: 2,
  name: "settings",
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id                  INTEGER PRIMARY KEY,
        local_id            TEXT,
        shop_name           TEXT DEFAULT 'محلي',
        shop_logo_path      TEXT,
        country             TEXT DEFAULT 'مصر',
        currency            TEXT DEFAULT 'جنيه مصري',
        currency_symbol     TEXT DEFAULT 'ج.م',
        tax_rate            REAL DEFAULT 0,
        business_day_start  INTEGER DEFAULT 0,
        nationalities       TEXT DEFAULT '["مصري"]',
        payment_methods     TEXT,
        low_stock_threshold INTEGER DEFAULT 10,
        absence_alert_days  INTEGER DEFAULT 14,
        receipt_header      TEXT,
        receipt_footer      TEXT DEFAULT 'شكراً لزيارتكم',
        printer_name        TEXT,
        shop_code           TEXT,
        secret_key          TEXT,
        sync_server_url     TEXT DEFAULT 'https://api.yourplatform.com',
        updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by          INTEGER,
        sync_status         TEXT DEFAULT 'pending',
        synced_at           DATETIME
      );
    `);
  },
};
