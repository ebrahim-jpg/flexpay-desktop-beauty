import { ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { getDatabase } from "../database/connection";
import { getUserDataDir } from "../app-paths";
import { getMainWindow } from "../main-window";
import { productsRepository } from "../repositories/products.repository";
import { customersRepository } from "../repositories/customers.repository";
import { categoriesRepository } from "../repositories/categories.repository";
import {
  readProductRows,
  readCustomerRows,
  writeProducts,
  writeCustomers,
  writeProductTemplate,
  writeCustomerTemplate,
} from "../lib/data-transfer/excel";
import {
  planProducts,
  planCustomers,
  applyProducts,
  applyCustomers,
  type ProductRow,
  type CustomerRow,
} from "../lib/data-transfer/import";
import type { IpcResult } from "../../types/ipc.types";
import type { ProductPlan, CustomerPlan, ImportResult } from "../../shared/data-transfer";

async function handleAsync<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "حصل خطأ غير متوقع" };
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

const XLSX = [{ name: "Excel", extensions: ["xlsx"] }];

async function pickOpen(title: string): Promise<string | null> {
  const win = getMainWindow();
  const opts = { title, filters: XLSX, properties: ["openFile" as const] };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
}

async function pickSave(title: string, defaultName: string): Promise<string | null> {
  const win = getMainWindow();
  const opts = { title, defaultPath: defaultName, filters: XLSX };
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  return res.canceled || !res.filePath ? null : res.filePath;
}

/**
 * نسخة أمان تلقائية قبل أي تنفيذ استيراد.
 *
 * ⚠️ **فيه محلات شغّالة على بيانات حقيقية.** الاستيراد بيغيّر أسعار، وملف غلط
 * ممكن يقلب قايمة الأسعار. النسخة دي بتخلّي أي استيراد قابل للرجوع منه —
 * بتستعمل نفس `backup()` المستخدمة في النسخ الاحتياطي اليدوي (آمنة مع WAL).
 *
 * بتتحفظ جنب الداتابيز باسم فيه التاريخ، ومسارها بيرجع للمستخدم عشان يعرف
 * يلاقيها.
 */
async function autoBackup(kind: string): Promise<string | null> {
  try {
    const dir = path.join(getUserDataDir(), "auto-backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `before-import-${kind}-${stamp()}.fpbackup`);
    await getDatabase().backup(file);
    return file;
  } catch {
    // ⚠️ فشل النسخة **مايوقفش** الاستيراد — بس بيرجع null والواجهة بتحذّر.
    // إيقاف الاستيراد عشان القرص مليان مثلاً بيمنع المستخدم من شغل مشروع.
    return null;
  }
}

export function registerDataTransferIpc(): void {
  // ===== المنتجات =====

  ipcMain.handle("data:products:plan", () =>
    handleAsync<{ plan: ProductPlan; rows: ProductRow[]; file: string } | null>(async () => {
      const file = await pickOpen("اختار ملف المنتجات");
      if (!file) return null;
      const { rows, unknownHeaders } = await readProductRows(file);
      return { plan: planProducts(rows, unknownHeaders), rows, file };
    })
  );

  ipcMain.handle("data:products:apply", (_e, payload: { rows: ProductRow[]; actorId: number | null }) =>
    handleAsync<ImportResult>(async () => {
      const backupPath = await autoBackup("products");
      const res = applyProducts(payload.rows, payload.actorId ?? null);
      return { ...res, backupPath };
    })
  );

  ipcMain.handle("data:products:export", (_e, categoryId: number | null) =>
    handleAsync<string | null>(async () => {
      const cat = categoryId != null ? categoriesRepository.getAll().find((c) => c.id === categoryId) : null;
      const suffix = cat ? `-${cat.name}` : "";
      const file = await pickSave("تصدير الخدمات", `خدمات${suffix}-${stamp()}.xlsx`);
      if (!file) return null;
      const items =
        categoryId != null
          ? productsRepository.getByCategory(categoryId)
          : productsRepository.getAll();
      await writeProducts(
        file,
        items.map((p) => ({
          name: p.name,
          price: p.price,
          cost_price: p.cost_price,
          barcode: p.barcode,
          category_name: p.category_name,
        }))
      );
      return file;
    })
  );

  ipcMain.handle("data:products:template", () =>
    handleAsync<string | null>(async () => {
      const file = await pickSave("حفظ قالب الخدمات", "قالب-الخدمات.xlsx");
      if (!file) return null;
      await writeProductTemplate(file);
      return file;
    })
  );

  // ===== العملاء =====

  ipcMain.handle("data:customers:plan", () =>
    handleAsync<{ plan: CustomerPlan; rows: CustomerRow[]; file: string } | null>(async () => {
      const file = await pickOpen("اختار ملف العملاء");
      if (!file) return null;
      const { rows, unknownHeaders } = await readCustomerRows(file);
      return { plan: planCustomers(rows, unknownHeaders), rows, file };
    })
  );

  ipcMain.handle("data:customers:apply", (_e, payload: { rows: CustomerPlan["rows"]; actorId: number | null }) =>
    handleAsync<ImportResult>(async () => {
      const backupPath = await autoBackup("customers");
      const res = applyCustomers(payload.rows, payload.actorId ?? null);
      return { ...res, backupPath };
    })
  );

  ipcMain.handle("data:customers:export", () =>
    handleAsync<string | null>(async () => {
      const file = await pickSave("تصدير العملاء", `عملاء-${stamp()}.xlsx`);
      if (!file) return null;
      const rows = getDatabase()
        .prepare("SELECT name, phone FROM customers WHERE is_deleted = 0 ORDER BY name")
        .all() as { name: string; phone: string | null }[];
      await writeCustomers(file, rows);
      return file;
    })
  );

  ipcMain.handle("data:customers:template", () =>
    handleAsync<string | null>(async () => {
      const file = await pickSave("حفظ قالب العملاء", "قالب-العملاء.xlsx");
      if (!file) return null;
      await writeCustomerTemplate(file);
      return file;
    })
  );
}
