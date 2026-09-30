import { ipcMain } from "electron";
import { inventoryRepository } from "../repositories/inventory.repository";
import { suppliersRepository } from "../repositories/suppliers.repository";
import { expensesRepository } from "../repositories/expenses.repository";
import { auditRepository } from "../repositories/audit.repository";
import { usersRepository } from "../repositories/users.repository";
import { getCurrentActor } from "./session";
import type { IpcResult } from "../../types/ipc.types";
import type {
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  RestockInput,
  WasteInput,
  CreateSupplierInput,
  UpdateSupplierInput,
  RecordSupplierPaymentInput,
  DeductForOrderInput,
} from "../../shared/inventory";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

function actorName(): string {
  const actor = getCurrentActor();
  if (actor == null) return "النظام";
  return usersRepository.getById(actor)?.name ?? "النظام";
}

function audit(
  action: string,
  entityType: string,
  entityId: number,
  values?: { oldValue?: unknown; newValue?: unknown }
): void {
  auditRepository.log({
    userId: getCurrentActor() ?? 0,
    userName: actorName(),
    action,
    entityType,
    entityId,
    oldValue: values?.oldValue,
    newValue: values?.newValue,
  });
}

export function registerInventoryIpc(): void {
  // ===== المخزون =====
  ipcMain.handle("inventory:getAll", () =>
    handle(() => inventoryRepository.getAll())
  );

  ipcMain.handle("inventory:getAlerts", () =>
    handle(() => inventoryRepository.getAlerts())
  );

  ipcMain.handle("inventory:getById", (_e, id: number) =>
    handle(() => inventoryRepository.getById(id))
  );

  ipcMain.handle("inventory:getLowRange", (_e, id: number) =>
    handle(() => inventoryRepository.getLowRange(id))
  );

  ipcMain.handle("inventory:create", (_e, input: CreateInventoryItemInput) =>
    handle(() => {
      const created = inventoryRepository.create(input, getCurrentActor());
      audit(`إضافة مادة مخزون: ${created.name}`, "inventory_item", created.id, {
        newValue: created,
      });
      return created;
    })
  );

  ipcMain.handle("inventory:update", (_e, input: UpdateInventoryItemInput) =>
    handle(() => {
      const before = inventoryRepository.getById(input.id);
      const updated = inventoryRepository.update(input, getCurrentActor());
      audit(`تعديل مادة مخزون: ${updated.name}`, "inventory_item", updated.id, {
        oldValue: before,
        newValue: updated,
      });
      return updated;
    })
  );

  ipcMain.handle("inventory:delete", (_e, id: number) =>
    handle(() => {
      const before = inventoryRepository.getById(id);
      const ok = inventoryRepository.softDelete(id, getCurrentActor());
      audit(`حذف مادة مخزون: ${before?.name ?? id}`, "inventory_item", id, {
        oldValue: before,
      });
      return ok;
    })
  );

  ipcMain.handle("inventory:restock", (_e, input: RestockInput) =>
    handle(() => {
      // حماية الدرج: اللي يخرج مايتعداش صافي درج الكاشير الحالي
      expensesRepository.assertDrawerWithinNet(input.drawer_owner_id, input.drawer_amount ?? 0);
      const updated = inventoryRepository.restock(
        input.id,
        input.quantity,
        input.notes ?? null,
        getCurrentActor(),
        input.cost_per_unit,
        input.drawer_amount,
        input.payment_type,
        input.paid_amount,
        input.supplier_id,
        input.drawer_owner_id
      );
      audit(
        `إضافة كمية مخزون: ${updated.name} (+${input.quantity})` +
          (input.payment_type === "credit" ? " — آجل" : "") +
          (input.drawer_amount ? ` — خرج ${input.drawer_amount} من الدرج` : ""),
        "inventory_item",
        updated.id
      );
      return updated;
    })
  );

  ipcMain.handle("inventory:adjustWaste", (_e, input: WasteInput) =>
    handle(() => {
      const before = inventoryRepository.getById(input.id); // الكمية والتكلفة قبل الهالك
      const updated = inventoryRepository.adjustWaste(
        input.id,
        input.quantity,
        input.reason,
        getCurrentActor()
      );
      const wasteValue = (before?.cost_per_unit ?? 0) * input.quantity;
      audit(
        `تسجيل هالك: ${updated.name} (-${input.quantity}) — ${input.reason}`,
        "inventory_item",
        updated.id,
        {
          oldValue: {
            name: updated.name,
            current_quantity: before?.current_quantity ?? null,
            cost_per_unit: before?.cost_per_unit ?? null,
          },
          newValue: {
            current_quantity: updated.current_quantity,
            wasted_qty: input.quantity,
            waste_value: wasteValue,
            reason: input.reason,
          },
        }
      );
      return updated;
    })
  );

  ipcMain.handle(
    "inventory:getTransactions",
    (_e, input: { itemId: number; page?: number; pageSize?: number }) =>
      handle(() =>
        inventoryRepository.getTransactions(
          input.itemId,
          input.page ?? 1,
          input.pageSize ?? 20
        )
      )
  );

  ipcMain.handle("inventory:deductForOrder", (_e, input: DeductForOrderInput) =>
    handle(() =>
      inventoryRepository.deductForOrder(
        input.orderId,
        input.items,
        getCurrentActor()
      )
    )
  );

  // ===== الموردين =====
  ipcMain.handle("suppliers:getAll", () =>
    handle(() => suppliersRepository.getAll())
  );

  ipcMain.handle("suppliers:create", (_e, input: CreateSupplierInput) =>
    handle(() => {
      const created = suppliersRepository.create(input, getCurrentActor());
      audit(`إضافة مورد: ${created.name}`, "supplier", created.id, {
        newValue: created,
      });
      return created;
    })
  );

  ipcMain.handle("suppliers:update", (_e, input: UpdateSupplierInput) =>
    handle(() => {
      const before = suppliersRepository.getById(input.id);
      const updated = suppliersRepository.update(input, getCurrentActor());
      audit(`تعديل مورد: ${updated.name}`, "supplier", updated.id, {
        oldValue: before,
        newValue: updated,
      });
      return updated;
    })
  );

  ipcMain.handle("suppliers:delete", (_e, id: number) =>
    handle(() => {
      const before = suppliersRepository.getById(id);
      const ok = suppliersRepository.softDelete(id, getCurrentActor());
      audit(`حذف مورد: ${before?.name ?? id}`, "supplier", id, {
        oldValue: before,
      });
      return ok;
    })
  );

  ipcMain.handle("suppliers:getLedger", (_e, supplierId: number) =>
    handle(() => suppliersRepository.getLedger(supplierId))
  );

  ipcMain.handle("suppliers:recordPayment", (_e, input: RecordSupplierPaymentInput) =>
    handle(() => {
      // حماية الدرج: اللي يخرج مايتعداش صافي درج الكاشير الحالي
      expensesRepository.assertDrawerWithinNet(input.drawer_owner_id, input.drawer_amount ?? 0);
      const updated = suppliersRepository.recordPayment(
        input,
        getCurrentActor(),
        actorName()
      );
      audit(
        `دفعة لمورد: ${updated.name} (${input.amount})` +
          (input.drawer_amount ? ` — خرج ${input.drawer_amount} من الدرج` : ""),
        "supplier",
        updated.id,
        { newValue: { amount: input.amount, balance: updated.balance } }
      );
      return updated;
    })
  );
}
