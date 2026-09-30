import type Database from "better-sqlite3";

// Migration 012 — المستفيد من الفاتورة المجانية
// مين خد المجاني: موظف (من المستخدمين) أو عميل (من العملاء).
// بنخزّن النوع + المعرّف + الاسم (snapshot) عشان نعرف لمين راح المجاني (تقارير/قرارات مستقبلية).
export const migration_012 = {
  version: 12,
  name: "free_recipient",
  up: (db: Database.Database) => {
    db.exec(`ALTER TABLE orders ADD COLUMN free_recipient_type TEXT;`);
    db.exec(`ALTER TABLE orders ADD COLUMN free_recipient_id INTEGER;`);
    db.exec(`ALTER TABLE orders ADD COLUMN free_recipient_name TEXT;`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_orders_free_recipient
       ON orders(free_recipient_type, free_recipient_id);`
    );
  },
};
