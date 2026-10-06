"use client";

// طلبات الحجز الجايّة من رابط المحل.
//
// ⚠️ **الحجز طلب مش تأكيد**: الموظف بيكلّم الزبون على رقمه ويتأكد من التحويل، وبعدين
// يقبل أو يرفض. والحجز المتأخر بيفضل ظاهر لحد ما يقفله بـ«مجاش» — مفيش أي قفل تلقائي.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  Copy,
  Phone,
  Play,
  UserRound,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { StaffPicker } from "@/components/beauty/StaffPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { useBookingsStore } from "@/store/bookings.store";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/formatters";
import {
  BOOKING_STATUS_LABELS,
  bookingTimeLabel,
  bookingTimer,
  type BookingDTO,
  type BookingStatus,
} from "@/shared/booking";
import { plannedLabel, type GamingRoomDTO } from "@/shared/gaming";

type Tab = "today" | "upcoming" | "archive";

const TONE: Record<BookingStatus, string> = {
  new: "border-warning bg-warning/10",
  confirmed: "border-success/60 bg-success/5",
  converted: "border-border bg-surface",
  rejected: "border-border bg-surface opacity-70",
  no_show: "border-border bg-surface opacity-70",
  cancelled: "border-border bg-surface opacity-70",
};

/** «9م» — نفس اللي الزبون شافه على صفحة الحجز */
function timeOf(iso: string): string {
  return bookingTimeLabel(iso);
}
function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "short" }).format(
    new Date(iso)
  );
}

export default function BookingsPage() {
  const { invoke } = useIPC();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const refreshBadge = useBookingsStore((s) => s.refresh);
  const alertMinutes = useSettingsStore((s) => s.bookingAlertMinutes);
  const canCancel = hasPermission("canCancelOrder");

  const [tab, setTab] = useState<Tab>("today");
  const [items, setItems] = useState<BookingDTO[] | null>(null);
  const [days, setDays] = useState<{ date: string; count: number }[]>([]);
  const [archiveDate, setArchiveDate] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<number | null>(null);

  const [confirmFor, setConfirmFor] = useState<BookingDTO | null>(null);
  // الحجز اللي بنحوّله لجلسة — بيسأل الحلاق الأول (العمولة بتتحدد بيه)
  const [convertFor, setConvertFor] = useState<BookingDTO | null>(null);
  const [confirmNote, setConfirmNote] = useState("");
  // «بلايستيشن + كافيه»: حجز الكرسي بيوصل من غير كرسي — الموظف بيختارها وقت التأكيد
  const [tables, setTables] = useState<GamingRoomDTO[]>([]);
  const [confirmTable, setConfirmTable] = useState<string>("");
  const [rejectFor, setRejectFor] = useState<BookingDTO | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    try {
      if (tab === "today") setItems(await invoke("bookings:list"));
      else if (tab === "upcoming") setItems(await invoke("bookings:upcoming", { days: 7 }));
      else {
        const list = await invoke("bookings:archiveDays");
        setDays(list);
        setItems(archiveDate ? await invoke("bookings:listForDate", archiveDate) : []);
      }
      void refreshBadge();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الحجوزات");
    }
  }, [invoke, tab, archiveDate, refreshBadge]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // عدّاد حي عشان «فاضل كام» تتحرّك لوحدها
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function askConfirm(b: BookingDTO) {
    setConfirmNote("");
    setConfirmTable("");
    setConfirmFor(b);
    if (b.kind === "table") {
      try {
        setTables(await invoke("gaming:rooms:list", {}));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذّر تحميل الكراسي");
      }
    }
  }

  async function act(id: number, fn: () => Promise<unknown>, done: string) {
    try {
      setBusy(id);
      await fn();
      toast.success(done);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تنفيذ الإجراء");
    } finally {
      setBusy(null);
    }
  }

  const list = items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الحجز"
        description="الحجوزات الجايّة من رابط المحل — كلّم الزبون على رقمه، وبعد ما تتأكد اقبل الحجز"
      />

      <div className="flex gap-2">
        {([
          { k: "today", label: "النهاردة" },
          { k: "upcoming", label: "جاي (7 أيام)" },
          { k: "archive", label: "الأرشيف" },
        ] as const).map((t) => (
          <Button
            key={t.k}
            variant={tab === t.k ? "primary" : "outline"}
            onClick={() => {
              setTab(t.k);
              setItems(null);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "archive" && (
        <div className="flex flex-wrap gap-2">
          {days.length === 0 ? (
            <p className="text-sm text-text-secondary">مفيش أرشيف لسه.</p>
          ) : (
            days.map((d) => (
              <button
                key={d.date}
                onClick={() => setArchiveDate(d.date)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  archiveDate === d.date
                    ? "border-primary bg-primary/10 text-text-primary"
                    : "border-border text-text-secondary hover:text-text-primary"
                )}
              >
                {d.date} <span className="text-xs opacity-70">({d.count})</span>
              </button>
            ))
          )}
        </div>
      )}

      {items === null ? (
        <LoadingSkeleton rows={4} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="مفيش حجوزات"
          description="الحجوزات اللي بتيجي من رابط المحل هتظهر هنا عشان تأكّدها."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((b) => {
            const t = bookingTimer(b.starts_at, b.duration_minutes, now, alertMinutes);
            const isOpen = b.status === "new" || b.status === "confirmed";
            return (
              <div
                key={b.id}
                className={cn("space-y-3 rounded-xl border p-4 shadow-sm", TONE[b.status])}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-text-primary">
                      {b.room_id != null ? b.room_name : "حجز كرسي"}
                      <span className="mr-2 text-sm font-normal text-text-secondary">
                        {`${b.party_size ?? "?"} أفراد${b.room_id == null ? " · الكرسي هتتحدد وقت التأكيد" : ""}`}
                      </span>
                    </p>
                    <p className="text-sm text-text-secondary">
                      {dayOf(b.starts_at)} · {timeOf(b.starts_at)} ·{" "}
                      {plannedLabel(b.duration_minutes)}
                    </p>
                  </div>
                  <Badge variant={b.status === "new" ? "warning" : b.status === "confirmed" ? "success" : "muted"}>
                    {BOOKING_STATUS_LABELS[b.status]}
                  </Badge>
                </div>

                {/* حالة الوقت — نفس حساب شاشة الغرف */}
                {isOpen && t.status !== "idle" && (
                  <p
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium",
                      t.status === "soon"
                        ? "bg-warning/15 text-warning"
                        : "bg-danger/10 text-danger"
                    )}
                  >
                    {t.status === "soon"
                      ? `الميعاد قرّب — فاضل ${Math.ceil(t.startsInMs / 60_000)} دقيقة`
                      : t.status === "due"
                        ? "الميعاد دلوقتي"
                        : `متأخر ${Math.floor(t.lateMs / 60_000)} دقيقة — الزبون مجاش لسه`}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <UserRound className="h-4 w-4" />
                    {b.customer_name || "زبون"}
                  </span>
                  <span className="flex items-center gap-1.5" dir="ltr">
                    <Phone className="h-4 w-4" />
                    {b.customer_phone}
                  </span>
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(b.customer_phone);
                      toast.success("الرقم اتنسخ");
                    }}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Copy className="h-3 w-3" />
                    انسخ الرقم
                  </button>
                </div>

                {b.notes && <p className="text-sm text-text-secondary">ملاحظة الزبون: {b.notes}</p>}
                {b.confirm_note && (
                  <p className="rounded-lg bg-success/5 px-3 py-1.5 text-sm text-text-secondary">
                    التأكيد: {b.confirm_note}
                  </p>
                )}
                {b.decision_reason && (
                  <p className="text-sm text-danger">السبب: {b.decision_reason}</p>
                )}
                {b.decided_at && (
                  <p className="text-xs text-text-secondary">
                    {b.decided_by_name} · {formatDateTime(b.decided_at)}
                  </p>
                )}

                {/* الإجراءات */}
                {isOpen && (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    {b.status === "new" && (
                      <Button
                        size="sm"
                        disabled={busy === b.id}
                        onClick={() => void askConfirm(b)}
                      >
                        <Check className="h-4 w-4" />
                        اقبل الحجز
                      </Button>
                    )}
                    {b.status === "confirmed" && b.room_id != null && (
                      <Button
                        size="sm"
                        variant="accent"
                        disabled={busy === b.id}
                        onClick={() => setConvertFor(b)}
                      >
                        <Play className="h-4 w-4" />
                        افتح الجلسة
                      </Button>
                    )}
                    {b.status === "confirmed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === b.id}
                        onClick={() => void act(b.id, () => invoke("bookings:noShow", b.id), "اتسجّل «مجاش»")}
                      >
                        <XCircle className="h-4 w-4" />
                        مجاش
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger/10"
                        disabled={busy === b.id}
                        onClick={() => {
                          setRejectReason("");
                          setRejectFor(b);
                        }}
                      >
                        {b.status === "new" ? "ارفض" : "الغِ الحجز"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* قبول */}
      <Dialog open={!!confirmFor} onOpenChange={(o) => !o && setConfirmFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحجز</DialogTitle>
          </DialogHeader>
          {confirmFor && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                {confirmFor.kind === "table" ? `كرسي لـ${confirmFor.party_size ?? "?"} أفراد` : confirmFor.room_name} ·{" "}
                {dayOf(confirmFor.starts_at)} {timeOf(confirmFor.starts_at)} · {plannedLabel(confirmFor.duration_minutes)}
              </p>
              {confirmFor.kind === "table" && (
                <div className="space-y-1.5">
                  <Label>الكرسي</Label>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                    value={confirmTable}
                    onChange={(e) => setConfirmTable(e.target.value)}
                  >
                    <option value="">اختار الكرسي</option>
                    {tables.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name}
                        {t.area ? ` — ${t.area}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-text-secondary">
                    لو الكرسي عليها حجز متأكّد في نفس الوقت، التأكيد هيترفض واختار غيرها.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>ملاحظة (اختياري)</Label>
                <Input
                  value={confirmNote}
                  onChange={(e) => setConfirmNote(e.target.value)}
                  placeholder="مثلاً: حوّل 50 على فودافون كاش"
                />
                <p className="text-xs text-text-secondary">
                  دي ملاحظة للتسجيل بس — مفيش أي فلوس بتتسجّل في النظام قبل الفاتورة.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={confirmFor?.kind === "table" && !confirmTable}
              onClick={() => {
                const b = confirmFor;
                if (!b) return;
                setConfirmFor(null);
                void act(
                  b.id,
                  () =>
                    invoke("bookings:confirm", {
                      id: b.id,
                      note: confirmNote.trim() || null,
                      table_id: b.kind === "table" ? Number(confirmTable) : null,
                    }),
                  "الحجز اتأكّد"
                );
              }}
            >
              <Check className="h-4 w-4" />
              أكّد الحجز
            </Button>
            <Button variant="outline" onClick={() => setConfirmFor(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* رفض / إلغاء */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rejectFor?.status === "new" ? "رفض الحجز" : "إلغاء الحجز"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {["الكراسي محجوزة", "الزبون طلب الإلغاء", "مفيش تحويل", "الوقت مش متاح"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRejectReason(r)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    rejectReason === r
                      ? "border-danger bg-danger/10 text-danger"
                      : "border-border text-text-secondary hover:text-text-primary"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value.slice(0, 120))}
              placeholder="أو اكتب السبب..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="danger"
              disabled={rejectReason.trim().length < 2}
              onClick={() => {
                const b = rejectFor;
                if (!b) return;
                setRejectFor(null);
                const isNew = b.status === "new";
                void act(
                  b.id,
                  () =>
                    isNew
                      ? invoke("bookings:reject", { id: b.id, reason: rejectReason.trim() })
                      : invoke("bookings:cancel", { id: b.id, reason: rejectReason.trim() }),
                  isNew ? "الحجز اترفض" : "الحجز اتلغى"
                );
              }}
            >
              <CalendarClock className="h-4 w-4" />
              تأكيد
            </Button>
            <Button variant="outline" onClick={() => setRejectFor(null)}>
              رجوع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* تحويل حجز لجلسة — الحلاق إجباري زي أي جلسة تانية */}
      <StaffPicker
        open={!!convertFor}
        title={`افتح جلسة — ${convertFor?.room_name ?? ""}`}
        description={`الحجز لـ${convertFor?.customer_name ?? "زبون"} — مين هيشتغل؟`}
        onOpenChange={(o) => !o && setConvertFor(null)}
        onPick={(staff) => {
          const b = convertFor;
          setConvertFor(null);
          if (b) {
            void act(b.id, () => invoke("bookings:convert", { id: b.id, staff_id: staff.id }), "الجلسة اتفتحت");
          }
        }}
      />
    </div>
  );
}
