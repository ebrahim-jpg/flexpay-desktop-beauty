import { BaseRepository } from "./base.repository";
import { inventoryRepository } from "./inventory.repository";
import { businessDateKey } from "../../shared/business-day";
import { evaluateStocktake } from "../../shared/stocktake";
import type {
  CommitStocktakeInput,
  StocktakeCountRow,
  StocktakeDTO,
  StocktakeItemDTO,
  StocktakeListItem,
  StocktakeScopeInput,
} from "../../shared/stocktake";
import type { StocktakeRow, StocktakeItemRow } from "../../types/database.types";

export class StocktakeRepository extends BaseRepository {
  private businessDayStart(): number {
    const row = this.db
      .prepare("SELECT business_day_start AS v FROM settings WHERE id = 1")
      .get() as { v: number } | undefined;
    return row?.v ?? 0;
  }
  private today(): string {
    return businessDateKey(new Date(), this.businessDayStart());
  }
  private userName(userId: number | null): string {
    if (userId == null) return "النظام";
    const r = this.db
      .prepare("SELECT name FROM users WHERE id = ?")
      .get(userId) as { name: string } | undefined;
    return r?.name ?? "—";
  }

  // المواد اللي هتتعدّ حسب النطاق (مع الكمية المتوقعة الحالية)
  getCountRows(scope: StocktakeScopeInput): StocktakeCountRow[] {
    const where: string[] = ["is_deleted = 0"];
    const params: unknown[] = [];

    if (scope.type === "categories" && scope.categories?.length) {
      where.push(
        `category IN (${scope.categories.map(() => "?").join(",")})`
      );
      params.push(...scope.categories);
    } else if (scope.type === "manual" && scope.itemIds?.length) {
      where.push(`id IN (${scope.itemIds.map(() => "?").join(",")})`);
      params.push(...scope.itemIds);
    }
    if (scope.excludeItemIds?.length) {
      where.push(`id NOT IN (${scope.excludeItemIds.map(() => "?").join(",")})`);
      params.push(...scope.excludeItemIds);
    }

    const rows = this.db
      .prepare(
        `SELECT id, name, unit, category, current_quantity, waste_percentage, cost_per_unit
         FROM inventory_items
         WHERE ${where.join(" AND ")}
         ORDER BY COALESCE(category, 'zzz') ASC, name ASC`
      )
      .all(...params) as {
      id: number;
      name: string;
      unit: string;
      category: string | null;
      current_quantity: number;
      waste_percentage: number;
      cost_per_unit: number;
    }[];

    return rows.map((r) => ({
      inventory_item_id: r.id,
      item_name: r.name,
      unit: r.unit,
      category: r.category,
      expected_qty: r.current_quantity,
      expected_min: r.current_quantity - r.current_quantity * (r.waste_percentage / 100),
      waste_percentage: r.waste_percentage,
      cost_per_unit: r.cost_per_unit,
    }));
  }

  // تنفيذ الجرد: يضبط كل مادة لكميتها الفعلية + يحفظ لقطة المقارنة + يزامن
  commitStocktake(
    input: CommitStocktakeInput,
    actorId: number | null
  ): StocktakeDTO {
    if (!input.items?.length) throw new Error("مفيش مواد متجردة");

    return this.transaction(() => {
      const localId = this.newLocalId();
      const now = this.now();
      const countedAt = this.today();
      const ref = input.reference?.trim() || null;
      const reason = `تسوية جرد${ref ? ` ${ref}` : ""}`;

      // رأس مبدئي (هنحدّث المجاميع بعد البنود)
      const res = this.db
        .prepare(
          `INSERT INTO stocktakes (
            local_id, reference, scope, counted_at, item_count,
            shortage_value, surplus_value, variance_value, notes,
            created_by, created_by_name, created_at, sync_status
          ) VALUES (
            @local_id, @ref, @scope, @counted_at, 0, 0, 0, 0, @notes,
            @actor, @actor_name, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          ref,
          scope: input.scope ? JSON.stringify(input.scope) : null,
          counted_at: countedAt,
          notes: input.notes?.trim() || null,
          actor: actorId ?? 0,
          actor_name: this.userName(actorId),
          now,
        });
      const stocktakeId = Number(res.lastInsertRowid);

      let shortage = 0;
      let surplus = 0;
      const itemPayloads: Record<string, unknown>[] = [];

      for (const it of input.items) {
        // الضبط بيرجّع المتوقع الحقيقي (الكمية الحالية وقت التنفيذ) + التكلفة + نسبة التهدير
        const r = inventoryRepository.adjustToCount(
          it.inventory_item_id,
          it.counted_qty,
          actorId,
          reason
        );
        // الفرق غير الطبيعي بعد استبعاد التهدير المسموح (نطاق [expectedMin, expected])
        const { expectedMin, variance } = evaluateStocktake(
          r.expected,
          r.counted,
          r.wastePercentage
        );
        const value = variance * r.cost;
        if (value < 0) shortage += -value;
        else surplus += value;

        const itemLocalId = this.newLocalId();
        const insItem = this.db
          .prepare(
            `INSERT INTO stocktake_items (
              local_id, stocktake_id, stocktake_local_id, inventory_item_id,
              item_name, unit, category, expected_qty, expected_min, waste_percentage,
              counted_qty, variance_qty, cost_per_unit, variance_value
            ) VALUES (
              @local_id, @stk, @stk_local, @item, @name, @unit, @category,
              @expected, @expected_min, @waste, @counted, @variance, @cost, @value
            )`
          )
          .run({
            local_id: itemLocalId,
            stk: stocktakeId,
            stk_local: localId,
            item: it.inventory_item_id,
            name: r.name,
            unit: r.unit,
            category: r.category,
            expected: r.expected,
            expected_min: expectedMin,
            waste: r.wastePercentage,
            counted: r.counted,
            variance,
            cost: r.cost,
            value,
          });

        itemPayloads.push({
          id: Number(insItem.lastInsertRowid),
          local_id: itemLocalId,
          inventory_item_id: it.inventory_item_id,
          item_name: r.name,
          unit: r.unit,
          category: r.category,
          expected_qty: r.expected,
          expected_min: expectedMin,
          waste_percentage: r.wastePercentage,
          counted_qty: r.counted,
          variance_qty: variance,
          cost_per_unit: r.cost,
          variance_value: value,
        });
      }

      const varianceValue = surplus - shortage;
      this.db
        .prepare(
          `UPDATE stocktakes SET item_count = @count, shortage_value = @shortage,
             surplus_value = @surplus, variance_value = @variance WHERE id = @id`
        )
        .run({
          id: stocktakeId,
          count: input.items.length,
          shortage,
          surplus,
          variance: varianceValue,
        });

      // مزامنة الجرد للويب (header + البنود مضمّنة)
      this.enqueue("stocktake", "CREATED", localId, {
        id: stocktakeId,
        local_id: localId,
        reference: ref,
        counted_at: countedAt,
        scope: input.scope ?? null,
        item_count: input.items.length,
        shortage_value: shortage,
        surplus_value: surplus,
        variance_value: varianceValue,
        notes: input.notes?.trim() || null,
        created_by: actorId ?? 0,
        created_by_name: this.userName(actorId),
        created_at: now,
        items: itemPayloads,
      });

      return this.getStocktakeById(stocktakeId)!;
    });
  }

  getStocktakes(limit = 100): StocktakeListItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM stocktakes WHERE is_deleted = 0
         ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(limit) as StocktakeRow[];
    return rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      counted_at: r.counted_at,
      item_count: r.item_count,
      shortage_value: r.shortage_value,
      surplus_value: r.surplus_value,
      variance_value: r.variance_value,
      created_by_name: r.created_by_name,
      created_at: r.created_at,
    }));
  }

  getStocktakeById(id: number): StocktakeDTO | null {
    const row = this.db
      .prepare("SELECT * FROM stocktakes WHERE id = ? AND is_deleted = 0")
      .get(id) as StocktakeRow | undefined;
    if (!row) return null;
    const items = this.db
      .prepare(
        "SELECT * FROM stocktake_items WHERE stocktake_id = ? ORDER BY id ASC"
      )
      .all(id) as StocktakeItemRow[];
    const itemDTOs: StocktakeItemDTO[] = items.map((it) => ({
      id: it.id,
      inventory_item_id: it.inventory_item_id,
      item_name: it.item_name,
      unit: it.unit,
      category: it.category,
      expected_qty: it.expected_qty,
      expected_min: it.expected_min,
      waste_percentage: it.waste_percentage,
      counted_qty: it.counted_qty,
      variance_qty: it.variance_qty,
      cost_per_unit: it.cost_per_unit,
      variance_value: it.variance_value,
    }));
    return {
      id: row.id,
      local_id: row.local_id,
      reference: row.reference,
      counted_at: row.counted_at,
      item_count: row.item_count,
      shortage_value: row.shortage_value,
      surplus_value: row.surplus_value,
      variance_value: row.variance_value,
      notes: row.notes,
      created_by_name: row.created_by_name,
      created_at: row.created_at,
      items: itemDTOs,
    };
  }
}

export const stocktakeRepository = new StocktakeRepository();
