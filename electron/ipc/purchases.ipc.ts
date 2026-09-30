import { ipcMain } from "electron";
import { purchasesRepository } from "../repositories/purchases.repository";
import { expensesRepository } from "../repositories/expenses.repository";
import { getCurrentActor } from "./session";
import type { IpcResult } from "../../types/ipc.types";
import type { CreatePurchaseInvoiceInput } from "../../shared/purchases";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "حصل خطأ غير متوقع" };
  }
}

export function registerPurchasesIpc(): void {
  ipcMain.handle("purchases:createInvoice", (_e, input: CreatePurchaseInvoiceInput) =>
    handle(() => {
      // حماية الدرج: اللي يخرج مايتعداش صافي درج الكاشير الحالي
      expensesRepository.assertDrawerWithinNet(input.drawer_owner_id, input.drawer_amount ?? 0);
      return purchasesRepository.createInvoice(input, getCurrentActor());
    })
  );

  ipcMain.handle("purchases:getInvoices", () =>
    handle(() => purchasesRepository.getInvoices(100))
  );

  ipcMain.handle("purchases:getInvoiceById", (_e, id: number) =>
    handle(() => purchasesRepository.getInvoiceById(id))
  );
}
