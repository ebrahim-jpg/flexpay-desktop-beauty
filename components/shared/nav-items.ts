import type { LucideIcon } from "lucide-react";
import {
  Home,
  Package,
  Boxes,
  Users,
  UserCog,
  ClipboardList,
  BarChart3,
  Settings,
  RefreshCw,
  CalendarClock,
  UtensilsCrossed,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";
import type { Permissions } from "@/shared/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  highlight?: boolean; // شاشة البيع — زر مميز بلون Accent
  // يظهر العنصر لو المستخدم عنده أي صلاحية من دول. مفيش = يظهر للكل.
  requires?: (keyof Permissions)[];
  badge?: "onlineOrders" | "bookings"; // بادج حيّ (عدّاد الطلبات/الحجوزات الجديدة)
}

// ⚠️ نسخة «المطاعم»: شاشتين بيع — **الكراسي** (كراسي بحسابات مفتوحة) و**الكاشير**
// (تيك أواي/توصيل). «طلبات المتجر» ظاهرة لأن الرابط العام منيو + حجز كراسي مع بعض.
// مفيش غرف ولا تسعير بالوقت.
// الحراس: scripts/verify-restaurant-shell.js · scripts/verify-restaurant-no-rooms.js
export const NAV_ITEMS: NavItem[] = [
  {
    label: "الكراسي",
    href: "/tables",
    icon: UtensilsCrossed,
    highlight: true,
    requires: ["canAccessPOS"],
  },
  {
    // تيك أواي وتوصيل — أسرع من فتح حساب كرسي للزبون اللي واقف على الكاشير
    label: "الكاشير",
    href: "/pos",
    icon: ShoppingBag,
    highlight: true,
    requires: ["canAccessPOS"],
  },
  {
    // الطلبات الجايّة من المنيو الأونلاين — البادج بيبان وهو على شاشة البيع
    label: "طلبات المتجر",
    href: "/store-orders",
    icon: ShoppingCart,
    requires: ["canAccessPOS"],
    badge: "onlineOrders",
  },
  {
    // الحجز الأونلاين — الطلبات الجايّة من رابط المحل. بعد «الكراسي» على طول عشان
    // الموظف يشوف البادج وهو على شاشة البيع.
    label: "طلبات الحجز",
    href: "/bookings",
    icon: CalendarClock,
    requires: ["canAccessPOS"],
    badge: "bookings",
  },
  { label: "الرئيسية", href: "/", icon: Home },
  { label: "المنتجات", href: "/products", icon: Package, requires: ["canViewProducts"] },
  {
    label: "المخزون",
    href: "/inventory",
    icon: Boxes,
    requires: ["canManageInventory", "canCreatePurchaseInvoices", "canManageSuppliers"],
  },
  { label: "العملاء", href: "/customers", icon: Users, requires: ["canManageCustomers"] },
  { label: "المستخدمين", href: "/staff", icon: UserCog, requires: ["canManageStaff"] },
  {
    label: "الإدارة",
    href: "/management",
    icon: ClipboardList,
    requires: ["canManageAttendance", "canManageExpenses"],
  },
  { label: "التقارير", href: "/reports", icon: BarChart3, requires: ["canViewReports"] },
  { label: "الإعدادات", href: "/settings", icon: Settings, requires: ["canViewSettings"] },
  {
    label: "مراقب المزامنة",
    href: "/sync-monitor",
    icon: RefreshCw,
    requires: ["canViewSync"],
  },
];
