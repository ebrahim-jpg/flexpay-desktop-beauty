import type Database from "better-sqlite3";

// Migration 026 — إلغاء طلبات المتجر يوصل للويب.
//
// الباج: `cancel()` كانت بتغيّر الحالة محلياً بس **من غير ما تعلّم حاجة للرفع**،
// و`pendingCompletions()` بتشترط `desktop_order_id IS NOT NULL` واللي اتلغى عمره
// ماياخد واحد → الإلغاء عمره ما وصل للويب. والأسوأ: لما الكاشير يضرب طلب متجر
// وبعدين يلغي الفاتورة، الزبون كان بيفضل شايف «اتسلّم 🎉» للأبد.
//
//  • cancel_reason  — سبب رفض الكاشير (بيظهر لصاحب المحل في الويب)
//  • cancel_synced  — علم الرفع، نفس نمط web_acked و completion_synced
//
// كله إضافي (ADD COLUMN بحارس) — صفر مساس بأي بيانات موجودة. و`DEFAULT 0` آمن
// لأن مفيش ولا صف `cancelled` في أي قاعدة بيانات: مكانش فيه UI بينده الإلغاء أصلاً.
export const migration_026 = {
  version: 26,
  name: "online_order_cancel",
  up: (db: Database.Database) => {
    const cols = db.prepare("PRAGMA table_info(online_orders)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "cancel_reason")) {
      db.exec("ALTER TABLE online_orders ADD COLUMN cancel_reason TEXT;");
    }
    if (!cols.some((c) => c.name === "cancel_synced")) {
      db.exec("ALTER TABLE online_orders ADD COLUMN cancel_synced INTEGER NOT NULL DEFAULT 0;");
    }
  },
};
