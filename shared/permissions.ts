// طبقة مشتركة بين الـ Main Process والـ Renderer.
// تعريف الأدوار والصلاحيات.
//
// العقيدة:
// - مالك (owner): يقدر يعمل كل حاجة بدون استثناء (بما فيها الإعدادات).
// - مدير (manager): زي المالك بالظبط ما عدا الإعدادات.
// - كاشير (cashier): الصالة والكاشير (تيك أواي/توصيل) وطلبات المتجر. صلاحيات قابلة للتخصيص:
//     الخصم + الحضور والانصراف + المصاريف + التوريد + الموردين + المزامنة. الباقي ثابت = ممنوع.
// - نادل (waiter): الصالة بس — يفتح حساب الطاولة ويزوّد أصناف ويقفل. **مايشوفش فلوس اليوم**
//     ولا التقارير، ومابيقدرش يخصم ولا يلغي إلا لو اتخصّص له. صلاحياته قابلة للتخصيص زي الكاشير.
// - طباخ (chef): مالوش دخول للنظام — سجل في الحضور والمرتبات، وتذكرة المطبخ بتطلع باسمه.
// - ديليفري (delivery): مالوش دخول — بيتعيّن على أوردر التوصيل.
// - موظف (employee): مالوش وصول (نظافة/عام) — سجل في الحضور/المصاريف.
// ⚠️ «بائع» دور قديم مابيتعيّنش في المطعم — فاضل في النوع عشان أي مستخدم قديم في الداتابيز
//     يتقري من غير ما يكسر (والمزامنة بتبعته زي ما هو).

export type Role =
  | "owner"
  | "manager"
  | "cashier"
  | "waiter"
  | "chef"
  | "delivery"
  | "employee"
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
export const LOGIN_ROLES: Role[] = ["owner", "manager", "cashier", "waiter"];

// الأدوار اللي تتعيّن من شاشة المستخدمين (والـmain بيرفض غيرها) — «بائع» برّه المطعم
export const ASSIGNABLE_ROLES: Role[] = ["owner", "manager", "cashier", "waiter", "chef", "delivery", "employee"];
export function isAssignableRole(role: string): role is Role {
  return (ASSIGNABLE_ROLES as string[]).includes(role);
}
export function canLogin(role: Role): boolean {
  return LOGIN_ROLES.includes(role);
}

// الأدوار اللي ليها صلاحيات قابلة للتخصيص (الباقي قدراته ثابتة من دوره)
export const CUSTOMIZABLE_ROLES: Role[] = ["cashier", "waiter"];

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
  canAccessPOS: "تشغيل الغرف والبيع السريع",
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
  waiter: "نادل",
  chef: "طباخ",
  delivery: "ديليفري",
  employee: "موظف",
  // دور قديم مش بيتعيّن هنا — الاسم بس عشان لو فيه مستخدم قديم يتعرض صح
  seller: "بائع",
};

// وصف مختصر لكل دور — يُعرض في شاشة المستخدمين
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "كل الصلاحيات بدون استثناء، بما فيها الإعدادات والتقارير والمبيعات.",
  manager: "كل حاجة زي المالك ما عدا الإعدادات.",
  cashier:
    "بيدخل بالـPIN: الصالة والكاشير (تيك أواي وتوصيل) وطلبات المتجر، ومابيشوفش مبيعات اليوم ولا التقارير. تقدر تخصّص له: الخصم والحضور والمصاريف وفواتير التوريد والموردين ومراقب المزامنة.",
  waiter:
    "بيدخل بالـPIN للصالة بس: يفتح حساب الطاولة ويزوّد أصناف ويقفل. مابيشوفش فلوس اليوم ولا التقارير، وتقدر تخصّص له نفس صلاحيات الكاشير.",
  chef: "مالوش دخول للنظام — تذكرة المطبخ بتطلع له، وبنستخدمه في الحضور والمرتبات.",
  delivery: "مالوش دخول للنظام — بيتعيّن على أوردر التوصيل.",
  employee: "مالوش دخول للنظام — بنستخدمه في الحضور والمصاريف.",
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
    case "waiter":
      // الكاشير والنادل: شاشات البيع + عرض المنتجات + إدارة العملاء (ثابتة)، والباقي من
      // التخصيص. **مفيش canViewReports** = مايشوفش فلوس اليوم.
      // (الفرق بينهم في الواجهة: النادل شغله الصالة، والكاشير عنده التيك أواي والتوصيل كمان.)
      return {
        ...none(),
        canAccessPOS: true,
        canViewProducts: true,
        canManageCustomers: true,
      };
    case "chef":
    case "employee":
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
