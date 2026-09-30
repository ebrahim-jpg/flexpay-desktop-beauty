import type Database from "better-sqlite3";

// Migration 035 — أحجام المنتج (`product_variants`) + وصفة لكل حجم + خصم الإضافات.
//
// ===== القرار المعماري =====
// الحجم (سمول/ميديم/لارج) **فاريانت**: ليه سعره ووصفته. لكن **المخزون يفضل في المواد
// والوصفات** (`stockModel = ingredient`) — عكس الملابس اللي نقلت الرصيد على الفاريانت.
// فالفاريانت هنا محور **سعر ووصفة**، مش وحدة رصيد → مفيش عمود `stock_qty` خالص.
//
// ليه ده لازم أصلاً: الأساس كان بيحسب `unit_price = product.price + Σ price_adjustment`،
// يعني الخيارات **بتزوّد** السعر. الحجم **بديل** سعر، فبيتزا سعرها الأساسي = سعر السمول
// كانت بتاخد زيادة تاني لما الكاشير يختار سمول. والوصفة كانت أصعب: `deductForOrder`
// بتجيب `product_recipes WHERE product_id = ?` بس → تلات وصفات لتلات أحجام على نفس
// المنتج = **التلاتة يتخصموا مع كل بيعة**.
//
// ===== إضافة بس =====
// `CREATE TABLE IF NOT EXISTS` + `ALTER ADD COLUMN` بحارس على السكيما الفعلية.
// **مفيش أي إعادة بناء جدول** — عكس 027 بتاعة الملابس اللي اضطرت تعيد بناء
// `stocktake_items` و`purchase_invoice_items` لأن الرصيد نقل للفاريانت. عندنا الجرد
// والتوريد على `inventory_items` زي ما هم بالحرف.
export const migration_035 = {
  version: 35,
  name: "product_sizes",
  up: (db: Database.Database) => {
    // ===== الأحجام =====
    // `price_override` بنفس اسم عمود الملابس عن قصد: الويب بيستقبل الفاريانت جوّه
    // payload المنتج بنفس أسماء الحقول (عقد المزامنة §5.4)، فأي اسم تاني = حقل
    // مش معروف و Mongoose strict بيرميه **بصمت**.
    // `NULL` = يورث سعر المنتج (مسموح، بس الواجهة بتطلب سعر لكل حجم).
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id       TEXT UNIQUE NOT NULL,
        product_id     INTEGER NOT NULL REFERENCES products(id),
        size           TEXT NOT NULL,
        sort_order     INTEGER DEFAULT 0,
        price_override REAL,
        cost_price     REAL DEFAULT 0,
        is_active      INTEGER DEFAULT 1,
        created_by     INTEGER,
        updated_by     INTEGER,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status    TEXT DEFAULT 'pending',
        synced_at      DATETIME,
        is_deleted     INTEGER DEFAULT 0,
        deleted_by     INTEGER,
        deleted_at     DATETIME
      );
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_size
      ON product_variants(product_id, size) WHERE is_deleted = 0;
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_variants_product
      ON product_variants(product_id, is_deleted);
    `);

    // ===== وصفة لكل حجم =====
    // `variant_id IS NULL` = **مشترك لكل الأحجام** (الكرتونة والمناديل بيتحطوا مرة واحدة).
    // والمنتج اللي مالوش أحجام كل وصفته مشتركة → **نفس سلوك الأساس بالحرف**.
    addColumn(db, "product_recipes", "variant_id", "INTEGER");
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_recipes_variant
      ON product_recipes(variant_id, is_deleted);
    `);

    // ===== «المنتج ده بالأحجام» — نية صريحة مش عدّ مشتق =====
    // الملابس اتلغبطت في ده: حارسها الأول كان بيسأل «المنتج عنده مقاسات فعّالة؟»،
    // فمنتج كل مقاساته موقوفة كان العدّ بيطلع صفر والحارس يعدّي → بيعة بلا مقاس بصمت.
    // العلم بيتحط أول ما يتحفظ حجم، ومايتشالش غير بحذف الأحجام كلها صراحةً.
    addColumn(db, "products", "has_sizes", "INTEGER DEFAULT 0");

    // ===== لقطة الحجم على بند الفاتورة =====
    // `variant_cost_price` = تكلفة **البند كله** لحظة البيع (وصفة الحجم + المشترك +
    // الإضافات اللي بتخصم مواد). الويب بيقراها كتكلفة البند وبتستبدل تكلفة المنتج
    // في الـCOGS — نفس اللي بتعمله الملابس والموبايل.
    addColumn(db, "order_items", "variant_id", "INTEGER");
    addColumn(db, "order_items", "variant_size", "TEXT");
    addColumn(db, "order_items", "variant_cost_price", "REAL");

    // ===== بنود الحساب المفتوح (الصالة) =====
    // من غير ده سمول ولارج على نفس الطاولة بيتلمّوا في بند واحد (مفتاح التجميع
    // كان product_id + modifier_option_ids + notes).
    addColumn(db, "gaming_session_items", "variant_id", "INTEGER");
  },
};

// إضافة عمود بأمان — الحارس على السكيما الفعلية مش على افتراض
function addColumn(db: Database.Database, table: string, column: string, def: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
}
