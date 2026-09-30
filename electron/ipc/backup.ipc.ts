import { ipcMain, dialog, app } from "electron";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { getDatabase } from "../database/connection";
import { getUserDataDir } from "../app-paths";
import { getMainWindow } from "../main-window";
import type { IpcResult } from "../../types/ipc.types";

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
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

// مجال النسخة دي — لازم يطابق ختم migration 033 في قاعدة البيانات («كافيه» بس).
// ⚠️ مش "gaming" ولا "gaming_cafe": كل نسخة برنامج منفصل ببيانات مستقلة (قرار صاحب المشروع).
const VERTICAL = "restaurant";

function openBackup(file: string): Database.Database {
  try {
    return new Database(file, { readonly: true, fileMustExist: true });
  } catch {
    throw new Error("الملف مش قاعدة بيانات صالحة");
  }
}

// تحقق إن الملف قاعدة FlexPay صالحة **ومن نفس المجال**.
// حارس المجال ضروري: من غيره نسخة محل تجزئة بتترستور جوّه البلايستيشن (والعكس) فتتخلط
// البيانات وينهار العزل في أخطر لحظة — لحظة الاسترجاع.
function validateBackup(file: string): void {
  const test = openBackup(file);
  try {
    const row = test
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get();
    if (!row) throw new Error("الملف مش نسخة FlexPay صالحة");

    const cols = test.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
    const vertical = cols.some((c) => c.name === "vertical")
      ? ((
          test.prepare("SELECT vertical FROM settings WHERE id = 1").get() as
            | { vertical: string | null }
            | undefined
        )?.vertical ?? null)
      : null; // مفيش عمود = نسخة التجزئة (مابتضفش الختم ده)

    if (vertical !== VERTICAL) {
      throw new Error(
        `النسخة دي مش بتاعة «كافيه» (مجالها: ${vertical ?? "تجزئة / غير محدّد"}) — ` +
          `مينفعش تترستور هنا عشان مانخلطش بيانات المجالات.`
      );
    }
  } finally {
    test.close();
  }
}

export function registerBackupIpc(): void {
  // حفظ نسخة احتياطية = نسخة كاملة من قاعدة البيانات (online backup آمن)
  ipcMain.handle("backup:export", () =>
    handleAsync(async () => {
      const win = getMainWindow();
      const opts = {
        title: "حفظ نسخة احتياطية",
        defaultPath: `flexpay-gaming-backup-${stamp()}.fpbackup`,
        filters: [{ name: "FlexPay Restaurant Backup", extensions: ["fpbackup"] }],
      };
      const res = win
        ? await dialog.showSaveDialog(win, opts)
        : await dialog.showSaveDialog(opts);
      if (res.canceled || !res.filePath) return null;
      await getDatabase().backup(res.filePath);
      return { path: res.filePath };
    })
  );

  // استرجاع = نجهّز الملف ونعيد التشغيل لتطبيقه قبل فتح القاعدة (آمن للـ WAL)
  ipcMain.handle("backup:import", () =>
    handleAsync(async () => {
      const win = getMainWindow();
      const opts = {
        title: "استرجاع نسخة احتياطية",
        filters: [{ name: "FlexPay Backup", extensions: ["fpbackup", "db"] }],
        properties: ["openFile" as const],
      };
      const res = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      if (res.canceled || !res.filePaths?.[0]) return null;
      const src = res.filePaths[0];
      validateBackup(src);

      // تجهيز الملف كـ restore-pending — يُطبَّق عند الإقلاع التالي
      const pending = path.join(getUserDataDir(), "restore-pending.db");
      fs.copyFileSync(src, pending);

      // إعادة التشغيل بعد ما نرجّع الرد للواجهة
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
      return { staged: true };
    })
  );
}
