import type Database from "better-sqlite3";

// Migration 032 — الطاولات («بلايستيشن + كافيه»). **إضافة بس** — صفر مساس بأي عمود موجود.
//
// الطاولة = نفس كيان الغرفة بنوع `table` (مش جدول جديد): الحساب المفتوح والبنود والفاتورة
// والمزامنة والحجز كلهم بيتعاد استخدامهم. الفرق إن الطاولة **مالهاش سعر وقت** — حسابها طلبات بس،
// وبيتقفل بفاتورة `source = 'table_session'`.
//
//   • gaming_rooms.kind / area          — room | table + منطقة الطاولة (نص حر). القديم كله room.
//   • gaming_sessions.kind              — لقطة نوع المكان وقت الفتح (التقارير مابتعملش join).
//   • gaming_sessions.merged_into_id    — دمج طاولتين: الحساب ده اتنقل للحساب ده (status = 'merged').
//   • room_bookings.kind / party_size   — حجز طاولة: ميعاد + عدد أفراد، والطاولة بتتحدد وقت التأكيد.
//   • orders.session_id                 — الحساب اللي الفاتورة طلعت منه. **لازم** لأن تقسيم الفاتورة
//                                         بيطلّع أكتر من فاتورة للحساب الواحد (session.order_id بيشيل واحدة).
//
// ⚠️ ختم المجال: migration 028 حطّت `DEFAULT 'gaming'` على العمود ومينفعش يتعدّل. والـseed بيعمل صف
// الإعدادات **بعد** الـmigrations، فـUPDATE لوحده مابيلمسش قاعدة جديدة → trigger بعد الإدخال.
// من غير الختم ده نسخة احتياطية من البرنامج ده كانت هتترستور جوّه البلايستيشن (والعكس).
export const migration_032 = {
  version: 32,
  name: "tables",
  up: (db: Database.Database) => {
    const colsOf = (t: string) =>
      (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);

    const rooms = colsOf("gaming_rooms");
    if (!rooms.includes("kind")) db.exec("ALTER TABLE gaming_rooms ADD COLUMN kind TEXT NOT NULL DEFAULT 'room';");
    if (!rooms.includes("area")) db.exec("ALTER TABLE gaming_rooms ADD COLUMN area TEXT;");

    const sessions = colsOf("gaming_sessions");
    if (!sessions.includes("kind")) db.exec("ALTER TABLE gaming_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'room';");
    if (!sessions.includes("merged_into_id")) {
      db.exec("ALTER TABLE gaming_sessions ADD COLUMN merged_into_id INTEGER REFERENCES gaming_sessions(id);");
    }

    const bookings = colsOf("room_bookings");
    if (!bookings.includes("kind")) db.exec("ALTER TABLE room_bookings ADD COLUMN kind TEXT NOT NULL DEFAULT 'room';");
    if (!bookings.includes("party_size")) db.exec("ALTER TABLE room_bookings ADD COLUMN party_size INTEGER;");

    const orders = colsOf("orders");
    if (!orders.includes("session_id")) {
      db.exec("ALTER TABLE orders ADD COLUMN session_id INTEGER REFERENCES gaming_sessions(id);");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_gaming_rooms_kind ON gaming_rooms(kind);");

    // ختم المجال: الصف الموجود + أي صف الـseed هيعمله بعدين
    db.prepare("UPDATE settings SET vertical = 'gaming_cafe'").run();
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_settings_vertical_gaming_cafe
      AFTER INSERT ON settings
      BEGIN
        UPDATE settings SET vertical = 'gaming_cafe' WHERE id = NEW.id;
      END;
    `);
  },
};
