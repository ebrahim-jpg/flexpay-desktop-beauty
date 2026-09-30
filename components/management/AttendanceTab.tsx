"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ScanBarcode } from "lucide-react";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { StaffStatusGrid } from "./StaffStatusGrid";
import { AttendanceTable } from "./AttendanceTable";
import { AttendanceEditModal } from "./AttendanceEditModal";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import { businessDateKey, shiftDateKey } from "@/shared/business-day";
import { formatBusinessDate } from "@/lib/business-day";
import type { StaffStatusDTO, AttendanceRowDTO } from "@/shared/management";

export function AttendanceTab() {
  const { invoke } = useIPC();
  const businessDayStart = useSettingsStore((s) => s.businessDayStart);
  // تعديل/حذف سجلات الحضور — لمن يملك صلاحية الحضور
  const canEdit = useAuthStore((s) => s.hasPermission("canManageAttendance"));

  const [status, setStatus] = useState<StaffStatusDTO[]>([]);
  const [rows, setRows] = useState<AttendanceRowDTO[]>([]);
  const [mode, setMode] = useState<"today" | "month">("today");
  const [userFilter, setUserFilter] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [editRow, setEditRow] = useState<AttendanceRowDTO | null>(null);
  const [loading, setLoading] = useState(true);
  // طلب كود الموظف وقت تسجيل حضوره/انصرافه
  const [codePrompt, setCodePrompt] = useState<{
    userId: number;
    name: string;
    action: "in" | "out";
  } | null>(null);

  const todayKey = businessDateKey(new Date(), businessDayStart);
  const minDate = shiftDateKey(todayKey, -29);

  // اليوم = النهاردة بس | الشهر = آخر 30 يوم مع إمكانية فلتر يوم محدد
  const rangeFrom = mode === "today" ? todayKey : dateFilter || null;
  const rangeTo = mode === "today" ? todayKey : dateFilter || null;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [st, rws] = await Promise.all([
        invoke("attendance:getCurrentStatus"),
        invoke("attendance:getLast30Days", {
          userId: userFilter,
          dateFrom: rangeFrom,
          dateTo: rangeTo,
        }),
      ]);
      setStatus(st);
      setRows(rws);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الحضور");
    } finally {
      setLoading(false);
    }
  }, [invoke, userFilter, rangeFrom, rangeTo]);

  useEffect(() => {
    void load();
  }, [load]);

  // ينفّذ الحضور/الانصراف فعلياً (بكود لو الموظف ليه كود)
  async function doClock(userId: number, action: "in" | "out", code: string | null): Promise<boolean> {
    try {
      await invoke(action === "in" ? "attendance:clockIn" : "attendance:clockOut", { userId, code });
      toast.success(action === "in" ? "تم تسجيل الحضور" : "تم تسجيل الانصراف");
      setCodePrompt(null);
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التسجيل");
      return false;
    }
  }

  // عند الضغط: لو الموظف ليه كود نطلبه، وإلا ننفّذ على طول
  async function requestClock(userId: number, action: "in" | "out"): Promise<void> {
    const st = status.find((s) => s.user_id === userId);
    if (st?.hasCode) setCodePrompt({ userId, name: st.name, action });
    else await doClock(userId, action, null);
  }

  const clockIn = (userId: number) => requestClock(userId, "in");
  const clockOut = (userId: number) => requestClock(userId, "out");

  const presentCount = status.filter((s) => s.present).length;

  if (loading && rows.length === 0 && status.length === 0)
    return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <p className="text-sm text-text-secondary">اليوم التجاري</p>
          <p className="font-semibold text-text-primary">
            {formatBusinessDate(new Date(todayKey + "T12:00:00"))}
          </p>
        </div>
        <div className="text-left">
          <p className="text-sm text-text-secondary">الحاضرون الآن</p>
          <p className="text-lg font-bold text-success">
            {presentCount} من {status.length} موظف
          </p>
        </div>
      </div>

      {/* سكان/كتابة الكود — تسجيل ذاتي فوري (باركود الموظف أو كتابة يدوي) */}
      <ScanClockCard onDone={load} />

      {/* حالة الموظفين */}
      <StaffStatusGrid staff={status} onClockIn={clockIn} onClockOut={clockOut} />

      {/* توجل اليوم / الشهر */}
      <div className="inline-flex rounded-lg bg-surface-secondary p-1">
        <ModeTab active={mode === "today"} onClick={() => setMode("today")} label="اليوم" />
        <ModeTab active={mode === "month"} onClick={() => setMode("month")} label="آخر 30 يوم" />
      </div>

      {/* السجل */}
      <AttendanceTable
        rows={rows}
        staff={status}
        userFilter={userFilter}
        onUserFilter={setUserFilter}
        dateFilter={dateFilter}
        onDateFilter={setDateFilter}
        minDate={minDate}
        maxDate={todayKey}
        showDateFilter={mode === "month"}
        title={mode === "today" ? "سجل النهاردة" : undefined}
        canEdit={canEdit}
        onEdit={setEditRow}
      />

      <CodePromptDialog
        prompt={codePrompt}
        onSubmit={(c) =>
          codePrompt ? doClock(codePrompt.userId, codePrompt.action, c) : Promise.resolve(false)
        }
        onClose={() => setCodePrompt(null)}
      />

      <AttendanceEditModal
        row={editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        onChanged={load}
      />
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-md px-4 py-2 text-sm font-medium transition-colors " +
        (active
          ? "bg-surface text-text-primary shadow-sm"
          : "text-text-secondary hover:text-text-primary")
      }
    >
      {label}
    </button>
  );
}

// كارت السكان: الموظف يسكن باركوده أو يكتب كوده → تسجيل حضور/انصراف فوري (clockByCode)
function ScanClockCard({ onDone }: { onDone: () => Promise<void> | void }) {
  const { invoke } = useIPC();
  const [code, setCode] = useState("");
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(
    async (value: string) => {
      if (busyRef.current || !/^\d{5}$/.test(value)) return;
      busyRef.current = true;
      try {
        const res = await invoke("attendance:clockByCode", { code: value });
        toast.success(
          res.action === "in" ? `تم تسجيل حضور ${res.name} ✅` : `تم تسجيل انصراف ${res.name} 👋`
        );
        setCode("");
        await onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "كود غير معروف");
        setCode("");
      } finally {
        busyRef.current = false;
        inputRef.current?.focus();
      }
    },
    [invoke, onDone]
  );

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <ScanBarcode className="h-5 w-5 text-primary" />
        سكان الحضور والانصراف
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 5);
            setCode(v);
            if (v.length === 5) void submit(v); // سكان سريع بيكمّل تلقائي
          }}
          placeholder="اسكن باركود الموظف أو اكتب كوده (5 أرقام)"
          inputMode="numeric"
          dir="ltr"
          autoFocus
          className="text-center text-lg tracking-[0.5em]"
        />
      </form>
      <p className="mt-1.5 text-xs text-text-secondary">
        كل موظف يسكن باركوده (أو يكتب كوده) — بيسجّل حضور، ولو موجود بيسجّل انصراف تلقائياً.
      </p>
    </div>
  );
}

// مودال طلب كود الموظف عند تسجيل حضوره/انصرافه (بديل البصمة)
function CodePromptDialog({
  prompt,
  onSubmit,
  onClose,
}: {
  prompt: { name: string; action: "in" | "out" } | null;
  onSubmit: (code: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prompt) setCode("");
  }, [prompt]);

  async function submit() {
    if (code.length !== 5) {
      toast.error("الكود لازم 5 أرقام");
      return;
    }
    setBusy(true);
    const ok = await onSubmit(code);
    setBusy(false);
    if (!ok) setCode(""); // كود غلط → نفضّي عشان يجرّب تاني
  }

  return (
    <Dialog open={!!prompt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>كود الموظف</DialogTitle>
          <DialogDescription>
            اكتب كود «{prompt?.name}» عشان نسجّل {prompt?.action === "in" ? "حضوره" : "انصرافه"}.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="•••••"
            inputMode="numeric"
            maxLength={5}
            dir="ltr"
            autoFocus
            className="text-center text-lg tracking-[0.6em]"
          />
          <DialogFooter>
            <Button type="submit" disabled={busy || code.length !== 5}>
              {busy ? "..." : "تأكيد"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
