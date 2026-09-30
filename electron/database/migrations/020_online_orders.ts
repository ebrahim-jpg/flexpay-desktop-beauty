import type Database from "better-sqlite3";

// Migration 020 — طلبات المتجر الإلكتروني المسحوبة من الويب (محلي بحت).
// ⚠️ إضافي بحت + محلي (مالوش sync_queue — ده اتجاه ويب→ديسكتوب). مفيش أي تأثير
//    على البيانات القديمة. الطلب يدخل هنا لما الديسكتوب يسحبه، والكاشير يجهّزه ويضربه.
//    status محلي: new (جديد) → done (اتضرب) / cancelled.
export const migration_020 = {
  version: 20,
  name: "online_orders",
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS online_orders (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id          TEXT UNIQUE NOT NULL,
        status            TEXT NOT NULL DEFAULT 'new',
        customer_name     TEXT,
        customer_phone    TEXT,
        address           TEXT,
        notes             TEXT,
        items             TEXT NOT NULL DEFAULT '[]',
        items_count       INTEGER DEFAULT 0,
        subtotal          REAL DEFAULT 0,
        web_created_at    TEXT,
        pulled_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
        web_acked         INTEGER DEFAULT 0,
        desktop_order_id  INTEGER,
        completion_synced INTEGER DEFAULT 0
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_online_orders_status ON online_orders(status);`
    );
  },
};
