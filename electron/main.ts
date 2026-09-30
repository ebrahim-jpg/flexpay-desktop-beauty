import { app, dialog, protocol } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, unlinkSync, renameSync } from "node:fs";
import { createMainWindow } from "./window";
import { initDatabase, closeDatabase, getDatabase } from "./database/connection";
import { registerAllIpc } from "./ipc";
import { setUserDataDir } from "./app-paths";
import { initSyncEngine, getSyncEngine } from "./sync/sync-engine";

const isDev = process.env.NODE_ENV === "development";

// ===== عزل مجلد البيانات (نسخة «تجميل») =====
// سكربت الـdev بيشغّل إلكترون **بمسار ملف** (dist-electron/electron/main.js)، وساعتها
// إلكترون مابيقراش package.json والاسم بيرجع "Electron" → البيانات تروح
// %APPDATA%/Electron، وده مجلد **مشترك** مع أي نسخة تانية شغّالة dev = خلط بيانات المجالات.
// setName بيقفل ده نهائياً ويضمن العزل مهما كانت طريقة التشغيل.
// لازم يتنادى **قبل** أول app.getPath("userData").
const APP_NAME = "flexpay-desktop-beauty";
const USER_DATA_DIR = isDev ? `${APP_NAME}-dev` : APP_NAME;
app.setName(USER_DATA_DIR);

// تسجيل بروتوكول app:// كبروتوكول آمن قبل جهوزية التطبيق (الإنتاج فقط)
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

// مكان مجلد out/ — يختلف بين npm start (غير مُغلّف) والـ exe المُغلّف.
// نجرّب أكتر من مسار ونختار اللي فيه index.html فعلاً (مضمون للحالتين).
function resolveOutDir(): string {
  const candidates = [
    path.join(app.getAppPath(), "out"),
    path.resolve(__dirname, "..", "..", "out"),
    path.resolve(process.cwd(), "out"),
  ];
  for (const c of candidates) {
    if (existsSync(path.join(c, "index.html"))) return c;
  }
  console.error("[protocol] ⚠️ مفيش out/index.html في:", candidates);
  return candidates[0];
}

// يخدم ملفات Next المُصدَّرة الثابتة من مجلد out/ — أوفلاين بالكامل
function registerAppProtocol(): void {
  const outDir = resolveOutDir();
  console.error("[protocol] outDir =", outDir);

  protocol.handle("app", async (request) => {
    let filePath = "";
    try {
      const { pathname } = new URL(request.url);
      let relative = decodeURIComponent(pathname);

      if (relative.endsWith("/")) relative += "index.html";
      else if (!path.extname(relative)) relative += "/index.html";

      filePath = path.normalize(path.join(outDir, relative));
      if (!filePath.startsWith(outDir)) {
        return new Response("Forbidden", { status: 403 });
      }

      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] ?? "application/octet-stream";

      return new Response(new Uint8Array(data), {
        status: 200,
        headers: { "content-type": contentType },
      });
    } catch {
      // fallback لـ index.html (للتنقل من جهة العميل)
      try {
        const fallback = await fs.readFile(path.join(outDir, "index.html"));
        return new Response(new Uint8Array(fallback), {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      } catch (e) {
        console.error("[protocol] 404:", request.url, "→", filePath, (e as Error)?.message);
        return new Response("Not Found", { status: 404 });
      }
    }
  });
}

// لو فيه نسخة احتياطية مجهّزة للاسترجاع، طبّقها قبل فتح القاعدة (آمن للـ WAL)
function applyPendingRestore(userData: string): void {
  const pending = path.join(userData, "restore-pending.db");
  if (!existsSync(pending)) return;
  const dbPath = path.join(userData, "database.db");
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      /* تجاهل */
    }
  }
  renameSync(pending, dbPath);
}

// حارس أخير: يتأكد إن مجلد البيانات فعلاً بتاع البلايستيشن قبل ما نفتح أي قاعدة بيانات.
// بيمسك: دمج غلط لـ package.json من الأساس، أو شيل/تحريك setName فوق،
// أو تشغيل بطريقة بتخلي الاسم يرجع "Electron" (المجلد المشترك مع باقي النسخ).
function assertVerticalIsolation(userData: string): void {
  const dirName = path.basename(userData);
  if (dirName !== USER_DATA_DIR) {
    const msg =
      `عزل البيانات مكسور: مجلد البيانات "${dirName}" والمتوقّع "${USER_DATA_DIR}".\n` +
      `المسار: ${userData}\n\n` +
      `الأسباب المحتملة:\n` +
      `• حقل "name" في package.json اتغيّر أو اتدمج من النسخة الأساسية.\n` +
      `• نداء app.setName() اتشال أو اتنقل بعد أول getPath("userData").\n\n` +
      `التشغيل اتوقف عشان مانكتبش في قاعدة بيانات مجال تاني.`;
    dialog.showErrorBox("FlexPay Beauty — خطأ عزل قاتل", msg);
    throw new Error(msg);
  }
}

app.whenReady().then(() => {
  // تهيئة قاعدة البيانات في %APPDATA%/flexpay-desktop-beauty (معزولة عن باقي المجالات)
  const userData = app.getPath("userData");
  assertVerticalIsolation(userData);
  setUserDataDir(userData);
  applyPendingRestore(userData);
  initDatabase(userData);
  registerAllIpc();

  if (!isDev) {
    registerAppProtocol();
  }

  createMainWindow();

  // محرك المزامنة — يشتغل في الخلفية لكنه يبقى خاملاً حتى يُسجَّل المحل
  // بكود ومفتاح من الويب (يعني مفيش رفع فعلي دلوقتي، البيانات بتتجمّع جاهزة).
  initSyncEngine(getDatabase()).start();

  app.on("activate", () => {
    const { BrowserWindow } = require("electron");
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    closeDatabase();
    app.quit();
  }
});

app.on("before-quit", () => {
  getSyncEngine()?.stop();
  closeDatabase();
});
