import { BaseRepository } from "./base.repository";
import { assertNonNegative } from "../../shared/validation";
import type { SizeDTO, SaveSizesInput } from "../../shared/sizes";

interface SizeRow {
  id: number;
  local_id: string;
  product_id: number;
  size: string;
  sort_order: number;
  price_override: number | null;
  cost_price: number;
  is_active: number;
}

/**
 * أحجام المنتج — **محور سعر ووصفة، مش وحدة مخزون**.
 *
 * الفرق عن نسخة الملابس (`variants.repository`): هناك الرصيد عايش على الفاريانت،
 * فكان فيه `stock_qty` وحركات وجرد بالمقاس. هنا الرصيد فاضل في المواد عبر الوصفات،
 * فالحجم بيحمل **سعره وتكلفة وصفته** بس.
 *
 * ⚠️ المزامنة: الأحجام بتتبعت **جوّه payload المنتج** (مالهاش `entity_type` لوحدها —
 * نفس عُرف §5.4)، ولازم **المصفوفة كاملة** في كل مرة: `$set` على الويب بيستبدل
 * المصفوفة، فمصفوفة ناقصة = حذف صامت للباقي.
 */
export class SizesRepository extends BaseRepository {
  private margin(price: number, cost: number): number {
    if (!price || price <= 0) return 0;
    return Math.round(((price - cost) / price) * 100);
  }

  private toDTO(
    r: SizeRow,
    productName: string,
    productPrice: number,
    hasRecipe: boolean
  ): SizeDTO {
    const price = r.price_override ?? productPrice;
    return {
      id: r.id,
      local_id: r.local_id,
      product_id: r.product_id,
      product_name: productName,
      size: r.size,
      sort_order: r.sort_order,
      price_override: r.price_override,
      price,
      cost_price: r.cost_price,
      profit_margin: this.margin(price, r.cost_price),
      is_active: r.is_active === 1,
      has_recipe: hasRecipe,
    };
  }

  // ===== قراءة =====
  /** أحجام منتج بالترتيب — الموقوفة كمان (الواجهة هي اللي تفلتر) */
  getByProduct(productId: number): SizeDTO[] {
    const p = this.db
      .prepare("SELECT name, price FROM products WHERE id = ?")
      .get(productId) as { name: string; price: number } | undefined;
    if (!p) return [];
    const rows = this.db
      .prepare(
        `SELECT id, local_id, product_id, size, sort_order, price_override, cost_price, is_active
         FROM product_variants WHERE product_id = ? AND is_deleted = 0
         ORDER BY sort_order ASC, id ASC`
      )
      .all(productId) as SizeRow[];
    const withRecipe = new Set(
      (
        this.db
          .prepare(
            `SELECT DISTINCT variant_id FROM product_recipes
              WHERE product_id = ? AND variant_id IS NOT NULL AND is_deleted = 0`
          )
          .all(productId) as { variant_id: number }[]
      ).map((r) => r.variant_id)
    );
    return rows.map((r) => this.toDTO(r, p.name, p.price, withRecipe.has(r.id)));
  }

  getById(id: number): SizeDTO | null {
    const row = this.db
      .prepare(
        `SELECT id, local_id, product_id, size, sort_order, price_override, cost_price, is_active
         FROM product_variants WHERE id = ? AND is_deleted = 0`
      )
      .get(id) as SizeRow | undefined;
    if (!row) return null;
    const p = this.db
      .prepare("SELECT name, price FROM products WHERE id = ?")
      .get(row.product_id) as { name: string; price: number } | undefined;
    const hasRecipe =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) c FROM product_recipes WHERE variant_id = ? AND is_deleted = 0"
          )
          .get(id) as { c: number }
      ).c > 0;
    return this.toDTO(row, p?.name ?? "", p?.price ?? 0, hasRecipe);
  }

  /** عدد الأحجام الفعّالة — الحارس في البيع بيفرّق بين «مفيش أحجام» و«كلها موقوفة» */
  activeCount(productId: number): number {
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) c FROM product_variants
            WHERE product_id = ? AND is_active = 1 AND is_deleted = 0`
        )
        .get(productId) as { c: number }
    ).c;
  }

  // ===== كتابة =====
  /**
   * حفظ مصفوفة أحجام منتج: اللي مالوش `id` يتعمل، اللي ليه يتحدّث، واللي مش في
   * المصفوفة يتشال (soft delete). وبعدها التكاليف والسعر الأساسي بيتزبطوا.
   */
  save(input: SaveSizesInput, actorId: number | null): SizeDTO[] {
    const { product_id, sizes } = input;
    const product = this.db
      .prepare("SELECT id FROM products WHERE id = ? AND is_deleted = 0")
      .get(product_id) as { id: number } | undefined;
    if (!product) throw new Error("المنتج غير موجود");

    // حراسة قبل أي كتابة: اسم لكل حجم، ومفيش تكرار، والسعر مش سالب
    const seen = new Set<string>();
    for (const s of sizes) {
      const name = (s.size ?? "").trim();
      if (!name) throw new Error("كل حجم لازم يكون له اسم");
      const key = name.toLocaleLowerCase("ar");
      if (seen.has(key)) throw new Error(`الحجم «${name}» مكرر`);
      seen.add(key);
      if (s.price_override != null) assertNonNegative(s.price_override, `سعر ${name}`);
    }

    return this.transaction(() => {
      const now = this.now();
      const keep = new Set<number>();

      sizes.forEach((s, i) => {
        const name = s.size.trim();
        const sort = s.sort_order ?? i;
        const active = s.is_active === false ? 0 : 1;
        if (s.id) {
          this.db
            .prepare(
              `UPDATE product_variants
                 SET size = @size, sort_order = @sort, price_override = @price,
                     is_active = @active, updated_at = @now, updated_by = @actor,
                     sync_status = 'pending'
               WHERE id = @id AND product_id = @pid`
            )
            .run({
              id: s.id,
              pid: product_id,
              size: name,
              sort,
              price: s.price_override ?? null,
              active,
              now,
              actor: actorId,
            });
          keep.add(s.id);
        } else {
          const info = this.db
            .prepare(
              `INSERT INTO product_variants
                 (local_id, product_id, size, sort_order, price_override, cost_price,
                  is_active, created_by, updated_by, created_at, updated_at, sync_status)
               VALUES (@local_id, @pid, @size, @sort, @price, 0, @active, @actor, @actor, @now, @now, 'pending')`
            )
            .run({
              local_id: this.newLocalId(),
              pid: product_id,
              size: name,
              sort,
              price: s.price_override ?? null,
              active,
              actor: actorId,
              now,
            });
          keep.add(Number(info.lastInsertRowid));
        }
      });

      // اللي اختفى من المصفوفة يتشال — ووصفته الخاصة تتشال معاه (وإلا بتبقى يتيمة
      // وبتتخصم على أوردرات حجم مش موجود)
      const existing = this.db
        .prepare("SELECT id FROM product_variants WHERE product_id = ? AND is_deleted = 0")
        .all(product_id) as { id: number }[];
      for (const { id } of existing) {
        if (keep.has(id)) continue;
        this.db
          .prepare(
            `UPDATE product_variants SET is_deleted = 1, deleted_by = @actor, deleted_at = @now,
               updated_at = @now, sync_status = 'pending' WHERE id = @id`
          )
          .run({ id, actor: actorId, now });
        this.db
          .prepare(
            `UPDATE product_recipes SET is_deleted = 1, deleted_by = @actor, deleted_at = @now,
               sync_status = 'pending' WHERE variant_id = @id AND is_deleted = 0`
          )
          .run({ id, actor: actorId, now });
      }

      this.recomputeAllCosts(product_id, actorId);
      this.syncProductBase(product_id, actorId);
      return this.getByProduct(product_id);
    });
  }

  /**
   * تكلفة حجم = وصفته الخاصة + **الوصفة المشتركة** (`variant_id IS NULL`).
   * الكرتونة والمناديل بيتحطوا مرة واحدة في المشترك وبيتحسبوا على كل حجم.
   */
  recomputeCost(variantId: number, actorId: number | null): number {
    const row = this.db
      .prepare("SELECT product_id FROM product_variants WHERE id = ?")
      .get(variantId) as { product_id: number } | undefined;
    if (!row) return 0;
    const cost = this.effectiveRecipeCost(row.product_id, variantId);
    this.db
      .prepare(
        `UPDATE product_variants SET cost_price = @cost, updated_at = @now, updated_by = @actor,
           sync_status = 'pending' WHERE id = @id`
      )
      .run({ id: variantId, cost, now: this.now(), actor: actorId });
    return cost;
  }

  recomputeAllCosts(productId: number, actorId: number | null): void {
    const ids = this.db
      .prepare("SELECT id FROM product_variants WHERE product_id = ? AND is_deleted = 0")
      .all(productId) as { id: number }[];
    for (const { id } of ids) this.recomputeCost(id, actorId);
  }

  /** تكلفة الوصفة الفعّالة لحجم (المشترك + الخاص). `variantId = null` = المشترك بس */
  effectiveRecipeCost(productId: number, variantId: number | null): number {
    const scope = variantId == null ? "" : "OR pr.variant_id = @vid";
    const rows = this.db
      .prepare(
        `SELECT pr.standard_qty AS qty, COALESCE(inv.cost_per_unit, 0) AS cpu
           FROM product_recipes pr
           LEFT JOIN inventory_items inv ON inv.id = pr.inventory_item_id AND inv.is_deleted = 0
          WHERE pr.product_id = @pid AND pr.is_deleted = 0
            AND (pr.variant_id IS NULL ${scope})`
      )
      .all({ pid: productId, ...(variantId == null ? {} : { vid: variantId }) }) as {
      qty: number;
      cpu: number;
    }[];
    return rows.reduce((s, r) => s + r.qty * r.cpu, 0);
  }

  /**
   * السعر الأساسي للمنتج اللي له أحجام **بيتحسب لوحده = أرخص حجم فعّال**، وكذلك تكلفته.
   *
   * ليه بنسيب رقم في `products.price` أصلاً: العمود `NOT NULL` وكل الفواتير والتقارير
   * القديمة والويب بيقروه. تفريغه كان معناه migration خطر على قواعد شغّالة. والرقم ده
   * **مابيتجمعش** مع سعر الحجم — `buildLine` بيستبدله، فمفيش خطر «زيادة على السمول».
   */
  syncProductBase(productId: number, actorId: number | null): void {
    const cheapest = this.db
      .prepare(
        `SELECT price_override, cost_price FROM product_variants
          WHERE product_id = ? AND is_deleted = 0 AND is_active = 1 AND price_override IS NOT NULL
          ORDER BY price_override ASC, sort_order ASC, id ASC LIMIT 1`
      )
      .get(productId) as { price_override: number; cost_price: number } | undefined;
    const anySize =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) c FROM product_variants WHERE product_id = ? AND is_deleted = 0"
          )
          .get(productId) as { c: number }
      ).c > 0;

    const sets = [
      "has_sizes = @has",
      "updated_at = @now",
      "updated_by = @actor",
      "sync_status = 'pending'",
    ];
    const params: Record<string, unknown> = {
      id: productId,
      has: anySize ? 1 : 0,
      now: this.now(),
      actor: actorId,
    };
    if (cheapest) {
      sets.push("price = @price", "cost_price = @cost");
      params.price = cheapest.price_override;
      params.cost = cheapest.cost_price;
    }
    this.db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = @id`).run(params);
    this.enqueueProduct(productId);
  }

  /**
   * المزامنة: تحديث جزئي للمنتج بمصفوفة الأحجام **كاملة**.
   * أسماء الحقول مقصودة (`price_override`/`cost_price`) — الويب بيستقبلها بنفس
   * الأسماء في `productVariantSchema`، وأي اسم تاني Mongoose strict بيرميه بصمت.
   */
  enqueueProduct(productId: number): void {
    const p = this.db
      .prepare("SELECT id, local_id, price, cost_price, has_sizes FROM products WHERE id = ?")
      .get(productId) as
      | { id: number; local_id: string; price: number; cost_price: number; has_sizes: number }
      | undefined;
    if (!p) return;
    const variants = this.getByProduct(productId).map((v) => ({
      id: v.id,
      local_id: v.local_id,
      size: v.size,
      price_override: v.price_override,
      cost_price: v.cost_price,
      is_active: v.is_active,
    }));
    this.enqueue("product", "UPDATED", p.local_id, {
      id: p.id,
      local_id: p.local_id,
      price: p.price,
      cost_price: p.cost_price,
      has_sizes: p.has_sizes === 1,
      variants,
    });
  }
}

export const sizesRepository = new SizesRepository();
