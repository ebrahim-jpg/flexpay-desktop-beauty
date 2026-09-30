import type Database from "better-sqlite3";

// Migration 021 — يوم محاسبي لطلبات المتجر (للفلترة اليومية + الأرشيف).
// ⚠️ إضافي بحت: عمود واحد على online_orders (محلي). الطلبات القديمة قيمتها NULL
//    (هتظهر طالما لسه 'new'، وإلا تتعامل كأرشيف). اليوم بيتحسب وقت الإدخال بـ
//    business_day_start من الإعدادات — مش منتصف الليل.
export const migration_021 = {
  version: 21,
  name: "online_orders_business_date",
  up: (db: Database.Database) => {
    const cols = db
      .prepare("PRAGMA table_info(online_orders)")
      .all() as { name: string }[];
    if (!cols.some((c) => c.name === "business_date")) {
      db.exec(`ALTER TABLE online_orders ADD COLUMN business_date TEXT;`);
    }
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_online_orders_bizdate ON online_orders(business_date);`
    );
  },
};
