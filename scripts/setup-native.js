// يجهّز better-sqlite3 ليشتغل تحت Electron عن طريق تنزيل النسخة الجاهزة (prebuilt)
// بدل الكمبايل من المصدر — وبالتالي مش محتاج Visual Studio Build Tools.
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function main() {
  const root = path.join(__dirname, "..");
  const betterDir = path.join(root, "node_modules", "better-sqlite3");

  let electronVersion;
  try {
    electronVersion = require(path.join(
      root,
      "node_modules",
      "electron",
      "package.json"
    )).version;
  } catch {
    console.warn("[setup-native] electron غير مثبت — تخطّي.");
    return;
  }

  let prebuildBin;
  try {
    prebuildBin = require.resolve("prebuild-install/bin.js", {
      paths: [betterDir, root],
    });
  } catch {
    console.warn("[setup-native] prebuild-install غير موجود — تخطّي.");
    return;
  }

  try {
    execFileSync(
      process.execPath,
      [
        prebuildBin,
        "--runtime=electron",
        `--target=${electronVersion}`,
        "--dist-url=https://electronjs.org/headers",
      ],
      { cwd: betterDir, stdio: "inherit" }
    );
    console.log(
      `[setup-native] تم تجهيز better-sqlite3 لـ Electron ${electronVersion}`
    );
  } catch {
    console.warn(
      "[setup-native] تعذّر تنزيل نسخة Electron الجاهزة لـ better-sqlite3.\n" +
        "  لو هتشغّل التطبيق فعلياً، ثبّت أدوات البناء وشغّل: npm run setup:native"
    );
  }
}

main();
