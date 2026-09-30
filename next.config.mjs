/** @type {import('next').NextConfig} */
const nextConfig = {
  // ثابت بالكامل عشان يشتغل أوفلاين جوه Electron عبر بروتوكول app://
  // ملاحظة: مفيش distDir مخصص — البناء يروح .next/ والتصدير الثابت يروح out/
  // (لو خلّينا distDir='out' بيتعارض مع مجلد التصدير فمايطلعش index.html).
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // لا نريد أي تحسينات تتطلب سيرفر وقت التشغيل
  reactStrictMode: true,
};

export default nextConfig;
