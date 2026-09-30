import { ipcMain } from "electron";
import { expensesRepository } from "../repositories/expenses.repository";
import { auditRepository } from "../repositories/audit.repository";
import { usersRepository } from "../repositories/users.repository";
import { getCurrentActor } from "./session";
import { EXPENSE_CATEGORY_LABELS } from "../../shared/management";
import type { IpcResult } from "../../types/ipc.types";
import type { CreateExpenseInput, ExpensesQuery } from "../../shared/management";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

export function registerExpensesIpc(): void {
  ipcMain.handle("expenses:getToday", () =>
    handle(() => expensesRepository.getToday())
  );

  ipcMain.handle("expenses:getLast30Days", (_e, query: ExpensesQuery) =>
    handle(() => expensesRepository.getLast30Days(query ?? {}))
  );

  ipcMain.handle("expenses:getDailySummary", (_e, input: { date: string }) =>
    handle(() => expensesRepository.getDailySummary(input.date))
  );

  // صافي كاش وردية كاشير النهارده — لحماية «الدرج مايطلعش أكتر مما فيه» في الواجهات
  ipcMain.handle("expenses:getCashierNet", (_e, cashierId: number) =>
    handle(() => expensesRepository.getCashierNet(cashierId))
  );

  ipcMain.handle("expenses:create", (_e, input: CreateExpenseInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const user = actor ? usersRepository.getById(actor) : null;
      if (!user || !user.permissions.canManageExpenses) {
        throw new Error("مالكش صلاحية تسجيل المصاريف");
      }
      const actorName = user.name;
      // حماية الدرج: المصروف اليدوي مايطلعش أكتر من صافي درج صاحبه (وإلا اليوزر المسجّل)
      expensesRepository.assertDrawerWithinNet(input.drawer_owner_id ?? actor ?? 0, input.amount);
      const created = expensesRepository.create(input, actor ?? 0, actorName);
      auditRepository.log({
        userId: actor ?? 0,
        userName: actorName,
        action: `إضافة مصروف: ${EXPENSE_CATEGORY_LABELS[created.category]} (${created.amount})`,
        entityType: "expense",
        entityId: created.id,
        newValue: {
          category: created.category,
          amount: created.amount,
          description: created.description,
        },
      });
      return created;
    })
  );

  ipcMain.handle("expenses:delete", (_e, id: number) =>
    handle(() => {
      const actor = getCurrentActor();
      const user = actor ? usersRepository.getById(actor) : null;
      // الحذف للمالك فقط
      if (!user || user.role !== "owner") {
        throw new Error("حذف المصاريف للمالك فقط");
      }
      const ok = expensesRepository.softDelete(id, actor);
      auditRepository.log({
        userId: actor ?? 0,
        userName: user.name,
        action: `حذف مصروف #${id}`,
        entityType: "expense",
        entityId: id,
      });
      return ok;
    })
  );
}
