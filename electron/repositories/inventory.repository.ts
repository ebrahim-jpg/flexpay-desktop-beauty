import { BaseRepository } from "./base.repository";
import { modifierConsumptions, type ModifierGroup } from "../../shared/products";
import { expensesRepository } from "./expenses.repository";
import { suppliersRepository } from "./suppliers.repository";
import { assertPositive, assertNonNegative, assertPercent } from "../../shared/validation";
import {
  computeStatus,
  calculateExpectedRange,
  type InventoryItemDTO,
  type CreateInventoryItemInput,
  type UpdateInventoryItemInput,
  type TransactionsPage,
  type TransactionDTO,
  type ExpectedRange,
  type InventoryStatus,
  type TransactionType,
  type RestockPaymentType,
  type DeductLine,
} from "../../shared/inventory";
import type {
  InventoryItemRow,
  InventoryTransactionRow,
} from "../../types/database.types";

type ItemJoinRow = InventoryItemRow & { supplier_name: string | null };

export class InventoryRepository extends BaseRepository {
  private toDTO(row: ItemJoinRow): InventoryItemDTO {
    const range = calculateExpectedRange({
      current_quantity: row.current_quantity,
      waste_percentage: row.waste_percentage,
    });
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      unit: row.unit,
      current_quantity: row.current_quantity,
      alert_threshold: row.alert_threshold,
      waste_percentage: row.waste_percentage,
      cost_per_unit: row.cost_per_unit,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      category: row.category ?? null,
      status: computeStatus(row.current_quantity, row.alert_threshold),
      expected_min: range.min,
      expected_max: range.max,
      waste_amount: range.waste_amount,
    };
  }

  private readonly selectJoin = `
    SELECT i.*, s.name AS supplier_name
    FROM inventory_items i
    LEFT JOIN suppliers s ON s.id = i.supplier_id
  `;

  private findRow(id: number): ItemJoinRow | null {
    const row = this.db
      .prepare(`${this.selectJoin} WHERE i.id = ? AND i.is_deleted = 0`)
      .get(id) as ItemJoinRow | undefined;
    return row ?? null;
  }

  getAll(): InventoryItemDTO[] {
    const rows = this.db
      .prepare(`${this.selectJoin} WHERE i.is_deleted = 0 ORDER BY i.name ASC`)
      .all() as ItemJoinRow[];
    return rows.map((r) => this.toDTO(r));
  }

  getAlerts(): InventoryItemDTO[] {
    return this.getAll().filter((i) => i.status !== "sufficient");
  }

  getById(id: number): InventoryItemDTO | null {
    const row = this.findRow(id);
    return row ? this.toDTO(row) : null;
  }

  getLowRange(id: number): ExpectedRange | null {
    const row = this.findRow(id);
    if (!row) return null;
    return calculateExpectedRange({
      current_quantity: row.current_quantity,
      waste_percentage: row.waste_percentage,
    });
  }

  create(input: CreateInventoryItemInput, actorId: number | null): InventoryItemDTO {
    // حراسة السوالب: الكمية/الحد/التكلفة ≥ 0، ونسبة التهدير 0–100
    assertNonNegative(input.current_quantity, "الكمية");
    assertNonNegative(input.alert_threshold, "حد التنبيه");
    assertNonNegative(input.cost_per_unit, "تكلفة الوحدة");
    assertPercent(input.waste_percentage, "نسبة التهدير");
    const localId = this.newLocalId();
    const now = this.now();
    const status: InventoryStatus = computeStatus(
      input.current_quantity,
      input.alert_threshold
    );
    return this.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO inventory_items (
            local_id, name, unit, current_quantity, alert_threshold,
            waste_percentage, cost_per_unit, supplier_id, category, status,
            created_by, updated_by, created_at, updated_at, sync_status
          ) VALUES (
            @local_id, @name, @unit, @qty, @threshold, @waste, @cost, @supplier,
            @category, @status, @actor, @actor, @now, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          name: input.name,
          unit: input.unit,
          qty: input.current_quantity,
          threshold: input.alert_threshold,
          waste: input.waste_percentage,
          cost: input.cost_per_unit,
          supplier: input.supplier_id ?? null,
          category: input.category?.trim() || null,
          status,
          actor: actorId,
          now,
        });

      const created = this.findRow(Number(result.lastInsertRowid))!;
      // كمية افتتاحية = حركة restock للشفافية
      if (input.current_quantity > 0) {
        this.createTransaction({
          itemId: created.id,
          itemName: created.name,
          unit: created.unit,
          type: "restock",
          quantity: input.current_quantity,
          before: 0,
          after: input.current_quantity,
          reason: "رصيد افتتاحي",
          orderId: null,
          actorId,
        });
      }
      this.enqueue("inventory_item", "CREATED", localId, this.toSyncPayload(created));
      return this.toDTO(created);
    });
  }

  update(input: UpdateInventoryItemInput, actorId: number | null): InventoryItemDTO {
    const existing = this.findRow(input.id);
    if (!existing) throw new Error("المادة غير موجودة");
    // حراسة السوالب لأي حقل رقمي بيتعدّل
    if (input.alert_threshold !== undefined) assertNonNegative(input.alert_threshold, "حد التنبيه");
    if (input.cost_per_unit !== undefined) assertNonNegative(input.cost_per_unit, "تكلفة الوحدة");
    if (input.waste_percentage !== undefined) assertPercent(input.waste_percentage, "نسبة التهدير");

    const fields: string[] = ["updated_at = @now", "updated_by = @actor", "sync_status = 'pending'"];
    const params: Record<string, unknown> = { id: input.id, now: this.now(), actor: actorId };
    const map: Record<string, string> = {
      name: "name",
      unit: "unit",
      alert_threshold: "alert_threshold",
      waste_percentage: "waste_percentage",
      cost_per_unit: "cost_per_unit",
      supplier_id: "supplier_id",
      category: "category",
    };
    for (const [key, col] of Object.entries(map)) {
      const v = (input as unknown as Record<string, unknown>)[key];
      if (v !== undefined) {
        fields.push(`${col} = @${key}`);
        params[key] = key === "category" ? (typeof v === "string" && v.trim() ? v.trim() : null) : v;
      }
    }
    // إعادة حساب الحالة لو اتغير حد التنبيه
    if (input.alert_threshold !== undefined) {
      fields.push("status = @status");
      params.status = computeStatus(existing.current_quantity, input.alert_threshold);
    }

    const costChanged =
      input.cost_per_unit !== undefined &&
      input.cost_per_unit !== existing.cost_per_unit;

    return this.transaction(() => {
      this.db.prepare(`UPDATE inventory_items SET ${fields.join(", ")} WHERE id = @id`).run(params);
      // تغيّر تكلفة المادة → إعادة حساب تكلفة المنتجات اللي بتستخدمها
      if (costChanged) this.recomputeProductsCostForItem(input.id, actorId);
      const updated = this.findRow(input.id)!;
      this.enqueue("inventory_item", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return this.toDTO(updated);
    });
  }

  softDelete(id: number, actorId: number | null): boolean {
    const existing = this.findRow(id);
    if (!existing) throw new Error("المادة غير موجودة");
    const usedIn = this.db
      .prepare(
        "SELECT COUNT(*) AS c FROM product_recipes WHERE inventory_item_id = ? AND is_deleted = 0"
      )
      .get(id) as { c: number };
    if (usedIn.c > 0) {
      throw new Error("المادة مستخدمة في وصفة منتج — شيلها من الوصفة الأول.");
    }
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE inventory_items SET is_deleted = 1, deleted_by = @actor, deleted_at = @now, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, actor: actorId, now: this.now() });
      this.enqueue("inventory_item", "DELETED", existing.local_id, {
        local_id: existing.local_id,
      });
      return true;
    });
  }

  private userName(userId: number | null): string | null {
    if (userId == null) return null;
    const row = this.db
      .prepare("SELECT name FROM users WHERE id = ?")
      .get(userId) as { name: string } | undefined;
    return row?.name ?? null;
  }

  restock(
    id: number,
    quantity: number,
    notes: string | null,
    actorId: number | null,
    costPerUnit?: number,
    drawerAmount?: number,
    paymentType?: RestockPaymentType,
    paidAmount?: number,
    supplierId?: number | null,
    drawerOwnerId?: number | null
  ): InventoryItemDTO {
    const item = this.findRow(id);
    if (!item) throw new Error("المادة غير موجودة");
    assertPositive(quantity, "الكمية");

    // المورد اللي يتحطله الآجل (المحدد أو مورد المادة)
    const targetSupplierId = supplierId ?? item.supplier_id ?? null;
    const isCredit = paymentType === "credit";
    if (isCredit && !targetSupplierId) {
      throw new Error("لازم تحدد مورد عشان تسجّل آجل");
    }
    const drawerEarly = Math.max(0, drawerAmount ?? 0);
    if (drawerEarly > 0 && !drawerOwnerId) {
      throw new Error("حدّد الفلوس خرجت من درج مين");
    }

    return this.transaction(() => {
      const before = item.current_quantity;
      const after = before + quantity;
      this.applyQuantity(id, after, actorId);

      // تحديث تكلفة الوحدة لو اتغيّرت + إعادة حساب تكلفة المنتجات
      if (
        costPerUnit !== undefined &&
        costPerUnit >= 0 &&
        costPerUnit !== item.cost_per_unit
      ) {
        this.db
          .prepare(
            "UPDATE inventory_items SET cost_per_unit = @cost, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id"
          )
          .run({ id, cost: costPerUnit, now: this.now(), actor: actorId });
        this.recomputeProductsCostForItem(id, actorId);
      }

      // تحديث مورد المادة لو جِت من مورد مختلف (المادة تتبع مورد آخر توريد)
      if (supplierId != null && supplierId !== item.supplier_id) {
        this.db
          .prepare(
            "UPDATE inventory_items SET supplier_id = @sup, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id"
          )
          .run({ id, sup: supplierId, now: this.now(), actor: actorId });
      }

      this.createTransaction({
        itemId: id,
        itemName: item.name,
        unit: item.unit,
        type: "restock",
        quantity,
        before,
        after,
        reason: notes || "استلام توريد",
        orderId: null,
        actorId,
      });
      this.refreshAvailabilityForItem(id, actorId);

      // الفلوس: التكلفة الكلية، المدفوع دلوقتي، واللي خرج من الدرج
      const effectiveCost = costPerUnit ?? item.cost_per_unit;
      const totalCost = effectiveCost * quantity;
      // كاش = مدفوع كامل | آجل = المدفوع المحدد (صفر = التكلفة كلها دين)
      const paidNow = isCredit ? Math.max(0, paidAmount ?? 0) : totalCost;
      const drawer = Math.max(0, drawerAmount ?? 0);
      // تحقق منطقي: المدفوع ≤ التكلفة، واللي خرج من الدرج ≤ المدفوع
      if (isCredit && paidNow > totalCost + 0.001) {
        throw new Error("المدفوع مينفعش يكون أكبر من التكلفة الكلية");
      }
      if (drawer > paidNow + 0.001) {
        throw new Error("اللي خرج من الدرج مينفعش يكون أكبر من المدفوع");
      }

      // مصروف بضاعة لو فيه مدفوع (يدخل المالية بالمدفوع: درج + مالك).
      // drawer → وردية صاحب الدرج (تقفيل صح)؛ owner = المدفوع من غير الدرج (فلوس المالك).
      if (paidNow > 0) {
        expensesRepository.createInventoryExpense({
          itemId: id,
          itemName: item.name,
          totalCost,
          drawerAmount: drawer,
          ownerPaid: Math.max(0, paidNow - drawer),
          drawerOwnerId: drawer > 0 ? drawerOwnerId ?? null : null,
          description: `استلام ${item.name} ${quantity} ${item.unit}`,
          actorId,
        });
      }

      // آجل: الباقي (التكلفة − المدفوع) يتحط دين على المورد
      if (isCredit && targetSupplierId) {
        suppliersRepository.addCreditPurchase({
          supplierId: targetSupplierId,
          totalCost,
          paidAmount: paidNow,
          drawerAmount: drawer,
          description: `توريد ${item.name} ${quantity} ${item.unit}`,
          actorId,
          actorName: this.userName(actorId),
        });
      }

      // إعادة مزامنة المادة بحالتها النهائية (الكمية + التكلفة + المورد)
      this.enqueue("inventory_item", "UPDATED", item.local_id, this.toSyncPayload(this.findRow(id)!));

      return this.toDTO(this.findRow(id)!);
    });
  }

  // الجزء المخزوني من التوريد فقط (بدون أي مالية) — لكل بند في فاتورة التوريد.
  // مايفتحش transaction بنفسه — المفروض يتنادى جوه transaction الفاتورة.
  restockStockOnly(p: {
    itemId: number;
    quantity: number;
    costPerUnit: number;
    supplierId: number | null;
    actorId: number | null;
    reason: string;
  }): { name: string; unit: string; lineCost: number } {
    const item = this.findRow(p.itemId);
    if (!item) throw new Error("المادة غير موجودة");
    assertPositive(p.quantity, "الكمية");

    const before = item.current_quantity;
    const after = before + p.quantity;
    this.applyQuantity(p.itemId, after, p.actorId);

    const effectiveCost = p.costPerUnit >= 0 ? p.costPerUnit : item.cost_per_unit;
    if (p.costPerUnit >= 0 && p.costPerUnit !== item.cost_per_unit) {
      this.db
        .prepare(
          "UPDATE inventory_items SET cost_per_unit = @cost, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id"
        )
        .run({ id: p.itemId, cost: p.costPerUnit, now: this.now(), actor: p.actorId });
      this.recomputeProductsCostForItem(p.itemId, p.actorId);
    }
    if (p.supplierId != null && p.supplierId !== item.supplier_id) {
      this.db
        .prepare(
          "UPDATE inventory_items SET supplier_id = @sup, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id"
        )
        .run({ id: p.itemId, sup: p.supplierId, now: this.now(), actor: p.actorId });
    }

    this.createTransaction({
      itemId: p.itemId,
      itemName: item.name,
      unit: item.unit,
      type: "restock",
      quantity: p.quantity,
      before,
      after,
      reason: p.reason,
      orderId: null,
      actorId: p.actorId,
    });
    this.refreshAvailabilityForItem(p.itemId, p.actorId);
    this.enqueue("inventory_item", "UPDATED", item.local_id, this.toSyncPayload(this.findRow(p.itemId)!));

    return { name: item.name, unit: item.unit, lineCost: effectiveCost * p.quantity };
  }

  // تسوية الكمية لقيمة الجرد الفعلية (حركة type='stocktake') — بدون transaction خاص بيها
  // (المفروض تتنادى جوه transaction الجرد). بترجّع لقطة الفرق.
  adjustToCount(
    itemId: number,
    countedQty: number,
    actorId: number | null,
    reason: string
  ): {
    name: string;
    unit: string;
    category: string | null;
    expected: number;
    counted: number;
    cost: number;
    wastePercentage: number;
  } {
    const item = this.findRow(itemId);
    if (!item) throw new Error("المادة غير موجودة");
    assertNonNegative(countedQty, "الكمية المجرودة"); // يرفض السالب و NaN
    const before = item.current_quantity;
    const after = Math.max(0, countedQty);
    if (after !== before) {
      this.applyQuantity(itemId, after, actorId);
      this.createTransaction({
        itemId,
        itemName: item.name,
        unit: item.unit,
        type: "stocktake",
        quantity: after - before, // سالب = عجز، موجب = زيادة
        before,
        after,
        reason,
        orderId: null,
        actorId,
      });
      this.refreshAvailabilityForItem(itemId, actorId);
    }
    return {
      name: item.name,
      unit: item.unit,
      category: item.category ?? null,
      expected: before,
      counted: after,
      cost: item.cost_per_unit,
      wastePercentage: item.waste_percentage,
    };
  }

  adjustWaste(id: number, quantity: number, reason: string, actorId: number | null): InventoryItemDTO {
    const item = this.findRow(id);
    if (!item) throw new Error("المادة غير موجودة");
    assertPositive(quantity, "الكمية");

    return this.transaction(() => {
      const before = item.current_quantity;
      const after = before - quantity;
      this.applyQuantity(id, after, actorId);
      this.createTransaction({
        itemId: id,
        itemName: item.name,
        unit: item.unit,
        type: "waste",
        quantity: -quantity,
        before,
        after,
        reason,
        orderId: null,
        actorId,
      });
      this.refreshAvailabilityForItem(id, actorId);
      return this.toDTO(this.findRow(id)!);
    });
  }

  getTransactions(itemId: number, page = 1, pageSize = 20): TransactionsPage {
    const offset = (page - 1) * pageSize;
    const totalRow = this.db
      .prepare("SELECT COUNT(*) AS c FROM inventory_transactions WHERE item_id = ?")
      .get(itemId) as { c: number };

    const rows = this.db
      .prepare(
        `SELECT t.*, u.name AS user_name
         FROM inventory_transactions t
         LEFT JOIN users u ON u.id = t.created_by
         WHERE t.item_id = ?
         ORDER BY t.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(itemId, pageSize, offset) as (InventoryTransactionRow & {
      user_name: string | null;
    })[];

    const dtos: TransactionDTO[] = rows.map((r) => ({
      id: r.id,
      type: r.type as TransactionType,
      quantity: r.quantity,
      quantity_before: r.quantity_before,
      quantity_after: r.quantity_after,
      reason: r.reason,
      user_name: r.user_name,
      created_at: r.created_at,
    }));

    return { rows: dtos, total: totalRow.c, page, page_size: pageSize };
  }

  // ===== الخصم التلقائي (يُستدعى من الكاشير — PRD-05) =====
  deductForOrder(
    orderId: number | null,
    items: DeductLine[],
    actorId: number | null
  ): boolean {
    return this.transaction(() => {
      const affected = new Set<number>();
      for (const orderItem of items) {
        // ⚠️ **لبّ الإصلاح التاني:** الوصفة بتتفلتر بالحجم كمان.
        // قبل كده كان الفلتر `product_id` بس — فمنتج بتلات وصفات (سمول/ميديم/لارج)
        // كان **بيخصم التلاتة مع كل بيعة**. دلوقتي: المشترك (`variant_id IS NULL`)
        // + وصفة الحجم المباع بس. منتج بلا أحجام = المشترك كله = سلوك الأساس بالحرف.
        const vid = orderItem.variant_id ?? null;
        const recipe = this.db
          .prepare(
            `SELECT inventory_item_id, standard_qty FROM product_recipes
              WHERE product_id = @pid AND is_deleted = 0
                AND (variant_id IS NULL ${vid == null ? "" : "OR variant_id = @vid"})`
          )
          .all({ pid: orderItem.product_id, ...(vid == null ? {} : { vid }) }) as {
          inventory_item_id: number | null;
          standard_qty: number;
        }[];

        // مواد الإضافات المختارة (جبنة إضافي = ٣٠ج جبنة) — نفس الدالة النقية اللي
        // التسعير بيحسب بيها تكلفة البند، فمستحيل الخصم والتكلفة يختلفوا
        const modifiers = this.productModifiers(orderItem.product_id);
        const addons = modifierConsumptions(modifiers, orderItem.option_ids ?? []).map((c) => ({
          inventory_item_id: c.inventory_item_id,
          standard_qty: c.qty,
        }));

        for (const r of [...recipe, ...addons]) {
          if (r.inventory_item_id == null) continue;
          const item = this.findRow(r.inventory_item_id);
          if (!item) continue;
          const deduct = r.standard_qty * orderItem.quantity;
          const before = item.current_quantity;
          const after = before - deduct;
          this.applyQuantity(item.id, after, actorId);
          this.createTransaction({
            itemId: item.id,
            itemName: item.name,
            unit: item.unit,
            type: "deduction",
            quantity: -deduct,
            before,
            after,
            reason: orderId ? `بيع طلب #${orderId}` : "بيع",
            orderId,
            actorId,
          });
          affected.add(item.id);
        }
      }
      for (const itemId of affected) {
        this.refreshAvailabilityForItem(itemId, actorId);
      }
      return true;
    });
  }

  // يرجّع المخزون اللي اتخصم لطلب اتلغى — يعكس حركات الخصم الفعلية ويسجّل حركة رجوع (تتزامن).
  restoreForOrder(orderId: number, actorId: number | null): boolean {
    return this.transaction(() => {
      const deductions = this.db
        .prepare(
          "SELECT item_id, quantity FROM inventory_transactions WHERE order_id = ? AND type = 'deduction'"
        )
        .all(orderId) as { item_id: number; quantity: number }[];

      const affected = new Set<number>();
      for (const d of deductions) {
        const restoreQty = -d.quantity; // الخصم متخزّن بالسالب → الرجوع بالموجب
        if (restoreQty <= 0) continue;
        const item = this.findRow(d.item_id);
        if (!item) continue;
        const before = item.current_quantity;
        const after = before + restoreQty;
        this.applyQuantity(item.id, after, actorId);
        this.createTransaction({
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
          type: "adjustment",
          quantity: restoreQty,
          before,
          after,
          reason: `إلغاء طلب #${orderId} — رجوع مخزون`,
          orderId,
          actorId,
        });
        affected.add(item.id);
      }
      for (const itemId of affected) {
        this.refreshAvailabilityForItem(itemId, actorId);
      }
      return true;
    });
  }

  // ===== Helpers داخلية =====
  private applyQuantity(itemId: number, newQty: number, actorId: number | null): void {
    const item = this.findRow(itemId);
    if (!item) return;
    const status = computeStatus(newQty, item.alert_threshold);
    this.db
      .prepare(
        `UPDATE inventory_items SET current_quantity = @qty, status = @status, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id`
      )
      .run({ id: itemId, qty: newQty, status, now: this.now(), actor: actorId });
    const updated = this.findRow(itemId)!;
    this.enqueue("inventory_item", "UPDATED", updated.local_id, this.toSyncPayload(updated));
  }

  private createTransaction(p: {
    itemId: number;
    itemName: string;
    unit: string;
    type: TransactionType;
    quantity: number;
    before: number;
    after: number;
    reason: string | null;
    orderId: number | null;
    actorId: number | null;
  }): void {
    const localId = this.newLocalId();
    const now = this.now();
    this.db
      .prepare(
        `INSERT INTO inventory_transactions (
          local_id, item_id, item_name, unit, type, quantity,
          quantity_before, quantity_after, reason, order_id, created_by, created_at, sync_status
        ) VALUES (
          @local_id, @item_id, @item_name, @unit, @type, @quantity,
          @before, @after, @reason, @order_id, @actor, @now, 'pending'
        )`
      )
      .run({
        local_id: localId,
        item_id: p.itemId,
        item_name: p.itemName,
        unit: p.unit,
        type: p.type,
        quantity: p.quantity,
        before: p.before,
        after: p.after,
        reason: p.reason,
        order_id: p.orderId,
        actor: p.actorId,
        now,
      });
    this.enqueue("inventory_transaction", "CREATED", localId, {
      local_id: localId,
      item_id: p.itemId,
      item_name: p.itemName,
      unit: p.unit,
      type: p.type,
      quantity: p.quantity,
      quantity_before: p.before,
      quantity_after: p.after,
      reason: p.reason,
      order_id: p.orderId,
      created_by: p.actorId,
      created_at: now,
    });
  }

  private autoHideEnabled(): boolean {
    const row = this.db
      .prepare("SELECT auto_hide_out_of_stock AS v FROM settings WHERE id = 1")
      .get() as { v: number } | undefined;
    return (row?.v ?? 1) === 1;
  }

  // الإخفاء/الإظهار التلقائي للمنتجات حسب توفر مكوّناتها
  /** خيارات المنتج من JSON — للإضافات اللي بتخصم مواد */
  private productModifiers(productId: number): ModifierGroup[] {
    const row = this.db
      .prepare("SELECT modifiers FROM products WHERE id = ?")
      .get(productId) as { modifiers: string } | undefined;
    if (!row?.modifiers) return [];
    try {
      const parsed = JSON.parse(row.modifiers) as ModifierGroup[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * المنتج متاح لو **فيه حجم واحد على الأقل ينفع يتعمل** (كل مكوّناته فيها رصيد).
   *
   * ⚠️ منتج بلا أحجام = حجم واحد ضمني وكل وصفته مشتركة → **نفس سلوك الأساس بالحرف**
   * (نقص أي مكوّن = مش متاح). الأحجام هي اللي خلّت القاعدة دي لازمة: مكوّن خاص
   * باللارج خلص مايصحّش يخفي البيتزا كلها من المنيو. ونقص في مكوّن **مشترك** بيقع
   * كل الأحجام تلقائياً (المشترك بيتحسب على كل حجم) → المنتج مش متاح.
   */
  private canMakeAnySize(productId: number): boolean {
    const shortage = (variantId: number | null): boolean => {
      const scope = variantId == null ? "" : "OR pr.variant_id = @vid";
      const row = this.db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM product_recipes pr
             JOIN inventory_items inv ON inv.id = pr.inventory_item_id
            WHERE pr.product_id = @pid AND pr.is_deleted = 0
              AND inv.is_deleted = 0 AND inv.current_quantity <= 0
              AND (pr.variant_id IS NULL ${scope})`
        )
        .get({ pid: productId, ...(variantId == null ? {} : { vid: variantId }) }) as { c: number };
      return row.c > 0;
    };

    const sizes = this.db
      .prepare(
        `SELECT id FROM product_variants
          WHERE product_id = ? AND is_active = 1 AND is_deleted = 0`
      )
      .all(productId) as { id: number }[];
    if (!sizes.length) return !shortage(null);
    return sizes.some((v) => !shortage(v.id));
  }

  private refreshAvailabilityForItem(itemId: number, actorId: number | null): void {
    if (!this.autoHideEnabled()) return;

    const productIds = this.db
      .prepare(
        "SELECT DISTINCT product_id FROM product_recipes WHERE inventory_item_id = ? AND is_deleted = 0"
      )
      .all(itemId) as { product_id: number }[];

    for (const { product_id } of productIds) {
      const available = this.canMakeAnySize(product_id) ? 1 : 0;
      const current = this.db
        .prepare("SELECT is_available, local_id FROM products WHERE id = ? AND is_deleted = 0")
        .get(product_id) as { is_available: number; local_id: string } | undefined;
      if (!current || current.is_available === available) continue;

      this.db
        .prepare(
          `UPDATE products SET is_available = @av, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id: product_id, av: available, now: this.now(), actor: actorId });
      this.enqueue("product", "UPDATED", current.local_id, {
        local_id: current.local_id,
        is_available: available === 1,
      });
    }
  }

  // يُستدعى عند تغيير إعداد "الإخفاء التلقائي" لمصالحة حالة كل المنتجات دفعة واحدة.
  // عند التفعيل: يخفي كل منتج ناقص مكوّناته ويُظهر المتوفر.
  // عند الإيقاف: يرجّع إظهار المنتجات اللي كانت متخفية بسبب نقص المخزون فقط.
  applyAutoHideSetting(enabled: boolean, actorId: number | null): void {
    const productIds = this.db
      .prepare(
        "SELECT DISTINCT product_id FROM product_recipes WHERE is_deleted = 0"
      )
      .all() as { product_id: number }[];
    if (productIds.length === 0) return;

    const shortageStmt = this.db.prepare(
      `SELECT COUNT(*) AS c
       FROM product_recipes pr
       JOIN inventory_items inv ON inv.id = pr.inventory_item_id
       WHERE pr.product_id = ? AND pr.is_deleted = 0
         AND inv.is_deleted = 0 AND inv.current_quantity <= 0`
    );
    const productStmt = this.db.prepare(
      "SELECT is_available, local_id FROM products WHERE id = ? AND is_deleted = 0"
    );
    const updateStmt = this.db.prepare(
      `UPDATE products SET is_available = @av, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id`
    );

    this.transaction(() => {
      for (const { product_id } of productIds) {
        const current = productStmt.get(product_id) as
          | { is_available: number; local_id: string }
          | undefined;
        if (!current) continue;

        const shortage = (shortageStmt.get(product_id) as { c: number }).c > 0;

        let target: number;
        if (enabled) {
          // التفعيل: التوفر = كل المكونات موجودة
          target = shortage ? 0 : 1;
        } else {
          // الإيقاف: رجّع المتخفي بسبب النقص فقط، وسيب الباقي زي ما هو
          target = shortage ? 1 : current.is_available;
        }

        if (current.is_available === target) continue;
        updateStmt.run({
          id: product_id,
          av: target,
          now: this.now(),
          actor: actorId,
        });
        this.enqueue("product", "UPDATED", current.local_id, {
          local_id: current.local_id,
          is_available: target === 1,
        });
      }
    });
  }

  // إعادة حساب تكلفة المنتجات اللي بتستخدم المادة دي
  private recomputeProductsCostForItem(itemId: number, actorId: number | null): void {
    const productIds = this.db
      .prepare(
        "SELECT DISTINCT product_id FROM product_recipes WHERE inventory_item_id = ? AND is_deleted = 0"
      )
      .all(itemId) as { product_id: number }[];

    for (const { product_id } of productIds) {
      const costRow = this.db
        .prepare(
          `SELECT COALESCE(SUM(pr.standard_qty * inv.cost_per_unit), 0) AS cost
           FROM product_recipes pr
           JOIN inventory_items inv ON inv.id = pr.inventory_item_id
           WHERE pr.product_id = ? AND pr.is_deleted = 0 AND inv.is_deleted = 0`
        )
        .get(product_id) as { cost: number };
      const local = this.db
        .prepare("SELECT local_id FROM products WHERE id = ?")
        .get(product_id) as { local_id: string } | undefined;
      this.db
        .prepare(
          `UPDATE products SET cost_price = @cost, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id: product_id, cost: costRow.cost, now: this.now(), actor: actorId });
      if (local) {
        this.enqueue("product", "UPDATED", local.local_id, {
          local_id: local.local_id,
          cost_price: costRow.cost,
        });
      }
    }
  }

  private toSyncPayload(row: InventoryItemRow) {
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      unit: row.unit,
      current_quantity: row.current_quantity,
      alert_threshold: row.alert_threshold,
      waste_percentage: row.waste_percentage,
      cost_per_unit: row.cost_per_unit,
      supplier_id: row.supplier_id,
      category: row.category ?? null,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // فئات المخزون الموجودة (لـ combobox + نطاق الجرد)
  getCategories(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT category FROM inventory_items
         WHERE is_deleted = 0 AND category IS NOT NULL AND TRIM(category) <> ''
         ORDER BY category ASC`
      )
      .all() as { category: string }[];
    return rows.map((r) => r.category);
  }
}

export const inventoryRepository = new InventoryRepository();
