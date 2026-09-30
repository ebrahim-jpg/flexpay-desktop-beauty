// منطق الباركود مشترك بين الـ Main والـ Renderer — المصدر في shared/barcode.ts
// هذا الملف يعيد التصدير ليطابق المسار في ARCHITECTURE.md (lib/barcode.ts).
export * from "@/shared/barcode";
export type {
  BarcodeKind,
  ParsedBarcode,
} from "@/shared/barcode";
