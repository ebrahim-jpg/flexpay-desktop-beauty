"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  CalendarClock,
  ChefHat,
  Coffee,
  Combine,
  Play,
  Receipt,
  Settings2,
  ShoppingBag,
  SplitSquareHorizontal,
  UserRound,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddDrinksDialog } from "@/components/gaming/AddDrinksDialog";
import { SessionCheckoutModal } from "@/components/gaming/SessionCheckoutModal";
import { SplitBillDialog } from "@/components/gaming/SplitBillDialog";
import { TablesManager } from "@/components/gaming/TablesManager";
import { QuickSaleDialog } from "@/components/gaming/QuickSaleDialog";
import { useSessionAlarm } from "@/components/gaming/useSessionAlarm";
import { CustomerSearch } from "@/components/pos/CustomerSearch";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import {
  NO_AREA_LABEL,
  type GamingBoard,
  type GamingRoomDTO,
  type GamingSessionDTO,
  type GamingTodaySummary,
} from "@/shared/gaming";
import { bookingTimeLabel, bookingTimer, roomBookingAlert, type BookingDTO } from "@/shared/booking";
import type { OrderDTO } from "@/shared/orders";

// «1:05» — ساعات:دقايق (القعدة للمتابعة بس، مفيش تسعير وقت على الطاولة)
function sat(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

const ALL = "__all__";
const bookingMuteKey = (b: BookingDTO) => `bk:${b.local_id}:${b.starts_at}`;

// ===== الطاولات («بلايستيشن + كافيه») =====
// شاشة البيع التانية جنب الغرف: حساب مفتوح على الطاولة بالطلبات بس (مالهاش سعر وقت)،
// نقل لطاولة تانية · دمج طاولتين · تقسيم الفاتورة · حساب. الفلوس مش ظاهرة هنا (قدّام الزباين).
export default function TablesPage() {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const bookingAlertMinutes = useSettingsStore((s) => s.bookingAlertMinutes);

  const [board, setBoard] = useState<GamingBoard | null>(null);
  const [summary, setSummary] = useState<GamingTodaySummary | null>(null);
  const [bookings, setBookings] = useState<BookingDTO[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [area, setArea] = useState<string>(ALL);
  const [busyTable, setBusyTable] = useState<number | null>(null);

  const [ordersFor, setOrdersFor] = useState<GamingSessionDTO | null>(null);
  const [checkoutFor, setCheckoutFor] = useState<GamingSessionDTO | null>(null);
  const [splitFor, setSplitFor] = useState<GamingSessionDTO | null>(null);
  const [transferFor, setTransferFor] = useState<GamingSessionDTO | null>(null);
  const [mergeFor, setMergeFor] = useState<GamingSessionDTO | null>(null);
  const [cancelFor, setCancelFor] = useState<GamingSessionDTO | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [customerFor, setCustomerFor] = useState<GamingSessionDTO | null>(null);
  const [receipt, setReceipt] = useState<OrderDTO | null>(null);
  const [managing, setManaging] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [muted, setMuted] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    try {
      const [b, s, bk] = await Promise.all([
        invoke("gaming:board"),
        invoke("gaming:summary:today"),
        invoke("bookings:board"),
      ]);
      setBoard(b);
      setSummary(s);
      setBookings(bk);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الطاولات");
    }
  }, [invoke]);

  useEffect(() => {
    void load();
    const refresh = setInterval(() => void load(), 30_000);
    return () => clearInterval(refresh);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tables = useMemo(() => board?.tables ?? [], [board]);
  const sessions = useMemo(() => board?.sessions ?? [], [board]);
  const sessionOf = useCallback((tableId: number) => sessions.find((s) => s.room_id === tableId) ?? null, [sessions]);

  // تابات المناطق — بترتيب أول ظهور (نفس ترتيب الطاولات)
  const areas = useMemo(() => {
    const out: string[] = [];
    for (const t of tables) {
      const a = t.area?.trim() || NO_AREA_LABEL;
      if (!out.includes(a)) out.push(a);
    }
    return out;
  }, [tables]);
  const visible = area === ALL ? tables : tables.filter((t) => (t.area?.trim() || NO_AREA_LABEL) === area);

  // تنبيه حجز الطاولة لما ميعاده ييجي — نفس نغمة الغرف (نداء واحد)
  const tableIds = useMemo(() => new Set(tables.map((t) => t.id)), [tables]);
  const bookingRinging = useMemo(
    () =>
      bookings.some(
        (b) =>
          b.room_id != null &&
          tableIds.has(b.room_id) &&
          bookingTimer(b.starts_at, b.duration_minutes, now, bookingAlertMinutes).status === "due" &&
          !muted.has(bookingMuteKey(b))
      ),
    [bookings, tableIds, now, muted, bookingAlertMinutes]
  );
  useSessionAlarm(bookingRinging);

  function replaceSession(updated: GamingSessionDTO) {
    setBoard((b) => (b ? { ...b, sessions: b.sessions.map((s) => (s.id === updated.id ? updated : s)) } : b));
    setOrdersFor((d) => (d && d.id === updated.id ? updated : d));
    setSplitFor((d) => (d && d.id === updated.id ? updated : d));
  }

  async function openTable(table: GamingRoomDTO) {
    try {
      setBusyTable(table.id);
      const s = await invoke("gaming:session:open", { room_id: table.id });
      toast.success(`اتفتح حساب ${table.name}`);
      await load();
      setOrdersFor(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر فتح الحساب");
    } finally {
      setBusyTable(null);
    }
  }

  async function transfer(session: GamingSessionDTO, to: GamingRoomDTO) {
    try {
      await invoke("gaming:session:transfer", { session_id: session.id, to_room_id: to.id });
      toast.success(`الحساب اتنقل من ${session.room_name} لـ${to.name}`);
      setTransferFor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر نقل الحساب");
    }
  }

  async function merge(from: GamingSessionDTO, into: GamingSessionDTO) {
    try {
      await invoke("gaming:session:merge", { from_session_id: from.id, into_session_id: into.id });
      toast.success(`${from.room_name} اتدمجت في ${into.room_name}`);
      setMergeFor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الدمج");
    }
  }

  async function setTabCustomer(session: GamingSessionDTO, id: number | null) {
    try {
      const updated = await invoke("gaming:session:setCustomer", { session_id: session.id, customer_id: id });
      replaceSession(updated);
      setCustomerFor(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحديد العميل");
    }
  }

  async function confirmCancel() {
    if (!cancelFor) return;
    try {
      await invoke("gaming:session:cancel", { session_id: cancelFor.id, reason: cancelReason });
      toast.success(`اتلغى حساب ${cancelFor.room_name}`);
      setCancelFor(null);
      setCancelReason("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الإلغاء");
    }
  }

  const freeTables = tables.filter((t) => !sessionOf(t.id));
  const occupied = tables.length - freeTables.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="الصالة"
        description="افتح حساب على الطاولة وضيف الأوردرات، انقله أو ادمجه أو قسّم الفاتورة — وكل صنف بيطلع للمطبخ على طول"
        action={
          <div className="flex gap-2">
            {hasPermission("canManageProducts") && (
              <Button variant="outline" onClick={() => setManaging(true)}>
                <Settings2 />
                إدارة الطاولات
              </Button>
            )}
            <Button variant="accent" onClick={() => setQuickOpen(true)}>
              <ShoppingBag />
              بيع سريع
            </Button>
          </div>
        }
      />

      {board && summary && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="مشغولة دلوقتي" value={String(occupied)} accent />
          <Stat label="فاضية" value={String(freeTables.length)} />
          <Stat label="حسابات اتقفلت النهاردة" value={String(summary.closed_count)} />
        </div>
      )}

      {areas.length > 1 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-surface-secondary p-1">
          {[ALL, ...areas].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea(a)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                area === a ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {a === ALL ? "كل المناطق" : a}
            </button>
          ))}
        </div>
      )}

      {!board ? (
        <LoadingSkeleton rows={4} />
      ) : tables.length === 0 ? (
        <EmptyState
          icon={Coffee}
          title="لسه مفيش طاولات"
          description="ضيف الطاولات وقسّمها مناطق لو عايز — من غير أسعار ولا عدد كراسي."
          action={
            hasPermission("canManageProducts") ? (
              <Button onClick={() => setManaging(true)}>
                <Settings2 />
                إدارة الطاولات
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visible.map((table) => {
            const session = sessionOf(table.id);
            const busy = busyTable === table.id;
            const nextBooking = roomBookingAlert(bookings, table.id, now, bookingAlertMinutes);
            if (!session) {
              return (
                <div key={table.id} className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-lg font-bold text-text-primary">{table.name}</p>
                      {table.area && <p className="text-xs text-text-secondary">{table.area}</p>}
                    </div>
                    <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">فاضية</span>
                  </div>
                  {nextBooking && (
                    <TableBookingStrip
                      alert={nextBooking}
                      occupied={false}
                      muted={muted.has(bookingMuteKey(nextBooking.booking))}
                      onMute={() => setMuted((m) => new Set(m).add(bookingMuteKey(nextBooking.booking)))}
                    />
                  )}
                  <Button className="mt-4" disabled={busy} onClick={() => void openTable(table)}>
                    <Play />
                    افتح حساب
                  </Button>
                </div>
              );
            }

            const count = session.items.reduce((n, it) => n + it.quantity, 0);
            // أصناف لسه ماراحتش للمطبخ — النادل لازم يشوفها من الشاشة الرئيسية
            // عشان مايسيبش طلبات مستنية والمطبخ فاضي.
            const pendingKitchen = session.items.filter((it) => it.quantity - it.sent_qty > 0.0001).length;
            const elapsed = now - Date.parse(session.started_at);
            const otherOccupied = sessions.filter((s) => s.id !== session.id);
            return (
              <div key={table.id} className="flex flex-col rounded-xl border-2 border-primary/40 bg-primary/5 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold text-text-primary">{table.name}</p>
                    <p className="text-xs text-text-secondary">
                      {session.session_label}
                      {table.area ? ` · ${table.area}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary tabular-nums" dir="ltr">
                    {sat(elapsed)}
                  </span>
                </div>

                {nextBooking && (
                  <TableBookingStrip
                    alert={nextBooking}
                    occupied
                    muted={muted.has(bookingMuteKey(nextBooking.booking))}
                    onMute={() => setMuted((m) => new Set(m).add(bookingMuteKey(nextBooking.booking)))}
                  />
                )}

                <p className="mt-3 text-sm text-text-secondary">
                  {count > 0 ? `طلبات: ${count} · ${formatCurrency(session.items_subtotal)}` : "لسه مفيش طلبات"}
                </p>
                {pendingKitchen > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-accent-foreground">
                    <ChefHat className="h-3.5 w-3.5" />
                    {pendingKitchen} صنف لسه ماراحش للمطبخ
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setCustomerFor(session)}
                  className="mt-1 flex w-fit items-center gap-1 text-xs text-text-secondary hover:text-primary"
                >
                  <UserRound className="h-3.5 w-3.5" />
                  العميل: {session.customer_name ?? "زائر"}
                </button>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="col-span-2" onClick={() => setOrdersFor(session)}>
                    <UtensilsCrossed />
                    الطلبات
                  </Button>
                  <Button variant="outline" disabled={freeTables.length === 0} onClick={() => setTransferFor(session)}>
                    <ArrowLeftRight />
                    نقل
                  </Button>
                  <Button variant="outline" disabled={otherOccupied.length === 0} onClick={() => setMergeFor(session)}>
                    <Combine />
                    دمج
                  </Button>
                  <Button variant="outline" disabled={count === 0} onClick={() => setSplitFor(session)}>
                    <SplitSquareHorizontal />
                    قسّم
                  </Button>
                  <Button variant="accent" disabled={count === 0} onClick={() => setCheckoutFor(session)}>
                    <Receipt />
                    حساب
                  </Button>
                  {hasPermission("canCancelOrder") && (
                    <Button
                      variant="ghost"
                      className="col-span-2 text-danger"
                      onClick={() => {
                        setCancelReason("");
                        setCancelFor(session);
                      }}
                    >
                      <XCircle />
                      إلغاء الحساب
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* نقل: لطاولة فاضية بس — لو هيقعدوا مع ناس، الدمج */}
      <Dialog open={!!transferFor} onOpenChange={(o) => !o && setTransferFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>نقل حساب {transferFor?.room_name} لطاولة فاضية</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto">
            {freeTables.map((t) => (
              <Button key={t.id} variant="outline" className="h-14 flex-col" onClick={() => transferFor && void transfer(transferFor, t)}>
                <span className="font-bold">{t.name}</span>
                {t.area && <span className="text-xs text-text-secondary">{t.area}</span>}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* دمج: الحساب ده بيتنقل بطلباته على حساب طاولة تانية */}
      <Dialog open={!!mergeFor} onOpenChange={(o) => !o && setMergeFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>دمج {mergeFor?.room_name} مع طاولة تانية</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            طلبات {mergeFor?.room_name} هتتنقل على حساب الطاولة اللي هتختارها، و{mergeFor?.room_name} هتبقى فاضية.
          </p>
          <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto">
            {sessions
              .filter((s) => s.id !== mergeFor?.id)
              .map((s) => (
                <Button key={s.id} variant="outline" className="h-14 flex-col" onClick={() => mergeFor && void merge(mergeFor, s)}>
                  <span className="font-bold">{s.room_name}</span>
                  <span className="text-xs text-text-secondary">{s.items.reduce((n, it) => n + it.quantity, 0)} طلب</span>
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <AddDrinksDialog session={ordersFor} open={!!ordersFor} onOpenChange={(o) => !o && setOrdersFor(null)} onChanged={replaceSession} />

      <SessionCheckoutModal
        session={checkoutFor}
        open={!!checkoutFor}
        onOpenChange={(o) => !o && setCheckoutFor(null)}
        onComplete={(order) => {
          setReceipt(order);
          void load();
        }}
      />

      <SplitBillDialog
        session={splitFor}
        open={!!splitFor}
        onOpenChange={(o) => !o && setSplitFor(null)}
        onPaid={(_order, updated) => {
          if (updated.status === "open") replaceSession(updated);
          void load();
        }}
      />

      <ReceiptModal order={receipt} open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)} />

      <Dialog open={!!cancelFor} onOpenChange={(o) => !o && setCancelFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء حساب {cancelFor?.room_name}؟</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            الإلغاء بيقفل الحساب <b className="text-danger">من غير فاتورة ولا فلوس</b>. استخدمه بس لو الحساب اتفتح بالغلط —
            والعملية بتتسجّل في المراقبة الحساسة باسمك وبالسبب.
          </p>
          <div className="space-y-1.5">
            <Label>سبب الإلغاء</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelFor(null)}>
              رجوع
            </Button>
            <Button variant="danger" disabled={!cancelReason.trim()} onClick={() => void confirmCancel()}>
              إلغاء الحساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!customerFor} onOpenChange={(o) => !o && setCustomerFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>العميل — {customerFor?.room_name}</DialogTitle>
          </DialogHeader>
          {customerFor && (
            <CustomerSearch
              value={{ id: customerFor.customer_id, name: customerFor.customer_name ?? "زائر" }}
              onChange={(id) => void setTabCustomer(customerFor, id)}
              inputId="table-customer-search"
            />
          )}
        </DialogContent>
      </Dialog>

      <QuickSaleDialog open={quickOpen} onOpenChange={setQuickOpen} onSold={() => void load()} />

      <Dialog open={managing} onOpenChange={setManaging}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>إدارة الطاولات</DialogTitle>
          </DialogHeader>
          <TablesManager onChanged={() => void load()} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-3", accent && "border-primary/40 bg-primary/5")}>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

/**
 * شريط حجز الطاولة — **تنبيه بس**: مفيش قفل ولا منع فتح حساب. لو الطاولة عليها ناس،
 * الموظف بيقرر يجهّز طاولة تانية للحجز أو ينقلهم.
 */
function TableBookingStrip({
  alert,
  occupied,
  muted,
  onMute,
}: {
  alert: { booking: BookingDTO; timer: ReturnType<typeof bookingTimer> };
  occupied: boolean;
  muted: boolean;
  onMute: () => void;
}) {
  const { booking, timer } = alert;
  const soon = timer.status === "soon";
  const minutes = soon ? Math.ceil(timer.startsInMs / 60_000) : Math.floor(timer.lateMs / 60_000);
  return (
    <div className={cn("mt-3 rounded-lg px-3 py-2 text-sm", soon ? "bg-warning/15 text-warning" : "bg-danger/10 text-danger")}>
      <p className="flex items-center gap-1.5 font-bold">
        <CalendarClock className="h-4 w-4" />
        حجز {bookingTimeLabel(booking.starts_at)} — {booking.customer_name || booking.customer_phone}
        {booking.party_size ? <span className="font-normal opacity-80">({booking.party_size} أفراد)</span> : null}
      </p>
      <p className="mt-0.5 text-xs">
        {soon ? `فاضل ${minutes} دقيقة على الحجز` : timer.status === "due" ? "ميعاد الحجز دلوقتي" : `متأخر ${minutes} دقيقة`}
        {occupied ? " · الطاولة عليها ناس — جهّز طاولة تانية للحجز أو انقلهم" : ""}
      </p>
      {timer.status === "due" && !muted && (
        <button type="button" onClick={onMute} className="mt-1 text-xs underline">
          إسكات التنبيه
        </button>
      )}
    </div>
  );
}
