import { BaseRepository } from "./base.repository";
import { expensesRepository } from "./expenses.repository";
import { businessDateKey } from "../../shared/business-day";
import type {
  SupplierRow,
  SupplierTransactionRow,
} from "../../types/database.types";
import type {
  SupplierDTO,
  CreateSupplierInput,
  UpdateSupplierInput,
  SupplierTransactionDTO,
  SupplierTxType,
  SupplierLedger,
  RecordSupplierPaymentInput,
} from "../../shared/inventory";

export class SuppliersRepository extends BaseRepository {
  private toDTO(row: SupplierRow & { item_count?: number }): SupplierDTO {
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      notes: row.notes,
      is_active: row.is_active === 1,
      item_count: row.item_count ?? 0,
      balance: row.balance ?? 0,
    };
  }

  private businessDayStart(): number {
    const row = this.db
      .prepare("SELECT business_day_start FROM settings WHERE id = 1")
      .get() as { business_day_start: number } | undefined;
    return row?.business_day_start ?? 0;
  }

  private today(): string {
    return businessDateKey(new Date(), this.businessDayStart());
  }

  private findRow(id: number): SupplierRow | null {
    const row = this.db
      .prepare("SELECT * FROM suppliers WHERE id = ? AND is_deleted = 0")
      .get(id) as SupplierRow | undefined;
    return row ?? null;
  }

  getAll(): SupplierDTO[] {
    const rows = this.db
      .prepare(
        `SELECT s.*,
          (SELECT COUNT(*) FROM inventory_items i
           WHERE i.supplier_id = s.id AND i.is_deleted = 0) AS item_count
         FROM suppliers s
         WHERE s.is_deleted = 0
         ORDER BY s.name ASC`
      )
      .all() as (SupplierRow & { item_count: number })[];
    return rows.map((r) => this.toDTO(r));
  }

  getById(id: number): SupplierDTO | null {
    const row = this.findRow(id);
    return row ? this.toDTO(row) : null;
  }

  create(input: CreateSupplierInput, actorId: number | null): SupplierDTO {
    const localId = this.newLocalId();
    const now = this.now();
    return this.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO suppliers (
            local_id, name, phone, email, address, notes, is_active,
            created_by, updated_by, created_at, updated_at, sync_status
          ) VALUES (
            @local_id, @name, @phone, @email, @address, @notes, 1,
            @actor, @actor, @now, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          actor: actorId,
          now,
        });
      const created = this.findRow(Number(result.lastInsertRowid))!;
      this.enqueue("supplier", "CREATED", localId, this.toSyncPayload(created));
      return this.toDTO(created);
    });
  }

  update(input: UpdateSupplierInput, actorId: number | null): SupplierDTO {
    const existing = this.findRow(input.id);
    if (!existing) throw new Error("المورد غير موجود");

    const fields: string[] = ["updated_at = @now", "updated_by = @actor", "sync_status = 'pending'"];
    const params: Record<string, unknown> = { id: input.id, now: this.now(), actor: actorId };
    const map: Record<string, string> = {
      name: "name",
      phone: "phone",
      email: "email",
      address: "address",
      notes: "notes",
    };
    for (const [key, col] of Object.entries(map)) {
      const v = (input as unknown as Record<string, unknown>)[key];
      if (v !== undefined) {
        fields.push(`${col} = @${key}`);
        params[key] = v;
      }
    }

    return this.transaction(() => {
      this.db.prepare(`UPDATE suppliers SET ${fields.join(", ")} WHERE id = @id`).run(params);
      const updated = this.findRow(input.id)!;
      this.enqueue("supplier", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return this.toDTO(updated);
    });
  }

  softDelete(id: number, actorId: number | null): boolean {
    const existing = this.findRow(id);
    if (!existing) throw new Error("المورد غير موجود");
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE suppliers SET is_deleted = 1, deleted_by = @actor, deleted_at = @now, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, actor: actorId, now: this.now() });
      // فك ارتباط المواد بهذا المورد (تبقى المواد موجودة)
      this.db
        .prepare("UPDATE inventory_items SET supplier_id = NULL WHERE supplier_id = @id")
        .run({ id });
      this.enqueue("supplier", "DELETED", existing.local_id, { local_id: existing.local_id });
      return true;
    });
  }

  private toSyncPayload(row: SupplierRow) {
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      notes: row.notes,
      is_active: row.is_active === 1,
      balance: row.balance ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ===== آجل ودفعات الموردين =====

  private toTxDTO(row: SupplierTransactionRow): SupplierTransactionDTO {
    return {
      id: row.id,
      type: row.type === "payment" ? "payment" : "purchase",
      total_amount: row.total_amount,
      paid_amount: row.paid_amount,
      drawer_amount: row.drawer_amount,
      balance_change: row.balance_change,
      balance_after: row.balance_after,
      description: row.description,
      created_by_name: row.created_by_name,
      created_at: row.created_at,
    };
  }

  // يكتب حركة مورد ويحدّث الرصيد (بدون transaction wrapper — يُستدعى جوه معاملة موجودة).
  private writeTx(params: {
    supplier: SupplierRow;
    type: SupplierTxType;
    totalAmount: number;
    paidAmount: number;
    drawerAmount: number;
    balanceChange: number;
    description: string | null;
    actorId: number | null;
    actorName: string | null;
  }): SupplierTransactionRow {
    const newBalance =
      Number((params.supplier.balance ?? 0).toFixed(2)) +
      Number(params.balanceChange.toFixed(2));
    const balanceAfter = Number(newBalance.toFixed(2));
    const localId = this.newLocalId();
    const now = this.now();

    const result = this.db
      .prepare(
        `INSERT INTO supplier_transactions (
          local_id, supplier_id, supplier_name, type, total_amount, paid_amount,
          drawer_amount, balance_change, balance_after, description, business_date,
          created_by, created_by_name, created_at, sync_status
        ) VALUES (
          @local_id, @supplier_id, @supplier_name, @type, @total, @paid,
          @drawer, @change, @after, @description, @date,
          @actor, @actor_name, @now, 'pending'
        )`
      )
      .run({
        local_id: localId,
        supplier_id: params.supplier.id,
        supplier_name: params.supplier.name,
        type: params.type,
        total: params.totalAmount,
        paid: params.paidAmount,
        drawer: params.drawerAmount,
        change: params.balanceChange,
        after: balanceAfter,
        description: params.description,
        date: this.today(),
        actor: params.actorId,
        actor_name: params.actorName,
        now,
      });

    // تحديث رصيد المورد + تزامن السجل نفسه (عشان balance يوصل الويب)
    this.db
      .prepare(
        "UPDATE suppliers SET balance = @balance, updated_at = @now, sync_status = 'pending' WHERE id = @id"
      )
      .run({ balance: balanceAfter, now, id: params.supplier.id });
    const updatedSupplier = this.findRow(params.supplier.id);
    if (updatedSupplier) {
      this.enqueue(
        "supplier",
        "UPDATED",
        updatedSupplier.local_id,
        this.toSyncPayload(updatedSupplier)
      );
    }

    const created = this.db
      .prepare("SELECT * FROM supplier_transactions WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as SupplierTransactionRow;
    this.enqueue("supplier_transaction", "CREATED", localId, created);
    return created;
  }

  // توريد آجل: بيتحط دين (التكلفة − المدفوع) على المورد.
  // يُستدعى من inventory.restock جوه نفس المعاملة.
  addCreditPurchase(params: {
    supplierId: number;
    totalCost: number;
    paidAmount: number;
    drawerAmount?: number; // informational فقط (المالية بتقرأ من المصاريف)
    description: string | null;
    actorId: number | null;
    actorName: string | null;
  }): void {
    const supplier = this.findRow(params.supplierId);
    if (!supplier) throw new Error("المورد غير موجود");
    const debt = Number((params.totalCost - params.paidAmount).toFixed(2));
    if (debt <= 0) return; // مفيش دين (اتدفع كامل)
    this.writeTx({
      supplier,
      type: "purchase",
      totalAmount: params.totalCost,
      paidAmount: params.paidAmount,
      drawerAmount: params.drawerAmount ?? 0,
      balanceChange: debt,
      description: params.description,
      actorId: params.actorId,
      actorName: params.actorName,
    });
  }

  // تسجيل دفعة لمورد: بتقلّل رصيده، واللي خرج من الدرج بيتسجّل في المالية.
  recordPayment(
    input: RecordSupplierPaymentInput,
    actorId: number | null,
    actorName: string | null
  ): SupplierDTO {
    const supplier = this.findRow(input.supplier_id);
    if (!supplier) throw new Error("المورد غير موجود");
    const amount = Number(input.amount);
    if (!(amount > 0)) throw new Error("اكتب مبلغ الدفعة");
    const drawer = Math.max(0, Number(input.drawer_amount) || 0);
    if (drawer > amount) {
      throw new Error("اللي خرج من الدرج مينفعش يكون أكبر من الدفعة");
    }
    const drawerOwnerId = input.drawer_owner_id ?? null;
    if (drawer > 0 && !drawerOwnerId) {
      throw new Error("حدّد الفلوس خرجت من درج مين");
    }

    return this.transaction(() => {
      this.writeTx({
        supplier,
        type: "payment",
        totalAmount: amount,
        paidAmount: amount,
        drawerAmount: drawer,
        balanceChange: -amount,
        description: input.notes?.trim() || null,
        actorId,
        actorName,
      });

      // فلوس خرجت من الدرج → مصروف (يدخل المالية زي مصاريف البضاعة)
      if (drawer > 0) {
        expensesRepository.createSupplierPaymentExpense({
          supplierName: supplier.name,
          amount,
          drawerAmount: drawer,
          drawerOwnerId,
          actorId,
        });
      }

      return this.toDTO(this.findRow(input.supplier_id)!);
    });
  }

  getLedger(supplierId: number): SupplierLedger {
    const supplier = this.findRow(supplierId);
    if (!supplier) throw new Error("المورد غير موجود");

    const rows = this.db
      .prepare(
        `SELECT * FROM supplier_transactions
         WHERE supplier_id = ? AND is_deleted = 0
         ORDER BY id DESC`
      )
      .all(supplierId) as SupplierTransactionRow[];

    const transactions = rows.map((r) => this.toTxDTO(r));
    const total_purchased = rows
      .filter((r) => r.type === "purchase")
      .reduce((s, r) => s + r.balance_change, 0);
    const total_paid = rows
      .filter((r) => r.type === "payment")
      .reduce((s, r) => s + r.paid_amount, 0);

    return {
      supplier: this.toDTO(supplier),
      transactions,
      total_purchased: Number(total_purchased.toFixed(2)),
      total_paid: Number(total_paid.toFixed(2)),
    };
  }
}

export const suppliersRepository = new SuppliersRepository();
