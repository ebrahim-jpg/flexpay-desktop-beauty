// طبقة مشتركة بين الـ Main Process والـ Renderer.
// تعريف الأدوار والصلاحيات.
//
// العقيدة:
// - مالك (owner): يقدر يعمل كل حاجة بدون استثناء (بما فيها الإعدادات).
// - مدير (manager): زي المالك بالظبط ما عدا الإعدادات.
// - كاشير (cashier): الكراسي والكاشير وطلبات المتجر. صلاحيات قابلة للتخصيص:
//     الخصم + الحضور والانصراف + المصاريف + التوريد + الموردين + المزامنة. الباقي ثابت = ممنوع.
// - حلاق/أخصائي (stylist): بيدخل بالـPIN، بيفتح جلسة على كرسي ويزوّد خدمات ويقفل.
//     **مايشوفش فلوس اليوم** ولا التقارير. صلاحياته قابلة للتخصيص زي الكاشير.
//     ⚠️ وده الدور اللي **بتتحسب عليه العمولة**: كل خدمة بتتسجّل باسم اللي عملها.
// - موظف (employee): مالوش وصول (نظافة/استقبال عام) — سجل في الحضور/المصاريف.
// ⚠️ الأدوار القديمة (نادل/طباخ/ديليفري/بائع) **مابتتعيّنش هنا** — فاضلة في النوع عشان
//     أي مستخدم قديم في الداتابيز يتقري من غير ما يكسر (والمزامنة بتبعته زي ما هو).

export type Role =
  | "owner"
  | "manager"
  | "cashier"
  /** الحلاق/الأخصائي — بيشتغل على العميل والعمولة بتتحسب عليه */
  | "stylist"
  | "employee"
  // ===== أدوار موروثة: مابتتعيّنش في التجميل، فاضلة عشان الداتا القديمة تتقري =====
  | "waiter"
  | "chef"
  | "delivery"
  | "seller";

export interface Permissions {
  // ===== قابلة للتخصيص (للكاشير فقط) =====
  canGiveDiscount: boolean;
  canManageAttendance: boolean;
  canManageExpenses: boolean;
  canCreatePurchaseInvoices: boolean; // تسجيل فواتير التوريد (بتزوّد المخزون)
  canManageSuppliers: boolean; // إدارة الموردين + دفعات الآجل
  canViewSync: boolean; // الوصول لصفحة مراقب المزامنة
  // ===== ثابتة حسب الدور (مش قابلة للتخصيص) =====
  canAccessPOS: boolean;
  canCancelOrder: boolean;
  canViewReports: boolean;
  canViewProducts: boolean; // عرض المنتجات فقط (من غير تعديل/إضافة)
  canManageProducts: boolean;
  canManageInventory: boolean;
  canManageCustomers: boolean; // عرض + إضافة عملاء (الكاشير عنده دي)
  canEditCustomers: boolean; // تعديل/حذف عميل — للمدير والمالك فقط
  canManageStaff: boolean;
  canViewSettings: boolean;
}

// الأدوار اللي تقدر تسجّل دخول للنظام. الباقي (طباخ/ديليفري/موظف) لا.
export const LOGIN_ROLES: Role[] = ["owner", "manager", "cashier", "stylist"];

// الأدوار اللي تتعيّن من شاشة المستخدمين (والـmain بيرفض غيرها) — «بائع» برّه المطعم
export const ASSIGNABLE_ROLES: Role[] = ["owner", "manager", "cashier", "stylist", "employee"];
export function isAssignableRole(role: string): role is Role {
  return (ASSIGNABLE_ROLES as string[]).includes(role);
}
export function canLogin(role: Role): boolean {
  return LOGIN_ROLES.includes(role);
}

// الأدوار اللي ليها صلاحيات قابلة للتخصيص (الباقي قدراته ثابتة من دوره)
export const CUSTOMIZABLE_ROLES: Role[] = ["cashier", "stylist"];

// الصلاحيات القابلة للتخصيص — تظهر للكاشير والنادل
export const CUSTOMIZABLE_PERMISSIONS: (keyof Permissions)[] = [
  "canGiveDiscount",
  "canManageAttendance",
  "canManageExpenses",
  "canCreatePurchaseInvoices",
  "canManageSuppliers",
  "canViewSync",
];

export const PERMISSION_LABELS: Record<keyof Permissions, string> = {
  canGiveDiscount: "إعطاء خصم",
  canManageAttendance: "تسجيل الحضور والانصراف",
  canManageExpenses: "تسجيل المصاريف",
  canCreatePurchaseInvoices: "تسجيل فواتير التوريد",
  canManageSuppliers: "إدارة الموردين ودفعاتهم",
  canViewSync: "مراقب المزامنة",
  canAccessPOS: "تشغيل الكراسي وفتح الجلسات",
  canCancelOrder: "إلغاء فاتورة أو جلسة",
  canViewReports: "عرض التقارير",
  canViewProducts: "عرض المنتجات",
  canManageProducts: "إدارة المنتجات",
  canManageInventory: "إدارة المخزون",
  canManageCustomers: "عرض وإضافة العملاء",
  canEditCustomers: "تعديل/حذف العملاء",
  canManageStaff: "إدارة المستخدمين",
  canViewSettings: "الإعدادات",
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "مالك",
  manager: "مدير",
  cashier: "كاشير",
  stylist: "حلاق / أخصائي",
  employee: "موظف",
  // أدوار موروثة مش بتتعيّن هنا — الأسماء بس عشان أي مستخدم قديم يتعرض صح
  waiter: "نادل",
  chef: "طباخ",
  delivery: "ديليفري",
  seller: "بائع",
};

// وصف مختصر لكل دور — يُعرض في شاشة المستخدمين
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "كل الصلاحيات بدون استثناء، بما فيها الإعدادات والتقارير والمبيعات.",
  manager: "كل حاجة زي المالك ما عدا الإعدادات.",
  cashier:
    "الريسبشن — بيدخل بالـPIN: يفتح الجلسات على الكراسي ويحاسب ويرد على طلبات الحجز، ومابيشوفش مبيعات اليوم ولا التقارير. **مابيتسجّلش عليه خدمة فمالوش عمولة.** تقدر تخصّص له: الخصم والحضور والمصاريف وفواتير التوريد والموردين ومراقب المزامنة.",
  stylist:
    "بيدخل بالـPIN: يفتح جلسة على كرسي ويزوّد خدمات ويقفل. **الخدمة بتتسجّل باسمه وعمولته بتتحسب منها.** مابيشوفش فلوس اليوم ولا التقارير، وتقدر تخصّص له نفس صلاحيات الكاشير.",
  employee: "مالوش دخول للنظام — بنستخدمه في الحضور والمصاريف.",
  waiter: "دور موروث — مالوش دخول.",
  chef: "دور موروث — مالوش دخول.",
  delivery: "دور موروث — مالوش دخول.",
  seller: "دور قديم — مالوش دخول للنظام.",
};

function none(): Permissions {
  return {
    canGiveDiscount: false,
    canManageAttendance: false,
    canManageExpenses: false,
    canCreatePurchaseInvoices: false,
    canManageSuppliers: false,
    canViewSync: false,
    canAccessPOS: false,
    canCancelOrder: false,
    canViewReports: false,
    canViewProducts: false,
    canManageProducts: false,
    canManageInventory: false,
    canManageCustomers: false,
    canEditCustomers: false,
    canManageStaff: false,
    canViewSettings: false,
  };
}

function all(): Permissions {
  return {
    canGiveDiscount: true,
    canManageAttendance: true,
    canManageExpenses: true,
    canCreatePurchaseInvoices: true,
    canManageSuppliers: true,
    canViewSync: true,
    canAccessPOS: true,
    canCancelOrder: true,
    canViewReports: true,
    canViewProducts: true,
    canManageProducts: true,
    canManageInventory: true,
    canManageCustomers: true,
    canEditCustomers: true,
    canManageStaff: true,
    canViewSettings: true,
  };
}

// القدرات الثابتة لكل دور (قبل تطبيق التخصيص الخاص بالكاشير)
function roleCapabilities(role: Role): Permissions {
  switch (role) {
    case "owner":
      return all();
    case "manager":
      // المدير: كل حاجة ما عدا الإعدادات
      return { ...all(), canViewSettings: false };
    case "cashier":
    case "stylist":
      // الكاشير والحلاق: شاشات البيع + عرض المنتجات + إدارة العملاء (ثابتة)، والباقي من
      // التخصيص. **مفيش canViewReports** = مايشوفش فلوس اليوم.
      // (الفرق بينهم في الواجهة: الحلاق شغله الكراسي، والكاشير عنده بيع المنتجات كمان.)
      return {
        ...none(),
        canAccessPOS: true,
        canViewProducts: true,
        canManageCustomers: true,
      };
    case "employee":
    case "waiter":
    case "chef":
    case "delivery":
    case "seller":
      // مفيش أي وصول للنظام
      return none();
    default:
      return none();
  }
}

// الصلاحيات الافتراضية لدور — تُستخدم عند إنشاء مستخدم جديد
export function defaultPermissionsFor(role: Role): Permissions {
  return roleCapabilities(role);
}

// الصلاحيات الفعلية: الثابتة من الدور + التخصيص (للكاشير والنادل)
export function effectivePermissions(
  role: Role,
  stored: Partial<Permissions> | null | undefined
): Permissions {
  const base = roleCapabilities(role);
  if (!CUSTOMIZABLE_ROLES.includes(role) || !stored) return base;
  return {
    ...base,
    canGiveDiscount: stored.canGiveDiscount ?? false,
    canManageAttendance: stored.canManageAttendance ?? false,
    canManageExpenses: stored.canManageExpenses ?? false,
    canCreatePurchaseInvoices: stored.canCreatePurchaseInvoices ?? false,
    canManageSuppliers: stored.canManageSuppliers ?? false,
    canViewSync: stored.canViewSync ?? false,
  };
}
