"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  Coffee,
  Moon,
  Sun,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import { useOnlineOrdersStore } from "@/store/online-orders.store";
import { useBookingsStore } from "@/store/bookings.store";
import { ROLE_LABELS } from "@/shared/permissions";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const currentUser = useAuthStore((s) => s.currentUser);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const logout = useAuthStore((s) => s.logout);
  const shopName = useSettingsStore((s) => s.shopName);
  const shopLogo = useSettingsStore((s) => s.shopLogo);
  const newOrdersCount = useOnlineOrdersStore((s) => s.newCount);
  const newBookingsCount = useBookingsStore((s) => s.newCount);

  // يظهر العنصر لو مفيش متطلبات، أو المستخدم عنده أي صلاحية من المطلوبة
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.requires || item.requires.some((p) => hasPermission(p))
  );

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-[252px]"
      )}
    >
      {/* شعار + اسم المحل */}
      <div
        className={cn(
          "flex h-[68px] items-center gap-3 border-b px-4",
          "border-sidebar-border"
        )}
      >
        {shopLogo ? (
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-sidebar-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shopLogo}
              alt={shopName}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-accent to-primary text-white shadow-gold">
            <Coffee className="h-5 w-5" />
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight text-sidebar-foreground">
              {shopName}
            </p>
            <p className="text-[11px] font-medium tracking-wide text-sidebar-muted">
              FlexPay Beauty
            </p>
          </div>
        )}
      </div>

      {/* روابط التنقل */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {visibleItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-active font-semibold text-sidebar-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
              )}
            >
              {/* مؤشر ذهبي للعنصر النشط على الحافة الخارجية */}
              {active && (
                <span className="absolute right-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-l-full bg-sidebar-accent" />
              )}
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  active
                    ? "text-sidebar-accent"
                    : item.highlight
                      ? "text-sidebar-accent/80"
                      : "text-sidebar-muted group-hover:text-sidebar-foreground"
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {(() => {
                // بادج واحد لكل عنصر: طلبات المتجر أو الحجوزات (نفس الشكل)
                const badgeCount =
                  item.badge === "onlineOrders"
                    ? newOrdersCount
                    : item.badge === "bookings"
                      ? newBookingsCount
                      : 0;
                return badgeCount > 0 ? (
                  <span
                    className={cn(
                      "flex min-w-5 items-center justify-center rounded-full bg-sidebar-accent px-1.5 text-[11px] font-bold text-white",
                      collapsed ? "absolute right-1 top-1 h-4 min-w-4 px-1" : "mr-auto"
                    )}
                  >
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                ) : null;
              })()}
            </Link>
          );
        })}
      </nav>

      {/* أسفل الـ Sidebar: المستخدم + الثيم + خروج */}
      <div className="space-y-1.5 border-t border-sidebar-border p-2.5">
        {currentUser && (
          <Link
            href="/profile"
            title="ملفي الشخصي"
            className={cn(
              "flex items-center gap-3 rounded-lg bg-sidebar-hover px-2.5 py-2 transition-colors hover:bg-sidebar-accent/15",
              pathname.startsWith("/profile") && "ring-1 ring-sidebar-accent/40",
              collapsed && "justify-center bg-transparent px-0"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent/20 text-sm font-bold text-sidebar-accent">
              {currentUser.name.trim().charAt(0)}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {currentUser.name}
                </p>
                <p className="text-[11px] text-sidebar-muted">
                  {ROLE_LABELS[currentUser.role]}
                </p>
              </div>
            )}
          </Link>
        )}

        <div className={cn("flex gap-1.5", collapsed && "flex-col")}>
          <ThemeToggle collapsed={collapsed} />
          <SidebarIconButton
            onClick={() => void logout()}
            title="تسجيل الخروج"
            collapsed={collapsed}
            danger
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>خروج</span>}
          </SidebarIconButton>
        </div>

        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "فتح القائمة" : "طي القائمة"}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? (
            <PanelRightOpen className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <>
              <PanelRightClose className="h-[18px] w-[18px] shrink-0" />
              <span>طي القائمة</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function SidebarIconButton({
  children,
  onClick,
  title,
  collapsed,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  collapsed: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        danger
          ? "text-sidebar-muted hover:bg-danger/15 hover:text-danger"
          : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
        collapsed && "w-full"
      )}
    >
      {children}
    </button>
  );
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "الوضع الفاتح" : "الوضع الداكن"}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground",
        collapsed && "w-full"
      )}
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px] shrink-0" />
      ) : (
        <Moon className="h-[18px] w-[18px] shrink-0" />
      )}
      {!collapsed && <span>{isDark ? "فاتح" : "داكن"}</span>}
    </button>
  );
}
