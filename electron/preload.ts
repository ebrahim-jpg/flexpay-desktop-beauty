import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

// الجسر الآمن الوحيد بين الـ Renderer والـ Main.
// لا وصول مباشر لـ SQLite من الـ Renderer (الدستور §3).

// القنوات المسموح للـ Main يبعت عليها للـ Renderer (push events)
const ALLOWED_EVENTS = new Set<string>(["sync:status", "online-orders:new", "bookings:new"]);

contextBridge.exposeInMainWorld("electron", {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),

  // اشتراك في حدث من الـ Main — يرجّع دالة لإلغاء الاشتراك
  on: (channel: string, callback: (payload: unknown) => void) => {
    if (!ALLOWED_EVENTS.has(channel)) return () => undefined;
    const listener = (_e: IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
