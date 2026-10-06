"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShoppingBag,
  Receipt,
  Wallet,
  TrendingUp,
  UserPlus,
  UserCheck,
  PackageMinus,
  AlertTriangle,
  XCircle,
  BellRing,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatsCard } from "@/components/shared/StatsCard";
import { Card } from "@/components/ui/card";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { OrderDetailsModal } from "@/components/orders/OrderDetailsModal";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import { useIPC } from "@/hooks/useIPC";
import { businessDateKey } from "@/shared/business-day";
import { cn } from "@/lib/utils";
import type { OrderDTO } from "@/shared/orders";
import type { DashboardSummary } from "@/shared/reports";

export default function DashboardPage() {
  const { invoke } = useIPC();
  const currentUser = useAuthStore((s) => s.currentUser);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const businessDayStart = useSettingsStore((s) => s.businessDayStart);

  // canViewReports = المالك/المدير يشوفوا أرقام المبيعات والصافي.
  // الكاشير/الموظف العادي يشوف كروت تشغيلية بدالها (مش أسرار شغل).
  const canSeeBusiness = hasPermission("canViewReports");
  const canSeeFinance = hasPermission("canManageExpenses");

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [presentCount, setPresentCount] = useState(0);
  const [selected, setSelected] = useState<OrderDTO | null>(null);

  const load = useCallback(async () => {
    const todayKey = businessDateKey(new Date(), businessDayStart);
    try {
      // فواتير اليوم = مبيعات اليوم → بتتطلب للي معاه canViewReports بس (والـmain بيرفضها لغيره)
      const [sum, todayOrders, staff] = await Promise.all([
        invoke("dashboard:getTodaySummary"),
        canSeeBusiness ? invoke("orders:getByDate", { businessDate: todayKey }) : Promise.resolve([]),
        invoke("attendance:getCurrentStatus"),
      ]);
      setSummary(sum);
      setOrders(todayOrders);
      setPresentCount(staff.filter((p) => p.present).length);
    } catch {
      /* الداشبورد للعرض السريع */
    }
  }, [invoke, businessDayStart, canSeeBusiness]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`مرحباً ${currentUser?.name ?? ""}، كل شيء جاهز`}
        description="نظرة سريعة على اليوم التجاري"
      />

      {/* بطاقات الإحصاء — أرقام المبيعات للمالك/المدير فقط */}
      {canSeeBusiness ? (
        <div
          className={cn(
            "grid grid-cols-1 gap-4 sm:grid-cols-2",
            canSeeFinance ? "lg:grid-cols-5" : "lg:grid-cols-4"
          )}
        >
          <StatsCard
            title="مبيعات اليوم"
            value={formatCurrency(s?.todaySales ?? 0)}
            icon={ShoppingBag}
            tone="primary"
          />
          <StatsCard title="عدد الفواتير" value={s?.todayOrders ?? 0} icon={Receipt} tone="accent" />
          <StatsCard
            title="متوسط الفاتورة"
            value={formatCurrency(s?.avgOrderValue ?? 0)}
            icon={TrendingUp}
            tone="success"
          />
          {canSeeFinance && (
            <StatsCard
              title="صافي اليوم"
              value={formatCurrency(s?.todayNet ?? 0)}
              icon={Wallet}
              tone={(s?.todayNet ?? 0) >= 0 ? "success" : "danger"}
              hint={`مصاريف: ${formatCurrency(s?.todayExpenses ?? 0)}`}
            />
          )}
          <StatsCard
            title="عملاء جدد"
            value={`+${s?.newCustomers ?? 0}`}
            icon={UserPlus}
            tone="accent"
          />
        </div>
      ) : (
        // كروت تشغيلية للكاشير/الموظف — مفيدة من غير ما تكشف أسرار الشغل
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="مصاريف اليوم"
            value={formatCurrency(s?.todayExpenses ?? 0)}
            icon={Wallet}
            tone="accent"
          />
          <StatsCard
            title="حاضرين دلوقتي"
            value={presentCount}
            icon={UserCheck}
            tone="success"
          />
          <StatsCard
            title="مخزون منخفض"
            value={s?.lowStockCount ?? 0}
            icon={AlertTriangle}
            tone="warning"
            hint="بلّغ المدير لو حاجة قربت تخلص"
          />
          <StatsCard
            title="نفذ من المخزون"
            value={s?.outOfStockCount ?? 0}
            icon={PackageMinus}
            tone="danger"
          />
        </div>
      )}

      {/* تنبيهات */}
      {s && s.alerts.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <BellRing className="h-5 w-5 text-warning" />
            <h2 className="font-bold text-text-primary">تنبيهات</h2>
          </div>
          <div className="space-y-2">
            {s.alerts.map((a, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-lg p-2.5 text-sm",
                  a.kind === "out_of_stock"
                    ? "bg-danger/10 text-danger"
                    : "bg-warning/10 text-warning"
                )}
              >
                {a.kind === "out_of_stock" ? (
                  <XCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span>{a.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* فواتير اليوم — للمالك/المدير بس */}
      {canSeeBusiness && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-text-primary">فواتير اليوم</h2>
          <OrdersTable
            orders={orders}
            onSelect={setSelected}
            emptyHint="لسه مفيش فواتير النهارده. هتظهر هنا كل فاتورة تتعمل على الكراسي."
          />
        </div>
      )}

      <OrderDetailsModal
        order={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={load}
      />
    </div>
  );
}
