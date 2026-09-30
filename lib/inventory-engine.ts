// منطق المخزون النقي مشترك بين الـ Main والـ Renderer — المصدر في shared/inventory.ts
// (الخصم التلقائي deductForOrder منطق قاعدة بيانات، موجود في inventory.repository بالـ Main)
export {
  calculateExpectedRange,
  computeStatus,
  STATUS_LABELS,
  TRANSACTION_LABELS,
  INVENTORY_UNITS,
} from "@/shared/inventory";
export type {
  InventoryStatus,
  TransactionType,
  ExpectedRange,
} from "@/shared/inventory";
