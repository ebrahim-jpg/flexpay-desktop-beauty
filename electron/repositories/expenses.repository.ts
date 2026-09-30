import { BaseRepository } from "./base.repository";
import { businessDateKey, shiftDateKey } from "../../shared/business-day";
import { assertPositive } from "../../shared/validation";
import type { ExpenseRow } from "../../types/database.types";
import type {
  ExpenseDTO,
  CreateExpenseInput,
  ExpensesQuery,
  ExpensesSummary,
  ExpenseCategory,
  ExpenseCategorySummary,
  RecurrenceType,
  CashierNetDTO,
} from "../../shared/management";

export class ExpensesRepository extends BaseRepository {
  private businessDayStart(): number {
    const row = this.db
      .prepare("SELECT business_day_start FROM settings WHERE id = 1")
      .get() as { business_day_start: number } | undefined;
    return row?.business_day_start ?? 0;
  }

  private today(): string {
    return businessDateKey(new Date(), this.businessDayStart());
  }

  private userName(userId: number | null): string {
    if (userId == null) return "النظام";
    const row = this.db
      .prepare("SELECT name FROM users WHERE id = ?")
      .get(userId) as { name: string } | undefined;
    return row?.name ?? "النظام";
  }

  private toDTO(row: ExpenseRow): ExpenseDTO {
    return {
      id: row.id,
      local_id: row.local_id,
      category: row.category as ExpenseCategory,
      description: row.description,
      amount: row.amount,
      drawer_amount: row.drawer_amount,
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      inventory_item_id: row.inventory_item_id,
      inventory_item_name: row.inventory_item_name,
      is_recurring: row.is_recurring === 1,
      recurrence_type: (row.recurrence_type as RecurrenceType | null) ?? null,
      expense_date: row.expense_date,
      created_by: row.created_by,
      created_by_name: row.created_by_name,
      created_at: row.created_at,
      is_auto: row.category === "inventory",
    };
  }

  private findRow(id: number): ExpenseRow | null {
    const row = this.db
      .prepare("SELECT * FROM expenses WHERE id = ? AND is_deleted = 0")
      .get(id) as ExpenseRow | undefined;
    return row ?? null;
  }

  getToday(): ExpenseDTO[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM expenses WHERE expense_date = ? AND is_deleted = 0 ORDER BY created_at DESC"
      )
      .all(this.today()) as ExpenseRow[];
    return rows.map((r) => this.toDTO(r));
  }

  getLast30Days(query: ExpensesQuery): ExpenseDTO[] {
    const today = this.today();
    const floor = shiftDateKey(today, -29);
    const from = query.dateFrom && query.dateFrom > floor ? query.dateFrom : floor;
    const to = query.dateTo && query.dateTo < today ? query.dateTo : today;

    const params: unknown[] = [from, to];
    let where = "expense_date >= ? AND expense_date <= ? AND is_deleted = 0";
    if (query.category && query.category !== "all") {
      where += " AND category = ?";
      params.push(query.category);
    }
    const rows = this.db
      .prepare(`SELECT * FROM expenses WHERE ${where} ORDER BY expense_date DESC, created_at DESC`)
      .all(...params) as ExpenseRow[];
    return rows.map((r) => this.toDTO(r));
  }

  // صافي كاش وردية الكاشير النهارده (نفس معادلة تقرير المبيعات: مبيعات مدفوعة غير مجانية − مصاريف الدرج)
  getCashierNet(cashierId: number): CashierNetDTO {
    const day = this.today();
    const rev = this.db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS t FROM orders
         WHERE cashier_id = ? AND business_date = ? AND is_deleted = 0 AND status = 'paid' AND is_free = 0`
      )
      .get(cashierId, day) as { t: number };
    const exp = this.db
      .prepare(
        `SELECT COALESCE(SUM(drawer_amount), 0) AS t FROM expenses
         WHERE created_by = ? AND expense_date = ? AND is_deleted = 0`
      )
      .get(cashierId, day) as { t: number };
    return {
      cashier_id: cashierId,
      cashier_name: this.userName(cashierId),
      revenue: rev.t,
      expenses: exp.t,
      net: rev.t - exp.t,
    };
  }

  // حماية: الفلوس الخارجة من درج كاشير مينفعش تتعدى صافيه الحالي (الدرج مايطلعش أكتر مما فيه).
  // بتتنادى قبل أي خروج فلوس (مصروف يدوي/توريد/دفعة مورد/فاتورة توريد).
  assertDrawerWithinNet(cashierId: number | null | undefined, drawerAmount: number): void {
    if (!(drawerAmount > 0) || !cashierId) return;
    const info = this.getCashierNet(cashierId);
    if (drawerAmount > info.net + 0.001) {
      // أمان: مفيش أي رقم للصافي في الرسالة — الكاشير مايعرفش صافيه إلا من المدير وقت التقفيل.
      throw new Error(
        `المبلغ ده أكبر من اللي متاح في درج ${info.cashier_name}. ` +
          `مينفعش يخرج من الدرج فلوس أكتر من اللي دخله. راجع مع المدير أو اقفل الوردية الأول.`
      );
    }
  }

  create(input: CreateExpenseInput, actorId: number, actorName: string): ExpenseDTO {
    // حراسة: مبلغ المصروف لازم أكبر من صفر (مصروف سالب = فلوس تتضاف للدرج — ثغرة)
    assertPositive(input.amount, "مبلغ المصروف");
    if (input.category === "staff" && !input.staff_id) {
      throw new Error("اختر الموظف");
    }
    const staffName = input.staff_id ? this.userName(input.staff_id) : null;
    // صاحب الدرج اللي خرجت منه الفلوس (وإلا اليوزر المسجّل). المصروف اليدوي كله بيخرج من الدرج.
    // ملاحظة: حماية «الدرج مايطلعش أكتر مما فيه» بتتفرض في طبقة الـIPC (نقطة دخول الواجهة).
    const ownerId = input.drawer_owner_id ?? actorId;
    const ownerName = this.userName(ownerId);
    const localId = this.newLocalId();
    const now = this.now();
    const expenseDate = this.today();

    return this.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO expenses (
            local_id, category, description, amount, drawer_amount,
            staff_id, staff_name, is_recurring, recurrence_type,
            expense_date, created_by, created_by_name,
            recorded_by_id, recorded_by_name, created_at, sync_status
          ) VALUES (
            @local_id, @category, @description, @amount, @drawer,
            @staff_id, @staff_name, @recurring, @recurrence,
            @date, @owner, @owner_name,
            @recorded, @recorded_name, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          category: input.category,
          description: input.description,
          amount: input.amount,
          drawer: input.amount, // المصروف اليدوي كله خرج من الدرج
          staff_id: input.staff_id ?? null,
          staff_name: staffName,
          recurring: input.is_recurring ? 1 : 0,
          recurrence: input.is_recurring ? input.recurrence_type ?? null : null,
          date: expenseDate,
          owner: ownerId, // created_by = صاحب الدرج (للتقفيل الصح)
          owner_name: ownerName,
          recorded: actorId, // مين سجّل فعلياً (تدقيق)
          recorded_name: actorName,
          now,
        });
      const created = this.findRow(Number(result.lastInsertRowid))!;
      this.enqueue("expense", "CREATED", localId, this.toSyncPayload(created));
      return this.toDTO(created);
    });
  }

  // يُنشأ تلقائياً من inventory:restock عند drawer_amount > 0
  createInventoryExpense(params: {
    itemId?: number | null;
    itemName?: string | null;
    totalCost: number;
    drawerAmount: number;
    ownerPaid?: number; // المدفوع من غير الدرج (فلوس المالك) — يدخل الصافي مش تقفيل أي درج
    drawerOwnerId?: number | null; // درج/وردية مين خرجت الفلوس (تتنسبله) — وإلا اللي سجّل
    description: string;
    actorId: number | null; // مين سجّل فعلياً (المدير)
  }): void {
    const localId = this.newLocalId();
    const now = this.now();
    // created_by = صاحب الدرج (لو محدد) عشان التقفيل يطلع صح؛ recorded_by = اللي سجّل (تدقيق)
    const shiftId = params.drawerOwnerId ?? params.actorId ?? 0;
    const result = this.db
      .prepare(
        `INSERT INTO expenses (
          local_id, category, description, amount, drawer_amount, owner_paid_amount,
          inventory_item_id, inventory_item_name, is_recurring,
          expense_date, created_by, created_by_name,
          recorded_by_id, recorded_by_name, created_at, sync_status
        ) VALUES (
          @local_id, 'inventory', @description, @amount, @drawer, @owner_paid,
          @item_id, @item_name, 0,
          @date, @shift, @shift_name,
          @recorded, @recorded_name, @now, 'pending'
        )`
      )
      .run({
        local_id: localId,
        description: params.description,
        amount: params.totalCost,
        drawer: params.drawerAmount,
        owner_paid: Math.max(0, params.ownerPaid ?? 0),
        item_id: params.itemId ?? null,
        item_name: params.itemName ?? null,
        date: this.today(),
        shift: shiftId,
        shift_name: this.userName(shiftId),
        recorded: params.actorId ?? null,
        recorded_name: this.userName(params.actorId),
        now,
      });
    const created = this.findRow(Number(result.lastInsertRowid));
    if (created) {
      this.enqueue("expense", "CREATED", localId, this.toSyncPayload(created));
    }
  }

  // يُنشأ تلقائياً عند تسجيل دفعة لمورد فيها فلوس خرجت من الدرج
  createSupplierPaymentExpense(params: {
    supplierName: string;
    amount: number; // إجمالي الدفعة (informational)
    drawerAmount: number; // اللي خرج من الدرج فعلاً
    drawerOwnerId?: number | null; // درج/وردية مين خرجت الفلوس (تتنسبله)
    actorId: number | null; // مين سجّل فعلاً (المدير)
  }): void {
    const localId = this.newLocalId();
    const now = this.now();
    // created_by = صاحب الدرج (لو محدد) عشان تقفيله يطلع صح؛ recorded_by = اللي سجّل
    const shiftId = params.drawerOwnerId ?? params.actorId ?? 0;
    const result = this.db
      .prepare(
        `INSERT INTO expenses (
          local_id, category, description, amount, drawer_amount,
          is_recurring, expense_date, created_by, created_by_name,
          recorded_by_id, recorded_by_name, created_at, sync_status
        ) VALUES (
          @local_id, 'inventory', @description, @amount, @drawer,
          0, @date, @shift, @shift_name,
          @recorded, @recorded_name, @now, 'pending'
        )`
      )
      .run({
        local_id: localId,
        description: `دفعة لمورد: ${params.supplierName}`,
        amount: params.amount,
        drawer: params.drawerAmount,
        date: this.today(),
        shift: shiftId,
        shift_name: this.userName(shiftId),
        recorded: params.actorId ?? null,
        recorded_name: this.userName(params.actorId),
        now,
      });
    const created = this.findRow(Number(result.lastInsertRowid));
    if (created) {
      this.enqueue("expense", "CREATED", localId, this.toSyncPayload(created));
    }
  }

  softDelete(id: number, actorId: number | null): boolean {
    const existing = this.findRow(id);
    if (!existing) throw new Error("المصروف غير موجود");
    if (existing.category === "inventory") {
      throw new Error("مصروف البضاعة التلقائي مينفعش يتحذف");
    }
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE expenses SET is_deleted = 1, deleted_by = @actor, deleted_at = @now, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, actor: actorId, now: this.now() });
      this.enqueue("expense", "DELETED", existing.local_id, {
        local_id: existing.local_id,
      });
      return true;
    });
  }

  getDailySummary(date: string): ExpensesSummary {
    const rows = this.db
      .prepare(
        `SELECT category, COALESCE(SUM(drawer_amount), 0) AS total
         FROM expenses WHERE expense_date = ? AND is_deleted = 0
         GROUP BY category`
      )
      .all(date) as { category: string; total: number }[];

    const byCategory: ExpenseCategorySummary[] = rows.map((r) => ({
      category: r.category as ExpenseCategory,
      total: r.total,
    }));
    const total = byCategory.reduce((s, c) => s + c.total, 0);

    return { date, by_category: byCategory, total_drawer: total };
  }

  private toSyncPayload(row: ExpenseRow) {
    return {
      id: row.id,
      local_id: row.local_id,
      category: row.category,
      description: row.description,
      amount: row.amount,
      drawer_amount: row.drawer_amount,
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      inventory_item_id: row.inventory_item_id,
      inventory_item_name: row.inventory_item_name,
      is_recurring: row.is_recurring === 1,
      recurrence_type: row.recurrence_type,
      expense_date: row.expense_date,
      created_by: row.created_by,
      created_by_name: row.created_by_name,
      recorded_by_id: row.recorded_by_id,
      recorded_by_name: row.recorded_by_name,
      owner_paid_amount: row.owner_paid_amount ?? 0,
      created_at: row.created_at,
    };
  }
}

export const expensesRepository = new ExpensesRepository();
