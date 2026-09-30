# FlexPay — Desktop (POS)

تطبيق Desktop مبني بـ **Electron + Next.js 15 + SQLite**. يشتغل بالكامل **أوفلاين** —
الإنترنت اختياري للمزامنة فقط.

> المرجع: `../docs/desktop/desktop-CONSTITUTION.md` + `desktop-ARCHITECTURE.md`.
> هذه المرحلة: **PRD-01 — Foundation & Auth**.

## التشغيل (Development)

```bash
npm install        # يثبّت كل شيء + يجهّز better-sqlite3 لـ Electron تلقائياً
npm run dev        # يشغّل Next (3000) + Electron معاً
```

أول دخول افتراضي: **admin / admin123** (مالك) — غيّر الباسورد بعد الدخول.

## أوامر مفيدة

| الأمر | الوظيفة |
|-------|---------|
| `npm run dev` | تشغيل التطوير (Next + Electron) |
| `npm run typecheck` | فحص الأنواع (الواجهة + الـ Main) |
| `npm run build` | بناء الواجهة (static export) + الـ Main |
| `npm run smoke` | اختبار سريع لقاعدة البيانات تحت Electron |
| `npm run dist` | تغليف installer (NSIS) عبر electron-builder |
| `npm run setup:native` | إعادة تجهيز better-sqlite3 لـ Electron يدوياً |

## البنية

```
app-desktop/
├── electron/        ← Main Process (SQLite + IPC + Sync) — TypeScript
│   ├── database/    ← connection + migrations + seed
│   ├── repositories/← طبقة قاعدة البيانات (base/users/audit)
│   ├── ipc/         ← IPC handlers (users + audit + session)
│   ├── sync/        ← هيكل المزامنة (يكتمل في PRD-08)
│   └── main.ts · preload.ts · window.ts
├── app/             ← Renderer (Next.js App Router, RTL)
│   ├── (auth)/login ← شاشة الدخول (باسورد + PIN)
│   └── (main)/      ← داخل التطبيق (Sidebar + الصفحات)
├── components/      ← ui / shared / auth / staff / providers
├── store/           ← Zustand (auth كامل، الباقي هياكل)
├── hooks/ · lib/ · shared/ · types/
```

## ملاحظات مهمة

- **الـ DB المحلية** تُحفظ في `%APPDATA%/FlexPay/database.db` (تبقى بعد إلغاء التثبيت).
- **better-sqlite3** native module: الـ `postinstall` بينزّل نسخة Electron الجاهزة
  (prebuilt) عشان ميحتاجش Visual Studio. لو فشل، شغّل `npm run setup:native`.
- البيئة لو فيها `ELECTRON_RUN_AS_NODE=1` بتخلي Electron يشتغل كـ Node — الأوامر هنا
  بتصفّرها تلقائياً.
- لا وصول مباشر لـ SQLite من الـ Renderer — كل شيء عبر IPC (الدستور §3).
