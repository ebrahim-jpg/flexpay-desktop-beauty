// مشغّل Electron — يحذف ELECTRON_RUN_AS_NODE قبل التشغيل.
// المتغير ده بيتسرب من بعض البيئات (زي terminal جوه VSCode) وبيخلي Electron
// يشتغل كـ Node عادي، فـ require('electron') يرجّع مسار بدل الـ API و app/protocol
// يطلعوا undefined. حذفه هنا بيضمن تشغيل Electron حقيقي على أي جهاز.
const { spawn } = require("node:child_process");

delete process.env.ELECTRON_RUN_AS_NODE;

const electronPath = require("electron"); // مسار electron.exe
const args = process.argv.slice(2);

const child = spawn(electronPath, args, {
  stdio: "inherit",
  env: process.env,
});

child.on("close", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[run-electron] فشل تشغيل Electron:", err);
  process.exit(1);
});
