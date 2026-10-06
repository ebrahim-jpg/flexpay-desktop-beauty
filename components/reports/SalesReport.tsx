"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Printer,
  Receipt,
  Wallet,
  Percent,
  Banknote,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Gift,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StatsCard } from "@/components/shared/StatsCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { DayNavigator } from "./DayNavigator";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { businessDateKey, shiftDateKey } from "@/shared/business-day";
import { formatQty } from "@/shared/orders";
import { REPORT_WINDOW_DAYS } from "@/shared/reports";
import type { SalesDayReport, SalesOrderRow, SalesSummaryPrintData } from "@/shared/reports";

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const catOf = (name: string | null) => name ?? "بدون فئة";

export function SalesReport() {
  const { invoke } = useIPC();
  const businessDayStart = useSettingsStore((s) => s.businessDayStart);
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const paymentMethods = useSettingsStore((s) => s.paymentMethods);

  const todayKey = useMemo(
    () => businessDateKey(new Date(), businessDayStart),
    [businessDayStart]
  );
  const minKey = useMemo(
    () => shiftDateKey(todayKey, -(REPORT_WINDOW_DAYS - 1)),
    [todayKey]
  );

  const [dateKey, setDateKey] = useState(todayKey);
  const [report, setReport] = useState<SalesDayReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashier, setCashier] = useState<number | "all">("all");
  const [category, setCategory] = useState("all");
  const [perCategory, setPerCategory] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "sales" | "free">("all");
  // ⚠️ مفيش فلتر «مصدر»: الكاشير والمتجر اتشالوا، فكل فاتورة مصدرها جلسة كرسي.
  const [expanded, setExpanded] = useState<number | null>(null);

  const paymentLabel = useCallback(
    (key: string) => paymentMethods.find((m) => m.key === key)?.label ?? key,
    [paymentMethods]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await invoke("reports:getSalesByDay", dateKey);
      setReport(r);
      setExpanded(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل التقرير");
    } finally {
      setLoading(false);
    }
  }, [invoke, dateKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // لما الفئة ترجع "الكل" يتلغى وضع حساب الفئة
  useEffect(() => {
    if (category === "all") setPerCategory(false);
  }, [category]);

  // فئات اليوم كله (تفضل ثابتة في القائمة)
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    report?.orders.forEach((o) => o.items.forEach((i) => set.add(catOf(i.category_name))));
    return Array.from(set).sort();
  }, [report]);

  // قيمة الطلب حسب الوضع: كامل أو بقيمة الفئة المختارة فقط
  const orderAmount = useCallback(
    (o: SalesOrderRow) => {
      if (perCategory && category !== "all") {
        return o.items
          .filter((i) => catOf(i.category_name) === category)
          .reduce((s, i) => s + i.total_price, 0);
      }
      return o.total;
    },
    [perCategory, category]
  );

  // الفواتير بعد فلتر الموظف ثم المصدر ثم الفئة
  const visibleOrders = useMemo(() => {
    if (!report) return [];
    let list = report.orders;
    if (cashier !== "all") list = list.filter((o) => o.cashier_id === cashier);
    if (category !== "all") {
      list = list.filter((o) =>
        o.items.some((i) => catOf(i.category_name) === category)
      );
    }
    return list;
  }, [report, cashier, category]);

  // أساس الفلوس: المدفوع وغير المجاني فقط (المجانية متتحسبش خالص)
  const paidVisible = useMemo(
    () => visibleOrders.filter((o) => o.status === "paid" && !o.is_free),
    [visibleOrders]
  );

  // الفواتير المجانية الظاهرة (للمراجعة فقط — قيمة غير محسوبة)
  const freeVisible = useMemo(
    () => visibleOrders.filter((o) => o.is_free),
    [visibleOrders]
  );
  const freeValue = useMemo(
    () => freeVisible.reduce((s, o) => s + orderAmount(o), 0),
    [freeVisible, orderAmount]
  );

  // صفوف الجدول حسب فلتر النوع
  const tableOrders = useMemo(() => {
    if (typeFilter === "sales") return visibleOrders.filter((o) => !o.is_free);
    if (typeFilter === "free") return visibleOrders.filter((o) => o.is_free);
    return visibleOrders;
  }, [visibleOrders, typeFilter]);

  // مصاريف اليوم بعد فلتر الموظف
  const visibleExpenses = useMemo(() => {
    if (!report) return [];
    return cashier === "all"
      ? report.expenses
      : report.expenses.filter((e) => e.created_by === cashier);
  }, [report, cashier]);

  const stats = useMemo(() => {
    const revenue = paidVisible.reduce((s, o) => s + orderAmount(o), 0);
    const discount =
      perCategory && category !== "all"
        ? 0
        : paidVisible.reduce((s, o) => s + o.discount_amount, 0);
    const expenses = visibleExpenses.reduce((s, e) => s + e.drawer_amount, 0);
    return {
      orders: paidVisible.length,
      revenue,
      discount,
      expenses,
      net: revenue - expenses,
    };
  }, [paidVisible, visibleExpenses, orderAmount, perCategory, category]);

  // تفصيل حسب طريقة الدفع (من الطلبات الظاهرة)
  const byPayment = useMemo(() => {
    const m = new Map<string, { count: number; revenue: number }>();
    for (const o of paidVisible) {
      const cur = m.get(o.payment_method) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += orderAmount(o);
      m.set(o.payment_method, cur);
    }
    return Array.from(m.entries())
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidVisible, orderAmount]);

  // تفصيل حسب الفئة (من بنود الطلبات الظاهرة)
  const byCategory = useMemo(() => {
    const m = new Map<string, { count: number; revenue: number }>();
    for (const o of paidVisible) {
      for (const i of o.items) {
        const c = catOf(i.category_name);
        if (perCategory && category !== "all" && c !== category) continue;
        const cur = m.get(c) ?? { count: 0, revenue: 0 };
        cur.count += 1;
        cur.revenue += i.total_price;
        m.set(c, cur);
      }
    }
    return Array.from(m.entries())
      .map(([cat, v]) => ({ category: cat, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidVisible, perCategory, category]);

  // طباعة ملخص حراري (بدل ما المتصفح يطبع كل الفواتير) — يحترم الفلاتر الحالية
  const printSummary = useCallback(async () => {
    const payload: SalesSummaryPrintData = {
      date: dateKey,
      cashierName:
        cashier === "all"
          ? null
          : report?.cashiers.find((c) => c.id === cashier)?.name ?? null,
      orders: stats.orders,
      revenue: stats.revenue,
      discount: stats.discount,
      expenses: stats.expenses,
      net: stats.net,
      byCategory: byCategory.map((c) => ({
        name: c.category,
        count: c.count,
        revenue: c.revenue,
      })),
      byPayment: byPayment.map((p) => ({
        label: paymentMethods.find((m) => m.key === p.method)?.label ?? p.method,
        count: p.count,
        revenue: p.revenue,
      })),
    };
    try {
      await invoke("reports:printSalesSummary", payload);
      toast.success("اتبعت للطابعة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت الطباعة");
    }
  }, [dateKey, cashier, report, stats, byCategory, byPayment, paymentMethods, invoke]);

  if (loading && !report) return <LoadingSkeleton rows={6} />;
  if (!report) return null;

  return (
    <div className="space-y-5">
      {/* أدوات التحكم (لا تُطبع) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <DayNavigator
          dateKey={dateKey}
          todayKey={todayKey}
          minKey={minKey}
          onChange={setDateKey}
        />
        <Button variant="outline" onClick={() => void printSummary()}>
          <Printer className="h-4 w-4" />
          طباعة الملخص
        </Button>
      </div>

      <div className="print-report space-y-5">
        {/* الفلاتر */}
        <div className="no-print flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-sm text-text-secondary">الوردية (الموظف)</label>
            <Select
              value={String(cashier)}
              onChange={(e) =>
                setCashier(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="min-w-[180px]"
            >
              <option value="all">كل الموظفين</option>
              {report.cashiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-secondary">الفئة</label>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-w-[160px]"
            >
              <option value="all">كل الفئات</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-text-secondary">النوع</label>
            <Select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as "all" | "sales" | "free")
              }
              className="min-w-[150px]"
            >
              <option value="all">الكل</option>
              <option value="sales">المبيعات فقط</option>
              <option value="free">المجانية فقط</option>
            </Select>
          </div>


          {category !== "all" && (
            <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <Switch checked={perCategory} onCheckedChange={setPerCategory} />
              <span className="text-sm text-text-primary">
                احسب بقيمة الفئة فقط
              </span>
            </label>
          )}
        </div>

        {/* بطاقات الإحصاء — التقفيل اليومي */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatsCard title="عدد الفواتير" value={stats.orders} icon={Receipt} tone="primary" />
          <StatsCard
            title="الإيرادات"
            value={formatCurrency(stats.revenue)}
            icon={Wallet}
            tone="success"
          />
          <StatsCard
            title="الخصومات"
            value={formatCurrency(stats.discount)}
            icon={Percent}
            tone="accent"
          />
          <StatsCard
            title="المصروفات"
            value={formatCurrency(stats.expenses)}
            icon={Banknote}
            tone="warning"
          />
          <StatsCard
            title="الصافي"
            value={formatCurrency(stats.net)}
            icon={TrendingUp}
            tone={stats.net >= 0 ? "success" : "danger"}
          />
        </div>

        {/* الفواتير المجانية — للمراجعة فقط، غير محسوبة في الفلوس */}
        {freeVisible.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-sm">
            <Gift className="h-4 w-4 shrink-0 text-danger" />
            <span className="text-text-secondary">
              <b className="text-danger">{freeVisible.length}</b> فاتورة مجانية بقيمة{" "}
              <b className="text-danger tabular-nums">{formatCurrency(freeValue)}</b> — مش
              داخلة في الإيرادات أو الصافي (للمراجعة بس).
            </span>
          </div>
        )}

        {/* تفصيل */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BreakdownCard title="حسب الفئة">
            {byCategory.length === 0 ? (
              <EmptyRow />
            ) : (
              byCategory.map((c) => (
                <BreakdownRow
                  key={c.category}
                  label={`${c.category} (${c.count})`}
                  value={formatCurrency(c.revenue)}
                />
              ))
            )}
          </BreakdownCard>
          <BreakdownCard title="حسب طريقة الدفع">
            {byPayment.length === 0 ? (
              <EmptyRow />
            ) : (
              byPayment.map((p) => (
                <BreakdownRow
                  key={p.method}
                  label={`${paymentLabel(p.method)} (${p.count})`}
                  value={formatCurrency(p.revenue)}
                />
              ))
            )}
          </BreakdownCard>
        </div>

        {/* جدول الفواتير */}
        <Card className="overflow-hidden">
          {tableOrders.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="مفيش فواتير"
              description="مفيش مبيعات مطابقة للفلاتر المختارة."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-border text-text-secondary">
                  <tr>
                    <th className="p-3 font-medium">الوقت</th>
                    <th className="p-3 font-medium">الفاتورة</th>
                    <th className="p-3 font-medium">العميل</th>
                    <th className="p-3 font-medium">الأصناف</th>
                    <th className="p-3 font-medium">
                      {perCategory && category !== "all" ? `إجمالي ${category}` : "الإجمالي"}
                    </th>
                    <th className="p-3 font-medium">الدفع</th>
                    <th className="p-3 font-medium">الموظف</th>
                    <th className="p-3 font-medium">الحالة</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {tableOrders.map((o) => (
                    <Fragment key={o.id}>
                      <tr
                        onClick={() => setExpanded((p) => (p === o.id ? null : o.id))}
                        className={
                          "cursor-pointer border-b border-border transition-colors hover:bg-surface-secondary " +
                          (o.is_free || o.status === "cancelled" ? "bg-danger/5" : "")
                        }
                      >
                        <td className="p-3 text-text-secondary">{timeOf(o.time)}</td>
                        <td className="p-3 font-medium text-text-primary">{o.receipt_label}</td>
                        <td className="p-3 text-text-primary">
                          {o.is_free && o.free_recipient_name ? (
                            <span className="text-danger">
                              {o.free_recipient_name}
                              <span className="mr-1 text-xs opacity-70">
                                ({o.free_recipient_type === "staff" ? "موظف" : "عميل"})
                              </span>
                            </span>
                          ) : (
                            o.customer_name
                          )}
                        </td>
                        <td className="p-3 text-text-secondary">{o.items_count} صنف</td>
                        <td
                          className={
                            "p-3 font-semibold tabular-nums " +
                            (o.is_free ? "text-danger line-through decoration-danger/50" : "text-primary")
                          }
                        >
                          {formatCurrency(orderAmount(o))}
                        </td>
                        <td className="p-3 text-text-secondary">
                          {o.is_free ? "—" : paymentLabel(o.payment_method)}
                        </td>
                        <td className="p-3 text-text-secondary">{o.cashier_name}</td>
                        <td className="p-3">
                          {o.status === "cancelled" ? (
                            <Badge variant="danger">ملغي</Badge>
                          ) : o.is_free ? (
                            <Badge variant="danger">مجانية</Badge>
                          ) : (
                            <Badge variant="success">مدفوع</Badge>
                          )}
                        </td>
                        <td className="p-3 text-text-secondary">
                          {expanded === o.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </td>
                      </tr>
                      {expanded === o.id && (
                        <tr className="bg-surface-secondary/40">
                          <td colSpan={9} className="p-4">
                            <OrderDetails order={o} highlightCategory={perCategory ? category : "all"} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );

  function OrderDetails({
    order,
    highlightCategory,
  }: {
    order: SalesOrderRow;
    highlightCategory: string;
  }) {
    return (
      <div className="mx-auto max-w-xl space-y-1.5 text-sm">
        {order.items.map((it, i) => {
          const dimmed =
            highlightCategory !== "all" && catOf(it.category_name) !== highlightCategory;
          return (
            <div
              key={i}
              className={"flex items-center justify-between " + (dimmed ? "opacity-40" : "")}
            >
              <span className="text-text-primary">
                {it.product_name} {formatQty(it.quantity, it.sale_type)}
                {it.selected_modifiers.length > 0 && (
                  <span className="mr-1 text-xs text-text-secondary">
                    ({it.selected_modifiers.map((m) => m.option_name).join("، ")})
                  </span>
                )}
              </span>
              <span className="text-text-secondary tabular-nums">
                {formatCurrency(it.total_price)}
              </span>
            </div>
          );
        })}
        <div className="mt-2 space-y-1 border-t border-border pt-2">
          <DetailRow label="المجموع الفرعي" value={formatCurrency(order.subtotal)} />
          {order.discount_amount > 0 && (
            <DetailRow label="الخصم" value={`−${formatCurrency(order.discount_amount)}`} />
          )}
          {order.tax_amount > 0 && (
            <DetailRow label={`الضريبة (${order.tax_rate}%)`} value={`+${formatCurrency(order.tax_amount)}`} />
          )}
          <div className="flex items-center justify-between font-bold">
            <span>الإجمالي</span>
            <span className="text-primary tabular-nums">{formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>
    );
  }

  function DetailRow({ label, value }: { label: string; value: string }) {
    return (
      <div className="flex items-center justify-between text-text-secondary">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
    );
  }
}

function BreakdownCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="mb-3 font-semibold text-text-primary">{title}</p>
      <div className="space-y-1.5 text-sm">{children}</div>
    </Card>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

function EmptyRow() {
  return <p className="text-sm text-text-secondary">مفيش بيانات</p>;
}
