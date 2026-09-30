import type Database from "better-sqlite3";

// Migration 018 — لقطة البائعين الحاضرين وقت كل طلب (لتحليل أداء البائعين)
// ⚠️ إضافي بحت (جدول جديد). البائع = موظف بدور seller كان حاضر لحظة البيع.
//    الطلب ممكن يتنسب لأكتر من بائع (كلهم كانوا موجودين)، أو لا أحد (مفيش بائع حاضر).
export const migration_018 = {
  version: 18,
  name: "order_sellers",
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS order_sellers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id    TEXT UNIQUE NOT NULL,
        order_id    INTEGER NOT NULL REFERENCES orders(id),
        seller_id   INTEGER NOT NULL,
        seller_name TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'pending'
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_order_sellers_order ON order_sellers(order_id);`
    );
  },
};
