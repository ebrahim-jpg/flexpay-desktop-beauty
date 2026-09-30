/**
 * إعدادات البناء والتغليف — electron-builder
 * نسخة «تجميل وحلاقة» (beauty) — كراسي بجلسات + خدمات بإسناد حلاق + كاشير منتجات
 * + حجز مواعيد. برنامج منفصل عن المطعم والكافيه. ⚠️ appId و productName هنا
 * **مالهمش علاقة بمجلد البيانات**: appId بيخلّي التثبيت **جنب** النسخ التانية مش فوقها،
 * و productName اسم الـexe والاختصار.
 * مجلد البيانات بيتحدد من `name` في package.json + app.setName في main.ts
 * → %APPDATA%/flexpay-desktop-beauty (شوف scripts/verify-isolation.js).
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: "com.flexpay.beauty",
  productName: "FlexPay Beauty",
  directories: {
    output: "release",
  },
  files: [
    "dist-electron/**",
    "out/**",
    "package.json",
  ],
  asarUnpack: ["**/node_modules/better-sqlite3/**"],
  // better-sqlite3 متجهّز مسبقاً لـ Electron عبر setup:native (نسخة prebuilt)،
  // فمنمنع electron-builder من إعادة بنائه (يتجنّب node-gyp و EPERM).
  npmRebuild: false,
  win: {
    target: ["nsis"],
    icon: "assets/icon.ico",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: "assets/icon.ico",
    uninstallerIcon: "assets/icon.ico",
  },
};
