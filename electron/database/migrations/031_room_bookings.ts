import type Database from "better-sqlite3";

// Migration 031 — حجوزات الغرف الجايّة من الويب (الحجز الأونلاين). **إضافة بس.**
//
// ⚠️ الجدول ده **محلي بحت زي `online_orders`**: الاتجاه ويب→ديسكتوب عبر قناة السحب،
// ومفيش أي `sync_queue`. الرفع العكسي بعلمين بس: `web_acked` (وصلني) و`status_synced`
// (قرار الموظف اترفع). أي محاولة تحطّه في طابور المزامنة الصادرة هتكرّر الحجز.
//
// ⚠️ **الحجز مش جلسة ومش فلوس**: مفيش أي مبلغ بيتسجّل هنا. لما الموظف يحوّله لجلسة،
// الجلسة هي اللي بتعمل الفاتورة عند الحساب — الفاتورة تفضل الحدث المالي الوحيد.
//
// `room_id` بيفضل NULL لو الغرفة اتشالت بعد الحجز، و`room_name` لقطة بتفضل صحيحة.
export const migration_031 = {
  version: 31,
  name: "room_bookings",
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS room_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        room_id INTEGER REFERENCES gaming_rooms(id),
        room_desktop_id INTEGER NOT NULL,
        room_name TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'single',
        starts_at TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        business_date TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT NOT NULL DEFAULT '',
        notes TEXT,
        price_estimate REAL NOT NULL DEFAULT 0,
        confirm_note TEXT,
        session_id INTEGER REFERENCES gaming_sessions(id),
        decided_by INTEGER,
        decided_by_name TEXT,
        decided_at TEXT,
        decision_reason TEXT,
        web_created_at TEXT,
        pulled_at TEXT NOT NULL,
        web_acked INTEGER NOT NULL DEFAULT 0,
        status_synced INTEGER NOT NULL DEFAULT 1,
        alerted INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_room_bookings_start ON room_bookings(starts_at);
      CREATE INDEX IF NOT EXISTS idx_room_bookings_status ON room_bookings(status);
      CREATE INDEX IF NOT EXISTS idx_room_bookings_room ON room_bookings(room_id, starts_at);
      CREATE INDEX IF NOT EXISTS idx_room_bookings_biz ON room_bookings(business_date);
    `);

    // الجلسة اللي اتفتحت من حجز — عشان نعرف بعدين «الجلسة دي جت من حجز أونلاين»
    const cols = (db.prepare("PRAGMA table_info(gaming_sessions)").all() as { name: string }[]).map(
      (c) => c.name
    );
    if (!cols.includes("booking_local_id")) {
      db.exec("ALTER TABLE gaming_sessions ADD COLUMN booking_local_id TEXT;");
    }

    // التنبيه قبل ميعاد الحجز (دقيقة) — **بيتكتب من رد السحب** مش من واجهة الإعدادات:
    // صاحب المحل بيحدده من لوحة الويب عشان الزبون والموظف يشوفوا نفس القاعدة.
    const sCols = (db.prepare("PRAGMA table_info(settings)").all() as { name: string }[]).map(
      (c) => c.name
    );
    if (!sCols.includes("booking_alert_minutes")) {
      db.exec("ALTER TABLE settings ADD COLUMN booking_alert_minutes INTEGER NOT NULL DEFAULT 60;");
    }
  },
};
