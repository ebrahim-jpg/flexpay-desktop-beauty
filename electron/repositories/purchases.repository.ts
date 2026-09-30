import { BaseRepository } from "./base.repository";
import { inventoryRepository } from "./inventory.repository";
import { expensesRepository } from "./expenses.repository";
import { suppliersRepository } from "./suppliers.repository";
import { businessDateKey } from "../../shared/business-day";
import { assertPositive, assertNonNegative } from "../../shared/validation";
import type {
  CreatePurchaseInvoiceInput,
  PurchaseInvoiceDTO,
  PurchaseInvoiceItemDTO,
  PurchaseInvoiceListItem,
  PurchasePaymentType,
} from "../../shared/purchases";
import type {
  PurchaseInvoiceRow,
  PurchaseInvoiceItemRow,
} from "../../types/database.types";

export class PurchasesRepository extends BaseRepository {
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
  private supplierName(id: number | null): string | null {
    if (id == null) return null;
    const r = this.db
      .prepare("SELECT name FROM suppliers WHERE id = ?")
      .get(id) as { name: string } | undefined;
    return r?.name ?? null;
  }

  // إنشاء فاتورة توريد: كل بند توريد (مخزون فقط) + مرة واحدة مالية (مصروف درج + دين مورد)
  createInvoice(
    input: CreatePurchaseInvoiceInput,
    actorId: number | null
  ): PurchaseInvoiceDTO {
    if (!input.items?.length) throw new Error("ضيف بند واحد على الأقل");
    for (const it of input.items) {
      assertPositive(it.quantity, "كمية البند"); // يرفض السالب/الصفر/NaN
      assertNonNegative(it.unit_cost, "تكلفة الوحدة"); // تكلفة سالبة → دين/مصروف سالب
    }
    if (input.paid_amount != null) assertNonNegative(input.paid_amount, "المدفوع");
    if (input.drawer_amount != null) assertNonNegative(input.drawer_amount, "اللي خرج من الدرج");
    const isCredit = input.payment_type === "credit";
    const supplierId = input.supplier_id ?? null;
    if (isCredit && !supplierId) throw new Error("لازم تحدد مورد عشان تسجّل آجل");
    const drawer = Math.max(0, input.drawer_amount ?? 0);
    if (drawer > 0 && !input.drawer_owner_id) {
      throw new Error("حدّد الفلوس خرجت من درج مين");
    }

    const totalCost = input.items.reduce((s, it) => s + it.quantity * it.unit_cost, 0);
    const paidNow = isCredit ? Math.max(0, input.paid_amount ?? 0) : totalCost;
    if (isCredit && paidNow > totalCost + 0.001) {
      throw new Error("المدفوع مينفعش يكون أكبر من الإجمالي");
    }
    if (drawer > paidNow + 0.001) {
      throw new Error("اللي خرج من الدرج مينفعش يكون أكبر من المدفوع");
    }

    const date = input.invoice_date || this.today();
    const supplierName = this.supplierName(supplierId);
    const drawerOwnerName = input.drawer_owner_id
      ? this.userName(input.drawer_owner_id)
      : null;
    const ref = input.reference?.trim() || null;
    const reason = `فاتورة توريد${ref ? ` ${ref}` : ""}${supplierName ? ` — ${supplierName}` : ""}`;

    return this.transaction(() => {
      const localId = this.newLocalId();
      const now = this.now();
      const res = this.db
        .prepare(
          `INSERT INTO purchase_invoices (
            local_id, reference, invoice_date, supplier_id, supplier_name, payment_type,
            total_cost, paid_amount, drawer_amount, drawer_owner_id, drawer_owner_name,
            notes, created_by, created_by_name, created_at, sync_status
          ) VALUES (
            @local_id, @ref, @date, @sup, @sup_name, @ptype,
            @total, @paid, @drawer, @downer, @downer_name,
            @notes, @actor, @actor_name, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          ref,
          date,
          sup: supplierId,
          sup_name: supplierName,
          ptype: input.payment_type,
          total: totalCost,
          paid: paidNow,
          drawer,
          downer: input.drawer_owner_id ?? null,
          downer_name: drawerOwnerName,
          notes: input.notes?.trim() || null,
          actor: actorId ?? 0,
          actor_name: this.userName(actorId),
          now,
        });
      const invoiceId = Number(res.lastInsertRowid);

      // كل بند: توريد مخزوني فقط (يحدّث الكمية/التكلفة/المورد + حركة)
      const itemPayloads: Record<string, unknown>[] = [];
      for (const it of input.items) {
        const r = inventoryRepository.restockStockOnly({
          itemId: it.inventory_item_id,
          quantity: it.quantity,
          costPerUnit: it.unit_cost,
          supplierId,
          actorId,
          reason,
        });
        const ins = this.db
          .prepare(
            `INSERT INTO purchase_invoice_items (
              local_id, invoice_id, invoice_local_id, inventory_item_id,
              item_name, unit, quantity, unit_cost, line_cost
            ) VALUES (
              @local_id, @inv, @inv_local, @item, @name, @unit, @qty, @cost, @line
            )`
          )
          .run({
            local_id: this.newLocalId(),
            inv: invoiceId,
            inv_local: localId,
            item: it.inventory_item_id,
            name: r.name,
            unit: r.unit,
            qty: it.quantity,
            cost: it.unit_cost,
            line: r.lineCost,
          });
        itemPayloads.push({
          id: Number(ins.lastInsertRowid),
          inventory_item_id: it.inventory_item_id,
          item_name: r.name,
          unit: r.unit,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
          line_cost: r.lineCost,
        });
      }

      // مصروف واحد للفاتورة (لو فيه مدفوع) — درج لصاحب الدرج + باقي المدفوع من المالك
      if (paidNow > 0) {
        expensesRepository.createInventoryExpense({
          itemId: null,
          itemName: null,
          totalCost,
          drawerAmount: drawer,
          ownerPaid: Math.max(0, paidNow - drawer),
          drawerOwnerId: drawer > 0 ? input.drawer_owner_id ?? null : null,
          description: reason,
          actorId,
        });
      }
      // دين واحد على المورد (لو آجل)
      if (isCredit && supplierId) {
        suppliersRepository.addCreditPurchase({
          supplierId,
          totalCost,
          paidAmount: paidNow,
          drawerAmount: drawer,
          description: reason,
          actorId,
          actorName: this.userName(actorId),
        });
      }

      // مزامنة الفاتورة للويب (header + البنود مضمّنة)
      this.enqueue("purchase_invoice", "CREATED", localId, {
        id: invoiceId,
        local_id: localId,
        reference: ref,
        invoice_date: date,
        supplier_id: supplierId,
        supplier_name: supplierName,
        payment_type: input.payment_type,
        total_cost: totalCost,
        paid_amount: paidNow,
        drawer_amount: drawer,
        drawer_owner_id: input.drawer_owner_id ?? null,
        drawer_owner_name: drawerOwnerName,
        notes: input.notes?.trim() || null,
        created_by: actorId ?? 0,
        created_by_name: this.userName(actorId),
        created_at: now,
        items: itemPayloads,
      });

      return this.getInvoiceById(invoiceId)!;
    });
  }

  getInvoices(limit = 100): PurchaseInvoiceListItem[] {
    const rows = this.db
      .prepare(
        `SELECT pi.*, (
            SELECT COUNT(*) FROM purchase_invoice_items WHERE invoice_id = pi.id
          ) AS item_count
         FROM purchase_invoices pi
         WHERE pi.is_deleted = 0
         ORDER BY pi.created_at DESC, pi.id DESC
         LIMIT ?`
      )
      .all(limit) as (PurchaseInvoiceRow & { item_count: number })[];
    return rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      invoice_date: r.invoice_date,
      supplier_name: r.supplier_name,
      payment_type: r.payment_type as PurchasePaymentType,
      total_cost: r.total_cost,
      paid_amount: r.paid_amount,
      item_count: r.item_count,
      created_at: r.created_at,
    }));
  }

  getInvoiceById(id: number): PurchaseInvoiceDTO | null {
    const row = this.db
      .prepare("SELECT * FROM purchase_invoices WHERE id = ? AND is_deleted = 0")
      .get(id) as PurchaseInvoiceRow | undefined;
    if (!row) return null;
    const items = this.db
      .prepare(
        "SELECT * FROM purchase_invoice_items WHERE invoice_id = ? ORDER BY id ASC"
      )
      .all(id) as PurchaseInvoiceItemRow[];
    const itemDTOs: PurchaseInvoiceItemDTO[] = items.map((it) => ({
      id: it.id,
      inventory_item_id: it.inventory_item_id,
      item_name: it.item_name,
      unit: it.unit,
      quantity: it.quantity,
      unit_cost: it.unit_cost,
      line_cost: it.line_cost,
    }));
    return {
      id: row.id,
      local_id: row.local_id,
      reference: row.reference,
      invoice_date: row.invoice_date,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      payment_type: row.payment_type as PurchasePaymentType,
      total_cost: row.total_cost,
      paid_amount: row.paid_amount,
      drawer_amount: row.drawer_amount,
      drawer_owner_id: row.drawer_owner_id,
      drawer_owner_name: row.drawer_owner_name,
      notes: row.notes,
      created_by_name: row.created_by_name,
      created_at: row.created_at,
      items: itemDTOs,
    };
  }
}

export const purchasesRepository = new PurchasesRepository();
