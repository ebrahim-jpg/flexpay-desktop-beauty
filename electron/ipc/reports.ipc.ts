import { ipcMain } from "electron";
import { reportsRepository } from "../repositories/reports.repository";
import { settingsRepository } from "../repositories/settings.repository";
import { printReceipt } from "../lib/printer";
import { buildSalesSummaryHtml } from "../lib/report-receipt-html";
import { requireReports } from "./access";
import type { IpcResult } from "../../types/ipc.types";
import type { SalesSummaryPrintData } from "../../shared/reports";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

async function handleAsync<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

// كل التقارير للمدير/المالك بس (canViewReports) — الفحص هنا في الـmain مش في الواجهة بس
export function registerReportsIpc(): void {
  ipcMain.handle("reports:getSalesByDay", (_e, businessDate: string) =>
    handle(() => (requireReports(), reportsRepository.getSalesByDay(businessDate)))
  );

  ipcMain.handle("reports:getSalesSummary", () =>
    handle(() => (requireReports(), reportsRepository.getSalesSummary()))
  );

  ipcMain.handle("reports:getInventoryStatus", () =>
    handle(() => (requireReports(), reportsRepository.getInventoryStatus()))
  );

  ipcMain.handle("reports:getInventoryMovements", (_e, itemId: number) =>
    handle(() => (requireReports(), reportsRepository.getInventoryMovements(itemId)))
  );

  // طباعة ملخص المبيعات كورقة حرارية (بدل طباعة كل الفواتير)
  ipcMain.handle("reports:printSalesSummary", (_e, data: SalesSummaryPrintData) =>
    handleAsync(async () => {
      requireReports();
      const settings = settingsRepository.get();
      const html = buildSalesSummaryHtml(data, {
        shopName: settings.shopName,
        currencySymbol: settings.currencySymbol,
      });
      return printReceipt(html, settings.printerName);
    })
  );
}
