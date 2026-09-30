// Types الـ IPC — العقد بين الـ Renderer والـ Main
import type { Role, Permissions } from "../shared/permissions";
import type { OnlineOrderDTO, OnlineOrderArchiveDay } from "../shared/online-orders";
import type {
  SettingsDTO,
  UpdateSettingsInput,
  PaymentMethod,
  PrinterInfo,
  SyncTestResult,
} from "../shared/settings";
import type {
  CategoryDTO,
  CreateCategoryInput,
  UpdateCategoryInput,
  ProductDTO,
  CreateProductInput,
  UpdateProductInput,
  RecipeItemDTO,
  SaveRecipeInput,
  ProductCostSummary,
  RecipeOverviewItem,
  GetRecipeInput,
} from "../shared/products";
import type { SizeDTO, SaveSizesInput } from "../shared/sizes";
import type {
  InventoryItemDTO,
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  RestockInput,
  WasteInput,
  TransactionsPage,
  ExpectedRange,
  SupplierDTO,
  CreateSupplierInput,
  UpdateSupplierInput,
  SupplierLedger,
  RecordSupplierPaymentInput,
  DeductForOrderInput,
} from "../shared/inventory";
import type {
  CreateOrderInput,
  CreateOrderResult,
  OrderDTO,
  OrderTotals,
  CalculateTotalsInput,
  CancelOrderInput,
} from "../shared/orders";
import type {
  AddSessionItemInput,
  CheckoutSessionInput,
  GamingBoard,
  SplitCheckoutInput,
  GamingRoomDTO,
  GamingSessionDTO,
  GamingTodaySummary,
  OpenSessionInput,
  SaveRoomInput,
  SessionQuote,
} from "../shared/gaming";
import type { BookingDTO } from "../shared/booking";
import type {
  CustomerDTO,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerListQuery,
  CustomerOrdersQuery,
  CustomerOrdersPage,
  CustomerFreeOrder,
} from "../shared/customers";
import type {
  ProductPlan,
  CustomerPlan,
  ImportResult,
  ProductImportRow,
  CustomerImportRow,
} from "../shared/data-transfer";
import type {
  StaffStatusDTO,
  AttendanceRowDTO,
  AttendanceLogDTO,
  ClockInput,
  ClockByCodeResult,
  PresentSessionDTO,
  AttendanceQuery,
  UpdateAttendanceLogInput,
  ExpenseDTO,
  CreateExpenseInput,
  ExpensesQuery,
  ExpensesSummary,
  CashierNetDTO,
} from "../shared/management";
import type {
  SalesDayReport,
  SalesSummaryRow,
  SalesSummaryPrintData,
  InventoryStatusRow,
  InventoryMovementRow,
  DashboardSummary,
} from "../shared/reports";
import type {
  SyncStatusDTO,
  SyncQueueItemDTO,
  SyncLogDTO,
} from "../shared/sync";
import type {
  CreatePurchaseInvoiceInput,
  PurchaseInvoiceDTO,
  PurchaseInvoiceListItem,
} from "../shared/purchases";
import type {
  CommitStocktakeInput,
  StocktakeCountRow,
  StocktakeDTO,
  StocktakeListItem,
  StocktakeScopeInput,
} from "../shared/stocktake";
import type { UserShortcut } from "../shared/shortcuts";

// النسخة الآمنة من المستخدم (بدون أي hashes) — اللي بتتبعت للـ Renderer
export interface SafeUser {
  id: number;
  local_id: string;
  name: string;
  username: string;
  role: Role;
  permissions: Permissions;
  is_active: boolean;
  last_login_at: string | null;
  has_password: boolean;
  has_pin: boolean;
  has_attendance_code: boolean; // عيّن كود حضور؟ (بديل البصمة)
  auto_clockout_hours: number | null; // تخصيص لكل موظف (NULL = القيمة العامة)
  warn_hours: number | null;
  seller_categories: number[] | null; // فئات البائع (NULL = بائع عام)
}

export interface CreateUserInput {
  name: string;
  username: string;
  role: Role;
  password?: string;
  pin?: string;
  permissions?: Partial<Permissions>;
  attendanceCode?: string; // كود الحضور (5 أرقام) — اختياري
  autoClockoutHours?: number | null; // تخصيص لكل موظف
  warnHours?: number | null;
  sellerCategories?: number[] | null; // فئات البائع (null = عام)
}

export interface UpdateUserInput {
  id: number;
  name?: string;
  username?: string;
  role?: Role;
  password?: string;
  pin?: string;
  permissions?: Partial<Permissions>;
  autoClockoutHours?: number | null;
  warnHours?: number | null;
  sellerCategories?: number[] | null;
}

export interface VerifyPasswordInput {
  username: string;
  password: string;
}

export interface VerifyPinInput {
  userId: number;
  pin: string;
}

export interface ChangePasswordInput {
  userId: number;
  newPassword: string;
}

export interface ChangePinInput {
  userId: number;
  newPin: string;
}

export interface AuditLogInput {
  userId: number;
  userName: string;
  action: string;
  entityType?: string;
  entityId?: number;
  oldValue?: unknown;
  newValue?: unknown;
}

// النتيجة الموحدة لكل IPC call — مفيش throw عبر الحدود، بنرجع نتيجة واضحة
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// خريطة كل القنوات: input/output — تُستخدم للـ type safety في useIPC
export interface IpcChannels {
  // يضبط المستخدم الحالي في الـ Main (لتسجيل created_by/updated_by)
  "session:setActor": { input: number | null; output: boolean };
  "users:getAll": { input: void; output: SafeUser[] };
  "users:getActiveCashiers": { input: void; output: SafeUser[] };
  "users:getById": { input: number; output: SafeUser | null };
  "users:create": { input: CreateUserInput; output: SafeUser };
  "users:update": { input: UpdateUserInput; output: SafeUser };
  "users:deactivate": { input: number; output: boolean };
  "users:reactivate": { input: number; output: boolean };
  "users:verifyPassword": { input: VerifyPasswordInput; output: SafeUser | null };
  "users:verifyPIN": { input: VerifyPinInput; output: SafeUser | null };
  "users:changePassword": { input: ChangePasswordInput; output: boolean };
  "users:changePIN": { input: ChangePinInput; output: boolean };
  "audit:log": { input: AuditLogInput; output: boolean };

  // ===== الملف الشخصي (المستخدم الحالي) =====
  "profile:changePassword": { input: { oldPassword: string; newPassword: string }; output: boolean };
  "profile:getShortcuts": { input: void; output: UserShortcut[] };
  "profile:setShortcut": { input: { key: string; product_id: number }; output: boolean };
  "profile:deleteShortcut": { input: string; output: boolean };

  // ===== الإعدادات (PRD-02) =====
  "settings:get": { input: void; output: SettingsDTO };
  "settings:update": { input: UpdateSettingsInput; output: SettingsDTO };
  "settings:getPaymentMethods": { input: void; output: PaymentMethod[] };
  "settings:saveLogo": { input: { dataUrl: string }; output: SettingsDTO };
  "settings:removeLogo": { input: void; output: SettingsDTO };
  "settings:getPrinters": { input: void; output: PrinterInfo[] };
  "settings:testPrint": { input: { printerName?: string }; output: boolean };
  "settings:testSync": { input: void; output: SyncTestResult };

  // ===== الفئات (PRD-03) =====
  "categories:getAll": { input: void; output: CategoryDTO[] };
  "categories:create": { input: CreateCategoryInput; output: CategoryDTO };
  "categories:update": { input: UpdateCategoryInput; output: CategoryDTO };
  "categories:reorder": { input: { ids: number[] }; output: boolean };
  "categories:delete": { input: number; output: boolean };

  // ===== المنتجات (PRD-03) =====
  "products:getAll": { input: void; output: ProductDTO[] };
  "products:getByCategory": { input: number; output: ProductDTO[] };
  "products:getByBarcode": { input: string; output: ProductDTO | null };
  "products:search": { input: string; output: ProductDTO[] };
  "products:getAvailable": { input: void; output: ProductDTO[] };
  "products:create": { input: CreateProductInput; output: ProductDTO };
  "products:update": { input: UpdateProductInput; output: ProductDTO };
  "products:toggleAvailability": {
    input: { id: number; available: boolean };
    output: ProductDTO;
  };
  "products:delete": { input: number; output: boolean };
  "products:setActive": { input: { id: number; active: boolean }; output: ProductDTO };

  // ===== الوصفات (PRD-03) =====
  "products:getRecipe": { input: GetRecipeInput; output: RecipeItemDTO[] };
  "products:getRecipesOverview": { input: void; output: RecipeOverviewItem[] };
  "products:saveRecipe": { input: SaveRecipeInput; output: RecipeItemDTO[] };
  // ===== الأحجام (المطاعم) =====
  "sizes:getByProduct": { input: number; output: SizeDTO[] };
  "sizes:save": { input: SaveSizesInput; output: SizeDTO[] };
  "products:calculateCost": { input: number; output: ProductCostSummary };

  // ===== المخزون (PRD-04) =====
  "inventory:getAll": { input: void; output: InventoryItemDTO[] };
  "inventory:getAlerts": { input: void; output: InventoryItemDTO[] };
  "inventory:getById": { input: number; output: InventoryItemDTO | null };
  "inventory:create": { input: CreateInventoryItemInput; output: InventoryItemDTO };
  "inventory:update": { input: UpdateInventoryItemInput; output: InventoryItemDTO };
  "inventory:delete": { input: number; output: boolean };
  "inventory:restock": { input: RestockInput; output: InventoryItemDTO };
  "inventory:adjustWaste": { input: WasteInput; output: InventoryItemDTO };
  "inventory:getTransactions": {
    input: { itemId: number; page?: number; pageSize?: number };
    output: TransactionsPage;
  };
  "inventory:getLowRange": { input: number; output: ExpectedRange | null };
  "inventory:deductForOrder": { input: DeductForOrderInput; output: boolean };

  // ===== الموردين (PRD-04) =====
  "suppliers:getAll": { input: void; output: SupplierDTO[] };
  "suppliers:create": { input: CreateSupplierInput; output: SupplierDTO };
  "suppliers:update": { input: UpdateSupplierInput; output: SupplierDTO };
  "suppliers:delete": { input: number; output: boolean };
  "suppliers:getLedger": { input: number; output: SupplierLedger };
  "suppliers:recordPayment": { input: RecordSupplierPaymentInput; output: SupplierDTO };

  // ===== الطلبات / الكاشير (PRD-05) =====
  "orders:create": { input: CreateOrderInput; output: CreateOrderResult };
  "orders:cancel": { input: CancelOrderInput; output: OrderDTO };
  "orders:getRecent": { input: { limit?: number }; output: OrderDTO[] };
  "orders:getByDate": { input: { businessDate: string }; output: OrderDTO[] };
  "orders:getById": { input: number; output: OrderDTO | null };
  "orders:calculateTotals": { input: CalculateTotalsInput; output: OrderTotals };
  "orders:printReceipt": { input: number; output: boolean };

  // ===== العملاء (PRD-06) =====
  "customers:getAll": { input: CustomerListQuery; output: CustomerDTO[] };
  "customers:search": { input: string; output: CustomerDTO[] };
  "customers:getById": { input: number; output: CustomerDTO | null };
  "customers:getOrders": { input: CustomerOrdersQuery; output: CustomerOrdersPage };
  "customers:getFreeItems": { input: number; output: CustomerFreeOrder[] };
  "customers:create": { input: CreateCustomerInput; output: CustomerDTO };
  "customers:findOrCreateByPhone": {
    input: { phone: string; name?: string | null };
    output: CustomerDTO;
  };
  "customers:update": { input: UpdateCustomerInput; output: CustomerDTO };
  "customers:delete": { input: number; output: boolean };
  "customers:getAbsent": { input: void; output: CustomerDTO[] };

  // ===== الحضور والانصراف (PRD-07) =====
  "attendance:clockIn": { input: ClockInput; output: boolean };
  "attendance:clockOut": { input: ClockInput; output: boolean };
  "attendance:getCurrentStatus": { input: void; output: StaffStatusDTO[] };
  "attendance:getToday": { input: void; output: AttendanceLogDTO[] };
  "attendance:getLast30Days": { input: AttendanceQuery; output: AttendanceRowDTO[] };
  "attendance:updateLog": { input: UpdateAttendanceLogInput; output: boolean };
  "attendance:deleteLog": { input: number; output: boolean };
  // تسجيل ذاتي بكود الموظف (بديل البصمة) — يعرف الموظف من كوده ويعمل toggle
  "attendance:clockByCode": { input: { code: string }; output: ClockByCodeResult };
  // انصراف تلقائي (للمؤقت الخلفي عند تجاوز الحد)
  "attendance:autoClockOut": { input: { userId: number; atWarn?: boolean }; output: boolean };
  // الحاضرون الآن + حدودهم الفعّالة (للمراقبة والتحذير)
  "attendance:getPresentSessions": { input: void; output: PresentSessionDTO[] };
  // تعيين/تغيير كود حضور موظف (للمالك/المدير)
  "users:setAttendanceCode": { input: { userId: number; code: string }; output: boolean };

  // ===== المصاريف (PRD-07) =====
  "expenses:getToday": { input: void; output: ExpenseDTO[] };
  "expenses:getLast30Days": { input: ExpensesQuery; output: ExpenseDTO[] };
  "expenses:create": { input: CreateExpenseInput; output: ExpenseDTO };
  "expenses:delete": { input: number; output: boolean };
  "expenses:getDailySummary": { input: { date: string }; output: ExpensesSummary };
  "expenses:getCashierNet": { input: number; output: CashierNetDTO };

  // ===== التقارير (PRD-08) =====
  "reports:getSalesByDay": { input: string; output: SalesDayReport };
  "reports:getSalesSummary": { input: void; output: SalesSummaryRow[] };
  "reports:getInventoryStatus": { input: void; output: InventoryStatusRow[] };
  "reports:getInventoryMovements": { input: number; output: InventoryMovementRow[] };
  "reports:printSalesSummary": { input: SalesSummaryPrintData; output: boolean };

  // ===== لوحة التحكم (PRD-08) =====
  "dashboard:getTodaySummary": { input: void; output: DashboardSummary };

  // ===== المزامنة (PRD-08) =====
  "sync:getStatus": { input: void; output: SyncStatusDTO };
  "sync:getQueue": { input: void; output: SyncQueueItemDTO[] };
  "sync:getLog": { input: void; output: SyncLogDTO[] };
  "sync:retryFailed": { input: void; output: number };
  "sync:syncNow": { input: void; output: SyncStatusDTO };

  // ===== التفعيل (PRD-09 desktop) =====
  "activation:status": {
    input: void;
    output: { activated: boolean; serverUrl: string };
  };
  "activation:activate": {
    input: { code: string; serverUrl: string };
    output: { activated: boolean; shopName: string };
  };
  // إعادة تفعيل ذرّية من الإعدادات — الهوية القديمة مابتتلمسش لحد ما السيرفر
  // يرجّع هوية صحيحة لنفس المحل. مفيش رابط في المدخلات عن قصد.
  "activation:reactivate": {
    input: { code: string };
    output: { shopName: string };
  };

  // ===== النسخ الاحتياطي (PRD-09 desktop) =====
  // ⚠️ ده **الداتابيز كلها**: بيمسح كل حاجة ويحط مكانها ويعيد التشغيل.
  "backup:export": { input: void; output: { path: string } | null };
  "backup:import": { input: void; output: { staged: boolean } | null };

  // ===== استيراد/تصدير إكسل =====
  // ⚠️ **حاجة تانية خالص عن النسخ الاحتياطي**: بيضيف ويحدّث منتجات/عملاء بس،
  // عمره ما بيحذف ولا بيوقّف ولا بيمسح قيمة موجودة بخانة فاضية.
  // و`plan` بيقرا ويحلّل **بلا أي كتابة** — الكتابة في `apply` بعد ما المستخدم
  // يشوف المعاينة ويأكّد.
  "data:products:plan": {
    input: void;
    output: { plan: ProductPlan; rows: ProductImportRow[]; file: string } | null;
  };
  "data:products:apply": {
    input: { rows: ProductImportRow[]; actorId: number | null };
    output: ImportResult;
  };
  "data:products:export": { input: number | null; output: string | null };
  "data:products:template": { input: void; output: string | null };
  "data:customers:plan": {
    input: void;
    output: { plan: CustomerPlan; rows: CustomerImportRow[]; file: string } | null;
  };
  "data:customers:apply": {
    input: { rows: CustomerPlan["rows"]; actorId: number | null };
    output: ImportResult;
  };
  "data:customers:export": { input: void; output: string | null };
  "data:customers:template": { input: void; output: string | null };

  // ===== فواتير التوريد =====
  "purchases:createInvoice": { input: CreatePurchaseInvoiceInput; output: PurchaseInvoiceDTO };
  "purchases:getInvoices": { input: void; output: PurchaseInvoiceListItem[] };
  "purchases:getInvoiceById": { input: number; output: PurchaseInvoiceDTO | null };

  // ===== الجرد =====
  "stocktake:categories": { input: void; output: string[] };
  "stocktake:countRows": { input: StocktakeScopeInput; output: StocktakeCountRow[] };
  "stocktake:commit": { input: CommitStocktakeInput; output: StocktakeDTO };
  "stocktake:getAll": { input: void; output: StocktakeListItem[] };
  "stocktake:getById": { input: number; output: StocktakeDTO | null };

  // ===== طلبات المتجر الإلكتروني (0.9.0) =====
  "onlineOrders:list": { input: void; output: OnlineOrderDTO[] };
  "onlineOrders:listForDate": { input: string; output: OnlineOrderDTO[] };
  "onlineOrders:archiveDays": { input: void; output: OnlineOrderArchiveDay[] };
  "onlineOrders:count": { input: void; output: number };
  "onlineOrders:get": { input: string; output: OnlineOrderDTO | null };
  "onlineOrders:cancel": {
    input: { localId: string; reason?: string | null };
    output: number;
  };
  "onlineOrders:printTicket": { input: string; output: boolean };

  // ===== الطاولات (نسخة «كافيه» — أسماء القنوات متوارثة من البلايستيشن) =====
  "gaming:board": { input: void; output: GamingBoard };
  "gaming:summary:today": { input: void; output: GamingTodaySummary };
  "gaming:rooms:list": { input: { includeInactive?: boolean }; output: GamingRoomDTO[] };
  "gaming:rooms:save": { input: SaveRoomInput; output: GamingRoomDTO };
  "gaming:rooms:delete": { input: number; output: boolean };
  "gaming:session:open": { input: OpenSessionInput; output: GamingSessionDTO };
  "gaming:session:setCustomer": {
    input: { session_id: number; customer_id: number | null };
    output: GamingSessionDTO;
  };
  "gaming:session:addItem": { input: AddSessionItemInput; output: GamingSessionDTO };
  "gaming:session:updateItem": { input: { item_id: number; quantity: number }; output: GamingSessionDTO };
  "gaming:session:removeItem": { input: number; output: GamingSessionDTO };
  "gaming:session:quote": {
    input: { session_id: number; discount_type?: "none" | "percentage" | "fixed"; discount_value?: number };
    output: SessionQuote;
  };
  "gaming:session:checkout": {
    input: CheckoutSessionInput;
    output: CreateOrderResult & { session: GamingSessionDTO };
  };
  "gaming:session:cancel": { input: { session_id: number; reason: string }; output: GamingSessionDTO };
  // ===== الطاولات: نقل · دمج · تقسيم الفاتورة =====
  "gaming:session:transfer": { input: { session_id: number; to_room_id: number }; output: GamingSessionDTO };
  "gaming:session:merge": { input: { from_session_id: number; into_session_id: number }; output: GamingSessionDTO };
  "gaming:session:quoteSplit": {
    input: {
      session_id: number;
      lines: SplitCheckoutInput["lines"];
      discount_type?: "none" | "percentage" | "fixed";
      discount_value?: number;
    };
    output: Omit<SessionQuote, "at" | "actual_minutes">;
  };
  "gaming:session:splitCheckout": {
    input: SplitCheckoutInput;
    output: CreateOrderResult & { session: GamingSessionDTO };
  };

  // ===== طلبات حجز الغرف (الحجز الأونلاين) =====
  "bookings:list": { input: void; output: BookingDTO[] };
  "bookings:upcoming": { input: { days?: number } | void; output: BookingDTO[] };
  "bookings:board": { input: void; output: BookingDTO[] };
  "bookings:listForDate": { input: string; output: BookingDTO[] };
  "bookings:archiveDays": { input: void; output: { date: string; count: number }[] };
  "bookings:count": { input: void; output: number };
  "bookings:due": { input: void; output: BookingDTO[] };
  "bookings:confirm": { input: { id: number; note?: string | null; table_id?: number | null }; output: BookingDTO };
  "bookings:reject": { input: { id: number; reason: string }; output: BookingDTO };
  "bookings:cancel": { input: { id: number; reason: string }; output: BookingDTO };
  "bookings:noShow": { input: number; output: BookingDTO };
  "bookings:convert": {
    input: { id: number; staff_id: number };
    output: { booking: BookingDTO; session: GamingSessionDTO };
  };
}

export type IpcChannel = keyof IpcChannels;
