import { BaseRepository } from "./base.repository";
import { sizesRepository } from "./sizes.repository";
import { saveImage, readImageDataUrl, removeImage } from "../lib/images";
import { barcodeForStorage } from "../../shared/barcode";
import { assertPositive, assertNonNegative } from "../../shared/validation";
import type {
  ProductRow,
  ProductRecipeRow,
} from "../../types/database.types";
import type {
  ProductDTO,
  CreateProductInput,
  UpdateProductInput,
  ModifierGroup,
  RecipeItemDTO,
  ProductCostSummary,
  RecipeOverviewItem,
} from "../../shared/products";

type ProductJoinRow = ProductRow & { category_name: string | null };

export class ProductsRepository extends BaseRepository {
  private parseModifiers(raw: string): ModifierGroup[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as ModifierGroup[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private profitMargin(price: number, cost: number): number {
    if (!price || price <= 0) return 0;
    return Math.round(((price - cost) / price) * 100);
  }

  private toDTO(row: ProductJoinRow): ProductDTO {
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      description: row.description,
      category_id: row.category_id,
      category_name: row.category_name ?? null,
      price: row.price,
      barcode: row.barcode,
      image: readImageDataUrl(row.image_path),
      is_active: row.is_active === 1,
      is_available: row.is_available === 1,
      modifiers: this.parseModifiers(row.modifiers),
      cost_price: row.cost_price,
      profit_margin: this.profitMargin(row.price, row.cost_price),
      has_sizes: row.has_sizes === 1,
      is_service: row.is_service === 1,
      duration_minutes: row.duration_minutes ?? 0,
      sale_type: row.sale_type === "weight" ? "weight" : "piece",
    };
  }

  private readonly selectJoin = `
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
  `;

  private findRow(id: number): ProductJoinRow | null {
    const row = this.db
      .prepare(`${this.selectJoin} WHERE p.id = ? AND p.is_deleted = 0`)
      .get(id) as ProductJoinRow | undefined;
    return row ?? null;
  }

  // اسم المنتج (لسجل التدقيق) — للقراءة فقط
  getName(id: number): string {
    const row = this.db.prepare("SELECT name FROM products WHERE id = ?").get(id) as
      | { name?: string }
      | undefined;
    return row?.name ?? "منتج";
  }

  getAll(): ProductDTO[] {
    const rows = this.db
      .prepare(
        `${this.selectJoin} WHERE p.is_deleted = 0 ORDER BY p.name ASC`
      )
      .all() as ProductJoinRow[];
    return rows.map((r) => this.toDTO(r));
  }

  getByCategory(categoryId: number): ProductDTO[] {
    const rows = this.db
      .prepare(
        `${this.selectJoin} WHERE p.category_id = ? AND p.is_deleted = 0 ORDER BY p.name ASC`
      )
      .all(categoryId) as ProductJoinRow[];
    return rows.map((r) => this.toDTO(r));
  }

  getAvailable(): ProductDTO[] {
    const rows = this.db
      .prepare(
        `${this.selectJoin} WHERE p.is_deleted = 0 AND p.is_active = 1 AND p.is_available = 1 ORDER BY p.name ASC`
      )
      .all() as ProductJoinRow[];
    return rows.map((r) => this.toDTO(r));
  }

  // البحث بالباركود — يفهم الباركود المدمج (يطابق lookupCode)
  getByBarcode(rawBarcode: string): ProductDTO | null {
    const lookup = barcodeForStorage(rawBarcode);
    const row = this.db
      .prepare(
        `${this.selectJoin} WHERE p.is_deleted = 0 AND (p.barcode = ? OR p.barcode = ?) LIMIT 1`
      )
      .get(lookup, rawBarcode.trim()) as ProductJoinRow | undefined;
    return row ? this.toDTO(row) : null;
  }

  search(term: string): ProductDTO[] {
    const q = `%${term.trim()}%`;
    const rows = this.db
      .prepare(
        `${this.selectJoin}
         WHERE p.is_deleted = 0 AND (p.name LIKE ? OR p.barcode LIKE ?)
         ORDER BY p.name ASC LIMIT 100`
      )
      .all(q, q) as ProductJoinRow[];
    return rows.map((r) => this.toDTO(r));
  }

  barcodeExists(barcode: string, excludeId?: number): boolean {
    const row = this.db
      .prepare(
        "SELECT id FROM products WHERE barcode = ? AND is_deleted = 0 AND id != ?"
      )
      .get(barcode, excludeId ?? -1) as { id: number } | undefined;
    return !!row;
  }

  create(input: CreateProductInput, actorId: number | null): ProductDTO {
    assertNonNegative(input.price, "السعر"); // منتج بسعر سالب = الكاشير ياخد باقي (ثغرة)
    const localId = this.newLocalId();
    const now = this.now();
    const barcode = input.barcode ? barcodeForStorage(input.barcode) : null;

    if (barcode && this.barcodeExists(barcode)) {
      throw new Error("الباركود مستخدم لمنتج تاني");
    }

    let imagePath: string | null = null;
    if (input.imageDataUrl) {
      imagePath = saveImage(input.imageDataUrl, "products", localId);
    }

    return this.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO products (
            local_id, name, description, category_id, price, barcode, image_path,
            is_active, is_available, modifiers, cost_price, sale_type,
            is_service, duration_minutes,
            created_by, updated_by, created_at, updated_at, sync_status
          ) VALUES (
            @local_id, @name, @description, @category_id, @price, @barcode, @image_path,
            @is_active, @is_available, @modifiers, 0, @sale_type,
            @is_service, @duration_minutes,
            @actor, @actor, @now, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          name: input.name,
          description: input.description ?? null,
          category_id: input.category_id ?? null,
          price: input.price,
          barcode,
          image_path: imagePath,
          is_active: input.is_active === false ? 0 : 1,
          is_available: input.is_available === false ? 0 : 1,
          modifiers: JSON.stringify(input.modifiers ?? []),
          // نسخة التجميل: المنتجات بالقطعة بس (الكيلو للخامات في المخزون مش للبيع)
          sale_type: "piece",
          // 🔴 **خدمات بس.** متثبّت على ١ مهما بعتت الواجهة أو الاستيراد.
          // ده قرار تسعير: اللي عايز يبيع كريمات وبضاعة بياخد نسخة البيع بالتجزئة.
          // والقفل هنا مش في الواجهة، لأن فيه تلات أبواب تانية بتوصل للريبو:
          // استيراد الإكسل (كان مابيبعتش `is_service` خالص) والـseed وسكربت الـsmoke.
          is_service: 1,
          duration_minutes: Math.max(0, Math.floor(input.duration_minutes ?? 0)),
          actor: actorId,
          now,
        });

      const created = this.findRow(Number(result.lastInsertRowid))!;
      this.enqueue("product", "CREATED", localId, this.toSyncPayload(created));
      return this.toDTO(created);
    });
  }

  update(input: UpdateProductInput, actorId: number | null): ProductDTO {
    const existing = this.findRow(input.id);
    if (!existing) throw new Error("المنتج غير موجود");

    const fields: string[] = ["updated_at = @now", "updated_by = @actor", "sync_status = 'pending'"];
    const params: Record<string, unknown> = {
      id: input.id,
      now: this.now(),
      actor: actorId,
    };

    if (input.name !== undefined) {
      fields.push("name = @name");
      params.name = input.name;
    }
    if (input.description !== undefined) {
      fields.push("description = @description");
      params.description = input.description;
    }
    if (input.category_id !== undefined) {
      fields.push("category_id = @category_id");
      params.category_id = input.category_id;
    }
    if (input.is_service !== undefined) {
      fields.push("is_service = @is_service");
      params.is_service = 1; // 🔴 خدمات بس — حتى لو اتبعت false من أي مكان
    }
    if (input.duration_minutes !== undefined) {
      fields.push("duration_minutes = @duration_minutes");
      params.duration_minutes = Math.max(0, Math.floor(input.duration_minutes));
    }
    if (input.price !== undefined) {
      assertNonNegative(input.price, "السعر");
      fields.push("price = @price");
      params.price = input.price;
    }
    if (input.barcode !== undefined) {
      const barcode = input.barcode ? barcodeForStorage(input.barcode) : null;
      if (barcode && this.barcodeExists(barcode, input.id)) {
        throw new Error("الباركود مستخدم لمنتج تاني");
      }
      fields.push("barcode = @barcode");
      params.barcode = barcode;
    }
    if (input.modifiers !== undefined) {
      fields.push("modifiers = @modifiers");
      params.modifiers = JSON.stringify(input.modifiers);
    }
    if (input.is_active !== undefined) {
      fields.push("is_active = @is_active");
      params.is_active = input.is_active ? 1 : 0;
    }
    if (input.is_available !== undefined) {
      fields.push("is_available = @is_available");
      params.is_available = input.is_available ? 1 : 0;
    }
    if (input.sale_type !== undefined) {
      fields.push("sale_type = @sale_type");
      params.sale_type = "piece"; // بالقطعة بس — حتى لو اتبعت «weight» من أي مكان
    }

    // الصورة
    if (input.removeImage) {
      removeImage(existing.image_path);
      fields.push("image_path = @image_path");
      params.image_path = null;
    } else if (input.imageDataUrl) {
      const imagePath = saveImage(input.imageDataUrl, "products", existing.local_id);
      fields.push("image_path = @image_path");
      params.image_path = imagePath;
    }

    return this.transaction(() => {
      this.db
        .prepare(`UPDATE products SET ${fields.join(", ")} WHERE id = @id`)
        .run(params);
      const updated = this.findRow(input.id)!;
      this.enqueue("product", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return this.toDTO(updated);
    });
  }

  toggleAvailability(id: number, available: boolean, actorId: number | null): ProductDTO {
    const existing = this.findRow(id);
    if (!existing) throw new Error("المنتج غير موجود");
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE products SET is_available = @av, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, av: available ? 1 : 0, now: this.now(), actor: actorId });
      const updated = this.findRow(id)!;
      this.enqueue("product", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return this.toDTO(updated);
    });
  }

  // شيل/رجّع المنتج من الكاشير بالكامل (is_active) — غير "متاح للبيع" (is_available اللي بتعرضه "نفد").
  // is_active=0 → الكاشير مايعرضهوش خالص، لكن المنتج يفضل في الإدارة والتاريخ.
  setActive(id: number, active: boolean, actorId: number | null): ProductDTO {
    const existing = this.findRow(id);
    if (!existing) throw new Error("المنتج غير موجود");
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE products SET is_active = @a, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, a: active ? 1 : 0, now: this.now(), actor: actorId });
      const updated = this.findRow(id)!;
      this.enqueue("product", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return this.toDTO(updated);
    });
  }

  softDelete(id: number, actorId: number | null): boolean {
    const existing = this.findRow(id);
    if (!existing) throw new Error("المنتج غير موجود");
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE products SET is_deleted = 1, deleted_by = @actor, deleted_at = @now, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, actor: actorId, now: this.now() });
      this.enqueue("product", "DELETED", existing.local_id, {
        local_id: existing.local_id,
      });
      return true;
    });
  }

  // ===== الوصفات =====
  private inventoryTableExists(): boolean {
    const row = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_items'"
      )
      .get();
    return !!row;
  }

  // تكلفة الوحدة من المخزون (0 لو جدول المخزون لسه مش موجود — PRD-04)
  private costPerUnit(inventoryItemId: number | null): number {
    if (inventoryItemId == null || !this.inventoryTableExists()) return 0;
    const row = this.db
      .prepare(
        "SELECT cost_per_unit FROM inventory_items WHERE id = ? AND is_deleted = 0"
      )
      .get(inventoryItemId) as { cost_per_unit: number } | undefined;
    return row?.cost_per_unit ?? 0;
  }

  /**
   * وصفة المنتج. `variantId` = **نطاق** الوصفة:
   *  • `undefined` → كل الصفوف (لسؤال «المنتج ده له وصفة؟» والنظرة العامة)
   *  • `null`      → **المشترك بس** (`variant_id IS NULL`) — تاب «مشترك لكل الأحجام»
   *  • رقم        → وصفة الحجم ده بس
   */
  getRecipe(productId: number, variantId?: number | null): RecipeItemDTO[] {
    const scope =
      variantId === undefined
        ? ""
        : variantId === null
          ? "AND variant_id IS NULL"
          : "AND variant_id = @vid";
    const rows = this.db
      .prepare(
        `SELECT * FROM product_recipes WHERE product_id = @pid AND is_deleted = 0 ${scope} ORDER BY id ASC`
      )
      .all({ pid: productId, ...(typeof variantId === "number" ? { vid: variantId } : {}) }) as ProductRecipeRow[];

    return rows.map((r) => {
      const cpu = this.costPerUnit(r.inventory_item_id);
      return {
        inventory_item_id: r.inventory_item_id ?? 0,
        inventory_item_name: r.inventory_item_name,
        unit: r.unit,
        standard_qty: r.standard_qty,
        cost_per_unit: cpu,
        line_cost: cpu * r.standard_qty,
      };
    });
  }

  // نظرة عامة على وصفات كل المنتجات — لتاب الوصفات في المخزون (استعلام واحد)
  getRecipesOverview(): RecipeOverviewItem[] {
    const products = this.db
      .prepare(
        `SELECT p.id, p.name, p.category_id, c.name AS category_name, p.price, p.is_active
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.is_deleted = 0 ORDER BY p.name ASC`
      )
      .all() as {
      id: number;
      name: string;
      category_id: number | null;
      category_name: string | null;
      price: number;
      is_active: number;
    }[];

    // ⚠️ **المشتركة بس** (`variant_id IS NULL`): جمع صفوف الأحجام كلها كان بيطلّع
    // تكلفة متضخّمة (وصفة السمول + الميديم + اللارج على بيعة واحدة).
    const recipeRows = this.db
      .prepare(
        `SELECT product_id, inventory_item_id, inventory_item_name, unit, standard_qty
         FROM product_recipes WHERE is_deleted = 0 AND variant_id IS NULL ORDER BY id ASC`
      )
      .all() as {
      product_id: number;
      inventory_item_id: number | null;
      inventory_item_name: string;
      unit: string;
      standard_qty: number;
    }[];

    const byProduct = new Map<
      number,
      { items: { name: string; qty: number; unit: string }[]; cost: number }
    >();
    for (const r of recipeRows) {
      const cpu = this.costPerUnit(r.inventory_item_id);
      const entry = byProduct.get(r.product_id) ?? { items: [], cost: 0 };
      entry.items.push({ name: r.inventory_item_name, qty: r.standard_qty, unit: r.unit });
      entry.cost += cpu * r.standard_qty;
      byProduct.set(r.product_id, entry);
    }

    // الأحجام بتكاليفها (محسوبة بالفعل في product_variants.cost_price = وصفتها + المشترك)
    const sizeRows = this.db
      .prepare(
        `SELECT v.product_id, v.id, v.size, v.price_override, v.cost_price,
                (SELECT COUNT(*) FROM product_recipes pr
                  WHERE pr.variant_id = v.id AND pr.is_deleted = 0) AS recipe_rows
           FROM product_variants v
          WHERE v.is_deleted = 0 AND v.is_active = 1
          ORDER BY v.sort_order ASC, v.id ASC`
      )
      .all() as {
      product_id: number;
      id: number;
      size: string;
      price_override: number | null;
      cost_price: number;
      recipe_rows: number;
    }[];
    const sizesByProduct = new Map<
      number,
      { size: string; price: number; cost: number; hasRecipe: boolean }[]
    >();
    for (const v of sizeRows) {
      const list = sizesByProduct.get(v.product_id) ?? [];
      list.push({
        size: v.size,
        price: v.price_override ?? 0,
        cost: v.cost_price,
        hasRecipe: v.recipe_rows > 0,
      });
      sizesByProduct.set(v.product_id, list);
    }

    return products.map((p) => {
      const entry = byProduct.get(p.id) ?? { items: [], cost: 0 };
      const sizes = sizesByProduct.get(p.id) ?? [];
      // المنتج بأحجام: التكلفة تكلفة أرخص حجم (نفس الحجم اللي سعره معروض)
      const cheapest = sizes.length
        ? [...sizes].sort((a, b) => a.price - b.price)[0]
        : null;
      const cost = cheapest ? cheapest.cost : entry.cost;
      const margin = p.price > 0 && cost > 0 ? ((p.price - cost) / p.price) * 100 : null;
      return {
        productId: p.id,
        productName: p.name,
        categoryId: p.category_id,
        categoryName: p.category_name,
        price: p.price,
        isActive: p.is_active === 1,
        items: entry.items,
        cost,
        margin,
        sizes,
      };
    });
  }

  /**
   * حفظ وصفة **في نطاق واحد**: المشترك (`variantId = null`) أو حجم معيّن.
   *
   * ⚠️ بيمسح ويكتب **في نطاقه بس**. لو كان بيمسح كل صفوف المنتج زي الأول، حفظ وصفة
   * اللارج كان هيمسح وصفة السمول والمشترك — وده أخطر باج ممكن في الميزة دي.
   */
  saveRecipe(
    productId: number,
    items: { inventory_item_id: number; standard_qty: number }[],
    actorId: number | null,
    variantId: number | null = null
  ): RecipeItemDTO[] {
    const product = this.findRow(productId);
    if (!product) throw new Error("المنتج غير موجود");
    // حراسة: كمية كل مكوّن لازم أكبر من صفر (سالب → البيع بيزوّد المخزون بدل ما يخصم)
    for (const it of items) assertPositive(it.standard_qty, "كمية المكوّن في الوصفة");

    return this.transaction(() => {
      // إخفاء الوصفة القديمة (Soft Delete) + إبلاغ المزامنة بالحذف
      const scope = variantId == null ? "AND variant_id IS NULL" : "AND variant_id = @vid";
      const scopeParams = variantId == null ? {} : { vid: variantId };
      const oldRows = this.db
        .prepare(
          `SELECT local_id FROM product_recipes WHERE product_id = @pid AND is_deleted = 0 ${scope}`
        )
        .all({ pid: productId, ...scopeParams }) as { local_id: string }[];
      this.db
        .prepare(
          `UPDATE product_recipes SET is_deleted = 1, deleted_by = @actor, deleted_at = @now, sync_status = 'pending'
           WHERE product_id = @pid AND is_deleted = 0 ${scope}`
        )
        .run({ pid: productId, actor: actorId, now: this.now(), ...scopeParams });
      for (const r of oldRows) {
        this.enqueue("product_recipe", "DELETED", r.local_id, { local_id: r.local_id });
      }

      const insert = this.db.prepare(
        `INSERT INTO product_recipes (
          local_id, product_id, variant_id, inventory_item_id, inventory_item_name, unit,
          standard_qty, created_by, created_at, sync_status
        ) VALUES (
          @local_id, @product_id, @variant_id, @inv_id, @inv_name, @unit, @qty, @actor, @now, 'pending'
        )`
      );

      const hasInventory = this.inventoryTableExists();
      for (const item of items) {
        let name = "مادة";
        let unit = "وحدة";
        if (hasInventory) {
          const inv = this.db
            .prepare(
              "SELECT name, unit FROM inventory_items WHERE id = ? AND is_deleted = 0"
            )
            .get(item.inventory_item_id) as
            | { name: string; unit: string }
            | undefined;
          if (inv) {
            name = inv.name;
            unit = inv.unit;
          }
        }
        const localId = this.newLocalId();
        insert.run({
          local_id: localId,
          product_id: productId,
          variant_id: variantId,
          inv_id: item.inventory_item_id,
          inv_name: name,
          unit,
          qty: item.standard_qty,
          actor: actorId,
          now: this.now(),
        });
        this.enqueue("product_recipe", "CREATED", localId, {
          local_id: localId,
          product_local_id: product.local_id,
          inventory_item_id: item.inventory_item_id,
          standard_qty: item.standard_qty,
          // نطاق الوصفة: null = مشترك لكل الأحجام. من غيره وصفات الأحجام بتتلم
          // في قايمة واحدة على الويب وتكلفتها المعروضة تبقى مجموعهم.
          variant_id: variantId,
          variant_size: variantId ? (sizesRepository.getById(variantId)?.size ?? null) : null,
        });
      }

      // إعادة حساب التكلفة: كل حجم (لأن المشترك بيدخل في تكلفة كلهم) + المنتج
      this.recomputeCost(productId, actorId);
      return this.getRecipe(productId, variantId);
    });
  }

  /**
   * تحديد تكلفة الشراء يدويًا (من استيراد إكسل مثلاً).
   *
   * ⚠️ **دالة مستقلة عن `update()` عن قصد.** `update()` مسار مستخدم في مودال
   * المنتج على محلات شغّالة، والإضافة عليه لمس للمسار الساخن بلا داعي.
   *
   * ⚠️ **بترفض المنتج اللي له وصفة**: تكلفته محسوبة من مواد المخزون عبر
   * `recomputeCost`، فتحديدها يدويًا هيتمسح أول ما الوصفة تتغيّر — وصاحب المحل
   * هيشوف رقم بيرجع لوحده ومش فاهم ليه. بترجّع `false` والمستورد بيقول السبب.
   */
  setCostPrice(productId: number, cost: number, actorId: number | null): boolean {
    assertNonNegative(cost, "التكلفة");
    const hasRecipe =
      (
        this.db
          .prepare("SELECT COUNT(*) c FROM product_recipes WHERE product_id = ? AND is_deleted = 0")
          .get(productId) as { c: number }
      ).c > 0;
    if (hasRecipe) return false;

    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE products SET cost_price = @cost, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id: productId, cost, now: this.now(), actor: actorId });
      const updated = this.findRow(productId);
      if (!updated) return false;
      this.enqueue("product", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return true;
    });
  }

  /**
   * حساب التكلفة وحفظها.
   *
   * المنتج اللي له أحجام: كل حجم تكلفته = وصفته + المشترك، وتكلفة **المنتج** =
   * تكلفة أرخص حجم (مطابِقة لسعره الأساسي = سعر أرخص حجم). من غير ده كان جمع
   * وصفات الأحجام كلها في رقم واحد = تكلفة متضخّمة وهامش مغلوط.
   */
  recomputeCost(productId: number, actorId: number | null): number {
    const hasSizes =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) c FROM product_variants WHERE product_id = ? AND is_deleted = 0"
          )
          .get(productId) as { c: number }
      ).c > 0;
    if (hasSizes) {
      sizesRepository.recomputeAllCosts(productId, actorId);
      sizesRepository.syncProductBase(productId, actorId);
      return (
        (
          this.db.prepare("SELECT cost_price FROM products WHERE id = ?").get(productId) as
            | { cost_price: number }
            | undefined
        )?.cost_price ?? 0
      );
    }
    const recipe = this.getRecipe(productId);
    const cost = recipe.reduce((sum, r) => sum + r.line_cost, 0);
    this.db
      .prepare(
        `UPDATE products SET cost_price = @cost, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id`
      )
      .run({ id: productId, cost, now: this.now(), actor: actorId });
    // تغيّر التكلفة بيتزامن (للتحليل على الويب)
    const local = this.db
      .prepare("SELECT local_id FROM products WHERE id = ?")
      .get(productId) as { local_id: string } | undefined;
    if (local) {
      this.enqueue("product", "UPDATED", local.local_id, {
        local_id: local.local_id,
        cost_price: cost,
      });
    }
    return cost;
  }

  calculateCost(productId: number): ProductCostSummary {
    const product = this.findRow(productId);
    if (!product) throw new Error("المنتج غير موجود");
    const recipe = this.getRecipe(productId);
    const cost = recipe.reduce((sum, r) => sum + r.line_cost, 0);
    return {
      cost,
      price: product.price,
      profit_margin: this.profitMargin(product.price, cost),
    };
  }

  private toSyncPayload(row: ProductJoinRow) {
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      description: row.description,
      category_id: row.category_id,
      price: row.price,
      barcode: row.barcode,
      is_active: row.is_active === 1,
      is_available: row.is_available === 1,
      modifiers: this.parseModifiers(row.modifiers),
      cost_price: row.cost_price,
      sale_type: row.sale_type,
      // ⚠️ المطعم مابيبعتش دي — لازم يتعرّفوا في productSchema على الويب قبل
      // ما الديسكتوب يبعتهم (Mongoose strict بيرمي المجهول **بصمت**).
      is_service: row.is_service === 1,
      duration_minutes: row.duration_minutes ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export const productsRepository = new ProductsRepository();
