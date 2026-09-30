import { ipcMain } from "electron";
import { customersRepository } from "../repositories/customers.repository";
import { auditRepository } from "../repositories/audit.repository";
import { usersRepository } from "../repositories/users.repository";
import { getCurrentActor } from "./session";
import type { IpcResult } from "../../types/ipc.types";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerListQuery,
  CustomerOrdersQuery,
} from "../../shared/customers";

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

// تعديل/حذف العميل = مدير/مالك فقط — نتأكد في الـ Main مش الواجهة بس (حماية حقيقية)
function requireCustomerEdit(): void {
  const actor = getCurrentActor();
  const perms = actor != null ? usersRepository.getById(actor)?.permissions : null;
  if (!perms?.canEditCustomers) {
    throw new Error("تعديل أو حذف العملاء للمدير أو المالك بس");
  }
}

export function registerCustomersIpc(): void {
  ipcMain.handle("customers:getAll", (_e, query: CustomerListQuery) =>
    handle(() => customersRepository.getAll(query ?? {}))
  );

  ipcMain.handle("customers:search", (_e, term: string) =>
    handle(() => customersRepository.search(term))
  );

  ipcMain.handle("customers:getById", (_e, id: number) =>
    handle(() => customersRepository.getById(id))
  );

  ipcMain.handle("customers:getOrders", (_e, query: CustomerOrdersQuery) =>
    handle(() => customersRepository.getOrders(query))
  );

  ipcMain.handle("customers:getFreeItems", (_e, customerId: number) =>
    handle(() => customersRepository.getFreeOrders(customerId))
  );

  ipcMain.handle("customers:getAbsent", () =>
    handle(() => customersRepository.getAbsent())
  );

  ipcMain.handle("customers:create", (_e, input: CreateCustomerInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const created = customersRepository.create(input, actor);
      auditRepository.log({
        userId: actor ?? created.id,
        userName: actorName(),
        action: `إضافة عميل: ${created.name}`,
        entityType: "customer",
        entityId: created.id,
        newValue: { name: created.name, phone: created.phone },
      });
      return created;
    })
  );

  ipcMain.handle(
    "customers:findOrCreateByPhone",
    (_e, input: { phone: string; name?: string | null }) =>
      handle(() => {
        const actor = getCurrentActor();
        return customersRepository.findOrCreateByPhone(
          input.phone,
          input.name ?? null,
          actor
        );
      })
  );

  ipcMain.handle("customers:update", (_e, input: UpdateCustomerInput) =>
    handle(() => {
      requireCustomerEdit();
      const actor = getCurrentActor();
      const before = customersRepository.getById(input.id);
      const updated = customersRepository.update(input, actor);
      auditRepository.log({
        userId: actor ?? updated.id,
        userName: actorName(),
        action: `تعديل عميل: ${updated.name}`,
        entityType: "customer",
        entityId: updated.id,
        oldValue: before,
        newValue: updated,
      });
      return updated;
    })
  );

  ipcMain.handle("customers:delete", (_e, id: number) =>
    handle(() => {
      requireCustomerEdit();
      const actor = getCurrentActor();
      const before = customersRepository.getById(id);
      const ok = customersRepository.softDelete(id, actor);
      auditRepository.log({
        userId: actor ?? id,
        userName: actorName(),
        action: `حذف عميل: ${before?.name ?? id}`,
        entityType: "customer",
        entityId: id,
        oldValue: before,
      });
      return ok;
    })
  );
}
