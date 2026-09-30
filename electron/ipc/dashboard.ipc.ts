import { ipcMain } from "electron";
import { reportsRepository } from "../repositories/reports.repository";
import { can, requireActor } from "./access";
import type { IpcResult } from "../../types/ipc.types";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

export function registerDashboardIpc(): void {
  ipcMain.handle("dashboard:getTodaySummary", () =>
    handle(() => {
      const user = requireActor();
      const summary = reportsRepository.getTodaySummary();
      if (can(user, "canViewReports")) return summary;
      // موظف الصالة: كروت المخزون والمصاريف والتنبيهات بس — أرقام المبيعات مابتطلعش من الـmain أصلاً
      return {
        ...summary,
        todaySales: 0,
        todayOrders: 0,
        avgOrderValue: 0,
        newCustomers: 0,
        todayNet: 0,
        recentOrders: [],
      };
    })
  );
}
