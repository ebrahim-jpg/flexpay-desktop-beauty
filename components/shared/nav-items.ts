import type { LucideIcon } from "lucide-react";
import {
  Home,
  Boxes,
  Users,
  UserCog,
  ClipboardList,
  BarChart3,
  Settings,
  RefreshCw,
  CalendarClock,
  Armchair,
  Scissors,
} from "lucide-react";
import type { Permissions } from "@/shared/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  highlight?: boolean; // شاشة البيع — زر مميز بلون Accent
  // يظهر العنصر لو المستخدم عنده أي صلاحية من دول. مفيش = يظهر للكل.
  requires?: (keyof Permissions)[];
  badge?: "bookings"; // بادج حيّ (عدّاد الحجوزات الجديدة)
}

// ⚠️ نسخة «التجميل»: **شاشة بيع واحدة** — الكراسي بجلسات. مفيش كاشير ومفيش
// «طلبات المتجر»، لأن النسخة دي **خدمات بس** (سياسة الشركة: اللي بيبيع بضاعة
// بياخد نسخة البيع بالتجزئة). الرابط العام = قائمة خدمات + حجز مواعيد.
// مفيش غرف ولا تسعير بالوقت.
// الحارس: scripts/verify-beauty-shell.js · scripts/verify-no-retail.js
export const NAV_ITEMS: NavItem[] = [
  {
    label: "الكراسي",
    href: "/tables",
    icon: Armchair,
    highlight: true,
    requires: ["canAccessPOS"],
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
  { label: "الخدمات", href: "/products", icon: Scissors, requires: ["canViewProducts"] },
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
