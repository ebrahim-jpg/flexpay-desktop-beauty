/**
 * إعدادات البناء والتغليف — electron-builder
 * نسخة «مطاعم» (restaurant) — صالة بطاولات + تيك أواي + توصيل + طلبات المتجر. برنامج منفصل عن الكافيه والبلايستيشن. ⚠️ appId و productName هنا **مالهمش علاقة بمجلد البيانات**:
 * appId بيخلّي التثبيت **جنب** نسخة التجزئة مش فوقها، و productName اسم الـexe والاختصار.
 * مجلد البيانات بيتحدد من `name` في package.json + app.setName في main.ts
 * → %APPDATA%/flexpay-desktop-restaurant (شوف scripts/verify-isolation.js).
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: "com.flexpay.restaurant",
  productName: "FlexPay Restaurant",
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
