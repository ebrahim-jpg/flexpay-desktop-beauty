import path from "node:path";
import fs from "node:fs";

// مسارات التطبيق المحلية — تُضبط مرة عند الإقلاع في main.ts
let userDataDir = "";

export function setUserDataDir(dir: string): void {
  userDataDir = dir;
}

export function getUserDataDir(): string {
  return userDataDir;
}

// مجلد الأصول المحلية (الشعار..) داخل بيانات المستخدم
export function getAssetsDir(): string {
  const dir = path.join(userDataDir, "assets");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
