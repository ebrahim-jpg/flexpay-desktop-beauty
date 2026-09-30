"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Inbox,
  Phone,
  MapPin,
  Clock,
  Package,
  RefreshCw,
  Rocket,
  CheckCircle2,
  Printer,
  Eye,
  Archive,
  CalendarDays,
  XCircle,
  StickyNote,
  Ban,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIPC } from "@/hooks/useIPC";
import { useOnlineOrdersStore, PREPARE_ORDER_KEY } from "@/store/online-orders.store";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/lib/utils";
import {
  formatOnlineQty,
  type OnlineOrderDTO,
  type OnlineOrderArchiveDay,
} from "@/shared/online-orders";

const fmt = (n: number) => `${n.toLocaleString("ar-EG")} ج`;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtDay(date: string): string {
  try {
    return new Date(date + "T00:00:00").toLocaleDateString("ar-EG", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return date;
  }
}

type Tab = "today" | "archive";
type StatusFilter = "all" | "new" | "done";

export default function StoreOrdersPage() {
  const { invoke } = useIPC();
  const refreshCount = useOnlineOrdersStore((s) => s.refresh);
  const router = useRouter();
  const canPOS = useAuthStore((s) => s.hasPermission("canAccessPOS"));

  const [tab, setTab] = useState<Tab>("today");
  const [orders, setOrders] = useState<OnlineOrderDTO[]>([]);
  const [archiveDays, setArchiveDays] = useState<OnlineOrderArchiveDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<OnlineOrderDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<OnlineOrderDTO | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const loadToday = useCallback(async () => {
    try {
      const list = await invoke("onlineOrders:list");
      setOrders(list);
      void refreshCount();
    } catch {
      /* تجاهل */
    } finally {
      setLoading(false);
    }
  }, [invoke, refreshCount]);

  const loadArchive = useCallback(async () => {
    try {
      const days = await invoke("onlineOrders:archiveDays");
      setArchiveDays(days);
      if (days.length > 0) {
        const first = days[0].date;
        setSelectedDate(first);
        setOrders(await invoke("onlineOrders:listForDate", first));
      } else {
        setSelectedDate(null);
        setOrders([]);
      }
    } catch {
      /* تجاهل */
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    setLoading(true);
    if (tab === "today") {
      void loadToday();
      const t = setInterval(() => void loadToday(), 15_000);
      return () => clearInterval(t);
    }
    void loadArchive();
  }, [tab, loadToday, loadArchive]);

  async function pickDay(date: string) {
    setSelectedDate(date);
    try {
      setOrders(await invoke("onlineOrders:listForDate", date));
    } catch {
      /* تجاهل */
    }
  }

  async function print(order: OnlineOrderDTO) {
    setBusyId(order.local_id);
    try {
      await invoke("onlineOrders:printTicket", order.local_id);
      toast.success("اتبعت تذكرة التجهيز للطباعة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت الطباعة — راجع الطابعة");
    } finally {
      setBusyId(null);
    }
  }

  // رفض الطلب: الزبون لغى · البضاعة خلصت · طلب وهمي. بيترفع للويب في أول دورة
  // مزامنة فالزبون يشوف «ملغي» بدل ما يفضل مستني.
  async function reject(order: OnlineOrderDTO, reason: string | null) {
    setBusyId(order.local_id);
    try {
      await invoke("onlineOrders:cancel", { localId: order.local_id, reason });
      toast.success("الطلب اترفض — الزبون هيشوف إنه ملغي");
      setRejecting(null);
      setDetail(null);
      if (tab === "today") await loadToday();
      else if (selectedDate) setOrders(await invoke("onlineOrders:listForDate", selectedDate));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر رفض الطلب");
    } finally {
      setBusyId(null);
    }
  }

  // تجهيز طلب المتجر: بنسيب رقمه في localStorage ونروح الكاشير، والكاشير هو اللي يملّي
  // السلة أول ما يفتح (بيعيش عبر إعادة التحميل في نسخة الإنتاج).
  // ⚠️ المطعم: الطلب ده أكل بيتوصّل — فالكاشير بيفتحه على «توصيل» بعنوان العميل.
  function prepare(order: OnlineOrderDTO) {
    try {
      window.localStorage.setItem(PREPARE_ORDER_KEY, order.local_id);
    } catch {
      /* تجاهل */
    }
    router.push("/pos");
  }

  // عدّادات الفلتر + الطلبات المعروضة (الجديد الأول دايماً)
  const counts = {
    all: orders.length,
    new: orders.filter((o) => o.status === "new").length,
    done: orders.filter((o) => o.status === "done").length,
  };
  const visible = orders
    .filter((o) =>
      statusFilter === "all"
        ? true
        : statusFilter === "new"
          ? o.status === "new"
          : o.status === "done"
    )
    .slice()
    .sort((a, b) => (a.status === "new" ? 0 : 1) - (b.status === "new" ? 0 : 1));

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات المتجر"
        description="الطلبات الجايّة من متجرك الإلكتروني — جهّزها واطبعها واضربها على الكاشير."
        action={
          tab === "today" ? (
            <Button variant="outline" size="sm" onClick={() => void loadToday()}>
              <RefreshCw className="size-4" />
              تحديث
            </Button>
          ) : undefined
        }
      />

      {/* تبويبات */}
      <div className="inline-flex rounded-xl bg-surface-secondary p-1">
        <TabButton active={tab === "today"} onClick={() => setTab("today")} icon={Inbox}>
          النهارده
        </TabButton>
        <TabButton active={tab === "archive"} onClick={() => setTab("archive")} icon={Archive}>
          الأرشيف
        </TabButton>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
      ) : tab === "today" ? (
        orders.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="مفيش طلبات النهارده"
            description="أول ما عميل يطلب من متجرك هيظهر هنا تلقائياً مع صوت وإشعار."
          />
        ) : (
          <div className="space-y-4">
            <StatusFilterBar value={statusFilter} onChange={setStatusFilter} counts={counts} />
            {visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-text-secondary">
                مفيش طلبات في الفلتر ده
              </p>
            ) : (
              <div className="space-y-3">
                {visible.map((o) => (
                  <OrderCard
                    key={o.local_id}
                    order={o}
                    canPOS={canPOS}
                    busy={busyId === o.local_id}
                    onDetail={() => setDetail(o)}
                    onPrint={() => void print(o)}
                    onPrepare={() => void prepare(o)}
                    onReject={() => setRejecting(o)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        // الأرشيف
        archiveDays.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="الأرشيف فاضي"
            description="طلبات الأيام السابقة (آخر 30 يوم) هتظهر هنا."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
            {/* أيام الأرشيف */}
            <div className="space-y-1.5">
              {archiveDays.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => void pickDay(d.date)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-right text-sm transition",
                    selectedDate === d.date
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-text-primary hover:bg-surface-secondary"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4 shrink-0" />
                    <span className="truncate">{fmtDay(d.date)}</span>
                  </span>
                  <Badge variant="muted">{d.count.toLocaleString("ar-EG")}</Badge>
                </button>
              ))}
            </div>
            {/* طلبات اليوم المختار */}
            <div className="space-y-4">
              {orders.length > 0 && (
                <StatusFilterBar value={statusFilter} onChange={setStatusFilter} counts={counts} />
              )}
              <div className="space-y-3">
                {orders.length === 0 ? (
                  <p className="py-10 text-center text-sm text-text-secondary">مفيش طلبات في اليوم ده</p>
                ) : visible.length === 0 ? (
                  <p className="py-10 text-center text-sm text-text-secondary">مفيش طلبات في الفلتر ده</p>
                ) : (
                  visible.map((o) => (
                    <OrderCard
                      key={o.local_id}
                      order={o}
                      canPOS={canPOS}
                      busy={busyId === o.local_id}
                      onDetail={() => setDetail(o)}
                      onPrint={() => void print(o)}
                      onPrepare={() => void prepare(o)}
                      onReject={() => setRejecting(o)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )
      )}

      <OrderDetailDialog
        order={detail}
        canPOS={canPOS}
        busy={detail ? busyId === detail.local_id : false}
        onClose={() => setDetail(null)}
        onPrint={() => detail && void print(detail)}
        onPrepare={() => {
          if (detail) void prepare(detail);
        }}
        onReject={() => detail && setRejecting(detail)}
      />

      <RejectDialog
        order={rejecting}
        busy={rejecting ? busyId === rejecting.local_id : false}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => {
          if (rejecting) void reject(rejecting, reason);
        }}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Inbox;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-surface text-text-primary shadow-sm"
          : "text-text-secondary hover:text-text-primary"
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}

function StatusFilterBar({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts: { all: number; new: number; done: number };
}) {
  const opts: { key: StatusFilter; label: string; count: number; accent?: boolean }[] = [
    { key: "all", label: "الكل", count: counts.all },
    { key: "new", label: "محتاجة تجهيز", count: counts.new, accent: true },
    { key: "done", label: "جهّزت", count: counts.done },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
            value === o.key
              ? "border-primary bg-primary text-white"
              : "border-border bg-surface text-text-secondary hover:text-text-primary"
          )}
        >
          {o.label}
          <span
            className={cn(
              "flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs",
              value === o.key
                ? "bg-white/20 text-white"
                : o.accent && o.count > 0
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-secondary text-text-secondary"
            )}
          >
            {o.count.toLocaleString("ar-EG")}
          </span>
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: OnlineOrderDTO["status"] }) {
  if (status === "new") return <Badge variant="accent">جديد</Badge>;
  if (status === "done")
    return (
      <Badge variant="success">
        <CheckCircle2 className="ml-1 size-3" /> اتجهّز
      </Badge>
    );
  return (
    <Badge variant="muted">
      <XCircle className="ml-1 size-3" /> ملغي
    </Badge>
  );
}

function OrderCard({
  order,
  canPOS,
  busy,
  onDetail,
  onPrint,
  onPrepare,
  onReject,
}: {
  order: OnlineOrderDTO;
  canPOS: boolean;
  busy: boolean;
  onDetail: () => void;
  onPrint: () => void;
  onPrepare: () => void;
  onReject: () => void;
}) {
  const isNew = order.status === "new";
  // الملغي يفضل قابل للتجهيز: لو الكاشير لغى الفاتورة عشان يصلّح غلطة، لازم يقدر
  // يضربها تاني — و attachOrder بترجّع الطلب «اتسلّم» لوحدها.
  const isCancelled = order.status === "cancelled";
  const stripe =
    order.status === "new"
      ? "bg-accent"
      : order.status === "done"
        ? "bg-success"
        : "bg-border";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition hover:shadow-md">
      <div className="flex">
        <div className={cn("w-1.5 shrink-0", stripe)} />
        <div className="flex-1 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-text-primary">
                  {order.customer_name || order.customer_phone}
                </span>
                <StatusBadge status={order.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1" dir="ltr">
                  <Phone className="size-3.5" />
                  {order.customer_phone}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Package className="size-3.5" />
                  {order.items_count.toLocaleString("ar-EG")} صنف
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {fmtTime(order.web_created_at ?? order.pulled_at)}
                </span>
              </div>
              {order.address && (
                <p className="flex items-start gap-1 text-xs text-text-secondary">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <span className="line-clamp-1">{order.address}</span>
                </p>
              )}
            </div>
            <span className="text-lg font-extrabold text-text-primary">{fmt(order.subtotal)}</span>
          </div>

          {/* معاينة أول الأصناف */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {order.items.slice(0, 4).map((it, i) => (
              <span
                key={i}
                className="rounded-md bg-surface-secondary px-2 py-1 text-xs text-text-secondary"
              >
                {formatOnlineQty(it.quantity, it.sale_type)} {it.name}
              </span>
            ))}
            {order.items.length > 4 && (
              <span className="rounded-md bg-surface-secondary px-2 py-1 text-xs text-text-secondary">
                +{(order.items.length - 4).toLocaleString("ar-EG")}
              </span>
            )}
          </div>

          {/* أزرار */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onDetail}>
              <Eye className="size-4" />
              تفاصيل
            </Button>
            <Button variant="outline" size="sm" onClick={onPrint} disabled={busy}>
              <Printer className="size-4" />
              طباعة للتجهيز
            </Button>
            {isNew && canPOS && (
              <Button variant="outline" size="sm" onClick={onReject} disabled={busy}>
                <Ban className="size-4" />
                رفض
              </Button>
            )}
            {(isNew || isCancelled) && canPOS && (
              <Button size="sm" onClick={onPrepare} disabled={busy}>
                <Rocket className="size-4" />
                {busy ? "بيجهّز..." : isCancelled ? "تجهيز تاني" : "جاهز للانطلاق"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderDetailDialog({
  order,
  canPOS,
  busy,
  onClose,
  onPrint,
  onPrepare,
  onReject,
}: {
  order: OnlineOrderDTO | null;
  canPOS: boolean;
  busy: boolean;
  onClose: () => void;
  onPrint: () => void;
  onPrepare: () => void;
  onReject: () => void;
}) {
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            تفاصيل الطلب
            {order && <StatusBadge status={order.status} />}
          </DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-4">
            {/* العميل */}
            <div className="space-y-1 rounded-xl bg-surface-secondary p-3 text-sm">
              <p className="font-bold text-text-primary">{order.customer_name || "—"}</p>
              <p className="flex items-center gap-1.5 font-mono text-text-secondary" dir="ltr">
                <Phone className="size-3.5" /> {order.customer_phone}
              </p>
              {order.address && (
                <p className="flex items-start gap-1.5 text-text-secondary">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" /> {order.address}
                </p>
              )}
              {order.notes && (
                <p className="flex items-start gap-1.5 text-text-secondary">
                  <StickyNote className="mt-0.5 size-3.5 shrink-0" /> {order.notes}
                </p>
              )}
            </div>

            {/* الأصناف */}
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-right text-sm">
                <thead className="bg-surface-secondary text-text-secondary">
                  <tr>
                    <th className="p-2.5 font-medium">المنتج</th>
                    <th className="p-2.5 font-medium">الكمية</th>
                    <th className="p-2.5 font-medium">السعر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.items.map((it, i) => (
                    <tr key={i}>
                      <td className="p-2.5 text-text-primary">
                        {it.name}
                        {it.notes && (
                          <span className="block text-xs text-text-secondary">↳ {it.notes}</span>
                        )}
                      </td>
                      <td className="p-2.5 text-text-secondary">
                        {formatOnlineQty(it.quantity, it.sale_type)}
                      </td>
                      <td className="p-2.5 text-text-primary">{fmt(it.price * it.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border bg-surface-secondary">
                  <tr>
                    <td className="p-2.5 font-bold text-text-primary" colSpan={2}>
                      الإجمالي التقديري
                    </td>
                    <td className="p-2.5 font-bold text-text-primary">{fmt(order.subtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-text-secondary">
              الإجمالي تقديري بأسعار وقت الطلب — السعر النهائي بيتأكّد على الكاشير وقت التجهيز.
            </p>

            {/* أزرار */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onPrint} disabled={busy}>
                <Printer className="size-4" />
                طباعة للتجهيز
              </Button>
              {order.status === "new" && canPOS && (
                <Button variant="outline" onClick={onReject} disabled={busy}>
                  <Ban className="size-4" />
                  رفض الطلب
                </Button>
              )}
              {(order.status === "new" || order.status === "cancelled") && canPOS && (
                <Button onClick={onPrepare} disabled={busy} className="flex-1">
                  <Rocket className="size-4" />
                  {order.status === "cancelled" ? "تجهيز تاني" : "جاهز للانطلاق"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// نافذة رفض الطلب — أسباب جاهزة (أسرع للكاشير الواقف) + نص حر.
// السبب بيترفع للويب فصاحب المحل يشوفه في تفاصيل الطلب.
const REJECT_REASONS = ["الزبون لغى", "البضاعة خلصت", "طلب وهمي"];

function RejectDialog({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: OnlineOrderDTO | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [custom, setCustom] = useState<string>("");

  // تصفير الاختيار مع كل فتح جديد
  useEffect(() => {
    if (order) {
      setReason("");
      setCustom("");
    }
  }, [order]);

  const finalReason = reason === "أخرى" ? custom.trim() || null : reason || null;

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="size-5 text-danger" />
            رفض الطلب
          </DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              طلب <span className="font-bold text-text-primary">{order.customer_name || order.customer_phone}</span>{" "}
              — الزبون هيشوف إن الطلب اتلغى.
            </p>

            <div className="space-y-2">
              <p className="text-xs font-medium text-text-secondary">السبب (اختياري)</p>
              <div className="flex flex-wrap gap-2">
                {[...REJECT_REASONS, "أخرى"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(reason === r ? "" : r)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                      reason === r
                        ? "bg-danger text-white"
                        : "bg-surface-secondary text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {reason === "أخرى" && (
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  maxLength={120}
                  placeholder="اكتب السبب..."
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy} className="flex-1">
                رجوع
              </Button>
              <Button
                variant="danger"
                onClick={() => onConfirm(finalReason)}
                disabled={busy}
                className="flex-1"
              >
                {busy ? "بيترفض..." : "تأكيد الرفض"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
