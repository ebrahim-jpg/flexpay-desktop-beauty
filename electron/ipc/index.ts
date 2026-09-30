import { registerUsersIpc } from "./users.ipc";
import { registerSettingsIpc } from "./settings.ipc";
import { registerProductsIpc } from "./products.ipc";
import { registerInventoryIpc } from "./inventory.ipc";
import { registerOrdersIpc } from "./orders.ipc";
import { registerCustomersIpc } from "./customers.ipc";
import { registerAttendanceIpc } from "./attendance.ipc";
import { registerExpensesIpc } from "./expenses.ipc";
import { registerReportsIpc } from "./reports.ipc";
import { registerDashboardIpc } from "./dashboard.ipc";
import { registerSyncIpc } from "./sync.ipc";
import { registerActivationIpc } from "./activation.ipc";
import { registerBackupIpc } from "./backup.ipc";
import { registerPurchasesIpc } from "./purchases.ipc";
import { registerStocktakeIpc } from "./stocktake.ipc";
import { registerOnlineOrdersIpc } from "./online-orders.ipc";
// ⚠️ استيراد/تصدير إكسل — **مش النسخ الاحتياطي**. ده بيضيف ويحدّث بس.
import { registerDataTransferIpc } from "./data-transfer.ipc";
// مجال البلايستيشن: الغرف والجلسات
import { registerGamingIpc } from "./gaming.ipc";
// مجال البلايستيشن: طلبات الحجز الجايّة من الويب
import { registerRoomBookingsIpc } from "./room-bookings.ipc";

// تسجيل كل الـ IPC handlers — تُستدعى مرة واحدة بعد جهوزية الـ DB
export function registerAllIpc(): void {
  registerUsersIpc();
  registerSettingsIpc();
  registerProductsIpc();
  registerInventoryIpc();
  registerOrdersIpc();
  registerCustomersIpc();
  registerAttendanceIpc();
  registerExpensesIpc();
  registerReportsIpc();
  registerDashboardIpc();
  registerSyncIpc();
  registerActivationIpc();
  registerBackupIpc();
  registerPurchasesIpc();
  registerStocktakeIpc();
  registerOnlineOrdersIpc();
  registerDataTransferIpc();
  registerGamingIpc();
  registerRoomBookingsIpc();
}
