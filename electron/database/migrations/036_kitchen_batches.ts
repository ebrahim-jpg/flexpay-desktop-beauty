import type Database from "better-sqlite3";

// Migration 036 — تذكرة التجهيز **بالدفعة** بدل ورقة لكل صنف.
//
// ===== المشكلة اللي بيحلّها =====
// كان كل صنف بيتضاف لطاولة بيطبع ورقة تجهيز لوحده — طاولة واخدة ١٠ أصناف =
// **١٠ ورقات**. والحل مش «الصنف المضاف» ولا «الأوردر كله» (اللي كان بيطبع اللي
// المطبخ عمله خلاص تاني): هو **الدفعة** — الأصناف اللي لسه ماراحتش للمطبخ.
//
// ===== ليه كمية مش علم بوليان =====
// النادل ممكن يزوّد كمية صنف **بعد** ما راح للمطبخ (بيتزا ١ راحت، بقت ٢). قرار
// المالك إن التذكرة الجديدة تطبع **الفرق بس** («بيتزا ×١») عشان المطبخ مايعيدش
// اللي عمله. علم `sent` بوليان مايعرفش يقول «راح ١ من ٢» — فالعمود كمية.
//
// ⚠️ **إضافة بس** (`ALTER TABLE ADD COLUMN` بحارس على السكيما الفعلية)، والقيم
// الافتراضية بتخلّي كل البيانات القديمة «راحت للمطبخ = صفر» — يعني أول «أرسل
// للمطبخ» على حساب مفتوح قديم بيطبع أصنافه كلها، وده الصح.
export const migration_036 = {
  version: 36,
  name: "kitchen_batches",
  up: (db: Database.Database) => {
    // الكمية اللي راحت للمطبخ من البند. المعلّق = quantity - sent_qty.
    addColumn(db, "gaming_session_items", "sent_qty", "REAL NOT NULL DEFAULT 0");

    // عدّاد الدفعات على الحساب — التذكرة بتقول «دفعة ٢» فالمطبخ يعرف إن دي
    // تانية لنفس الطاولة، مش أوردر جديد بيتكرّر.
    addColumn(db, "gaming_sessions", "kitchen_batches", "INTEGER NOT NULL DEFAULT 0");

    // إمتى اتطبعت تذكرة تجهيز طلب المتجر.
    // ⚠️ بيمنع **ورقتين لنفس الأكل**: الطلب اللي اتطبع من صفحة طلبات المتجر كان
    // الكاشير بيطبع له تذكرة تانية عند الحساب (لأنه بيطبع لكل بيعة).
    addColumn(db, "online_orders", "ticket_printed_at", "TEXT");
  },
};

// إضافة عمود بأمان — الحارس على السكيما الفعلية مش على افتراض
function addColumn(db: Database.Database, table: string, column: string, def: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
}
