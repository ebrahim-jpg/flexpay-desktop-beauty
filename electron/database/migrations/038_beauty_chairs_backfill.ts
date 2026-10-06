import type Database from "better-sqlite3";

// Migration 038 — تصحيح `kind` للكراسي + ختم الخدمات على البنود القديمة.
//
// ===== ① الكراسي اللي بتختفي من الشاشة =====
// 🔴 `032_tables.ts` ضاف عمود `kind` بافتراضي **`'room'`** (نسخة البلايستيشن كانت
// غرف)، و**مفيش ولا backfill**. وكل القراية في نسخة التجميل بتفلتر
// `WHERE kind = 'table'` — يعني قاعدة مترقّية من البلايستيشن أو الكافيه القديم
// بتطلع **صفر كراسي على الشاشة بلا أي رسالة خطأ**: الموظف بيفتح شاشة الكراسي
// يلاقيها فاضية ومش عارف ليه.
//
// ⚠️ **إضافة بس**: `UPDATE` على صفوف موجودة بقيمة صح — مفيش حذف ولا تغيير عمود.
//
// ===== ② البنود القديمة لازم تبقى خدمات =====
// النسخة بقت **خدمات بس** (سياسة الشركة: اللي بيبيع بضاعة بياخد نسخة البيع
// بالتجزئة). والريبو بيثبّت `is_service = 1` على أي إنشاء جديد، بس أي بند دخل
// **قبل** التعديل (أو من استيراد إكسل قديم) لسه `is_service = 0` — فبيختفي من
// شاشة الجلسة السريعة اللي بتفلتر على الخدمات بس.
export const migration_038 = {
  version: 38,
  name: "beauty_chairs_backfill",
  up: (db: Database.Database) => {
    // ① كل مكان في نسخة التجميل هو كرسي
    db.exec("UPDATE gaming_rooms SET kind = 'table' WHERE kind IS NULL OR kind <> 'table';");
    // والجلسات والحجوزات بتتبع نفس القاعدة (العمود موجود عليهم من 032)
    db.exec("UPDATE gaming_sessions SET kind = 'table' WHERE kind IS NULL OR kind <> 'table';");
    db.exec("UPDATE room_bookings SET kind = 'table' WHERE kind IS NULL OR kind <> 'table';");

    // ② أي بند قديم بقى خدمة — والسعر والتكلفة والوصفة زي ما هم بالحرف
    db.exec("UPDATE products SET is_service = 1 WHERE is_service <> 1;");
  },
};
