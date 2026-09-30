import type Database from "better-sqlite3";

// Migration 027 — مفتاح إيقاف المزامنة.
//
// السياق: المالك اللي مش عايز يبعت بياناته للويب كان بيغيّر **رابط السيرفر**
// عشان يوقّف الإرسال. وده كان بيسرّب المفتاح السري: `X-Secret-Key` بيتبعت في
// هيدر لأي رابط يتكتب في الخانة. الصح مفتاح صريح للنية دي.
//
// ⚠️ `DEFAULT 1` مش تفصيلة — فيه محلات شغّالة دلوقتي على بياناتها. الافتراضي
// `1` معناه إن كل قاعدة موجودة بتاخد «المزامنة شغّالة» تلقائي، فالترقية
// مابتغيّرش سلوك أي محل. `DEFAULT 0` كان هيوقّف المزامنة عند الكل في صمت.
//
// إضافة بحتة بحارس — صفر مساس بأي بيانات موجودة، ومفيش DROP ولا تحويل.
export const migration_027 = {
  version: 27,
  name: "sync_toggle",
  up: (db: Database.Database) => {
    const cols = db.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "sync_enabled")) {
      db.exec("ALTER TABLE settings ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 1;");
    }
  },
};
