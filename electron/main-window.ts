import type { BrowserWindow } from "electron";

// مرجع النافذة الرئيسية — يُستخدم للطابعات والطباعة من الـ IPC
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
