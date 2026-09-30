import type Database from "better-sqlite3";

// Migration 022 — التوصيل: مناطق بأسعار في الإعدادات + بيانات توصيل على الطلب.
// ⚠️ إضافي بحت + آمن للبيانات القديمة.
// ⚠️⚠️ مهم جداً: delivery_fee ده للعرض والفاتورة بس — **مايدخلش أي حساب مالي**
//     (لا total ولا amount_paid ولا الإيرادات). هو ضمان لحق الدليفري والعميل فقط.
export const migration_022 = {
  version: 22,
  name: "delivery",
  up: (db: Database.Database) => {
    const hasCol = (table: string, col: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
        (c) => c.name === col
      );

    // مناطق التوصيل: JSON [{ id, name, price }]
    if (!hasCol("settings", "delivery_zones")) {
      db.exec(`ALTER TABLE settings ADD COLUMN delivery_zones TEXT DEFAULT '[]';`);
    }

    // بيانات التوصيل على الطلب (كلها للعرض/التحاسب — مش مالية)
    if (!hasCol("orders", "delivery_zone")) {
      db.exec(`ALTER TABLE orders ADD COLUMN delivery_zone TEXT;`);
    }
    if (!hasCol("orders", "delivery_fee")) {
      db.exec(`ALTER TABLE orders ADD COLUMN delivery_fee REAL DEFAULT 0;`);
    }
    if (!hasCol("orders", "delivery_person_id")) {
      db.exec(`ALTER TABLE orders ADD COLUMN delivery_person_id INTEGER;`);
    }
    if (!hasCol("orders", "delivery_person_name")) {
      db.exec(`ALTER TABLE orders ADD COLUMN delivery_person_name TEXT;`);
    }
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_orders_delivery_person ON orders(delivery_person_id);`
    );
  },
};
