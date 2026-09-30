import { BrowserWindow } from "electron";
import path from "node:path";
import { setMainWindow } from "./main-window";

const isDev = process.env.NODE_ENV === "development";
const DEV_URL = "http://localhost:3000";

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#F6F3EE",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // تنبيه «وقت الغرفة خلص» صوت بيرن لوحده — من غيره Chromium بيمنع الصوت لحد أول ضغطة
      // في الصفحة، فالتنبيه كان ممكن يطلع صامت لو البرنامج اتفتح ومحدش لمسه.
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  setMainWindow(win);
  win.on("closed", () => setMainWindow(null));

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // الإنتاج: الملفات الثابتة تُخدَم عبر بروتوكول app:// (أوفلاين بالكامل)
    win.loadURL("app://./index.html");
  }

  return win;
}
