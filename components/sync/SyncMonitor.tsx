"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Wifi,
  WifiOff,
  CloudOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { useIPC } from "@/hooks/useIPC";
import { useSyncStore } from "@/store/sync.store";
import { formatDateTime } from "@/lib/formatters";
import { entityTypeLabel, SYNC_EVENT_LABELS } from "@/shared/sync";
import type { SyncQueueItemDTO, SyncLogDTO, SyncEngineState } from "@/shared/sync";
import { cn } from "@/lib/utils";

const STATE_STYLE: Record<
  SyncEngineState,
  { icon: typeof Wifi; tone: string; chip: string }
> = {
  disabled: { icon: CloudOff, tone: "text-text-secondary", chip: "bg-surface-secondary" },
  offline: { icon: WifiOff, tone: "text-warning", chip: "bg-warning/10" },
  online: { icon: Wifi, tone: "text-success", chip: "bg-success/10" },
  syncing: { icon: Loader2, tone: "text-info", chip: "bg-info/10" },
};

export function SyncMonitor() {
  const { invoke } = useIPC();
  const status = useSyncStore((s) => s.status);
  const setStatus = useSyncStore((s) => s.setStatus);
  const refresh = useSyncStore((s) => s.refresh);

  const [queue, setQueue] = useState<SyncQueueItemDTO[]>([]);
  const [log, setLog] = useState<SyncLogDTO[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [q, l] = await Promise.all([
        invoke("sync:getQueue"),
        invoke("sync:getLog"),
      ]);
      setQueue(q);
      setLog(l);
    } catch {
      /* تجاهل */
    }
  }, [invoke]);

  useEffect(() => {
    void refresh();
    void load();
  }, [refresh, load]);

  // أعد تحميل القوائم لما تتغير أعداد الطابور
  useEffect(() => {
    void load();
  }, [status?.pending, status?.failed, status?.synced, load]);

  async function syncNow() {
    try {
      setBusy(true);
      const s = await invoke("sync:syncNow");
      setStatus(s);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت المزامنة");
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    try {
      setBusy(true);
      const n = await invoke("sync:retryFailed");
      toast.success(`تمت إعادة ${n} سجل للطابور`);
      await refresh();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت إعادة المحاولة");
    } finally {
      setBusy(false);
    }
  }

  const state = status?.state ?? "disabled";
  const style = STATE_STYLE[state];
  const StateIcon = style.icon;

  return (
    <div className="space-y-6">
      {/* حالة الاتصال */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", style.chip)}>
              <StateIcon className={cn("h-6 w-6", style.tone, state === "syncing" && "animate-spin")} />
            </div>
            <div>
              <p className="font-semibold text-text-primary">{status?.message ?? "بتتهيّأ..."}</p>
              <p className="text-xs text-text-secondary">
                آخر مزامنة ناجحة:{" "}
                {status?.lastSyncAt ? formatDateTime(status.lastSyncAt) : "لم تتم بعد"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={syncNow} disabled={busy || !status?.configured}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              مزامنة الآن
            </Button>
            {(status?.failed ?? 0) > 0 && (
              <Button variant="outline" onClick={retryFailed} disabled={busy}>
                <RotateCcw className="h-4 w-4" />
                إعادة الفاشلة
              </Button>
            )}
          </div>
        </div>

        {!status?.configured && (
          <p className="mt-4 rounded-lg border border-border bg-surface-secondary/50 p-3 text-xs text-text-secondary">
            المزامنة جاهزة بالكامل، لكنها مش هتبدأ ترفع إلا لما تسجّل المحل بكود
            ومفتاح من لوحة الويب (الإعدادات ← المزامنة). لحد ساعتها كل البيانات
            بتتسجّل وبتتجمّع في الطابور جاهزة للرفع — مفيش بيانة بتضيع.
          </p>
        )}
      </Card>

      {/* إحصاء الطابور */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QueueStat label="في الانتظار" value={status?.pending ?? 0} icon={Clock} tone="warning" />
        <QueueStat label="نجحت" value={status?.synced ?? 0} icon={CheckCircle2} tone="success" />
        <QueueStat label="فشلت" value={status?.failed ?? 0} icon={XCircle} tone="danger" />
      </div>

      {/* قائمة المنتظر */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-text-primary">السجلات في الانتظار</h2>
        <Card className="overflow-hidden">
          {queue.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="مفيش سجلات منتظرة"
              description="كل البيانات اللي اتسجّلت متزامنة أو جاهزة."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-border text-text-secondary">
                  <tr>
                    <th className="p-3 font-medium">النوع</th>
                    <th className="p-3 font-medium">الإجراء</th>
                    <th className="p-3 font-medium">وقت الإنشاء</th>
                    <th className="p-3 font-medium">المحاولات</th>
                    <th className="p-3 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((q) => (
                    <tr key={q.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-text-primary">{entityTypeLabel(q.entity_type)}</td>
                      <td className="p-3 text-text-secondary">{SYNC_EVENT_LABELS[q.event_type] ?? q.event_type}</td>
                      <td className="p-3 text-text-secondary">{formatDateTime(q.created_at)}</td>
                      <td className="p-3 text-text-secondary tabular-nums">{q.attempts}</td>
                      <td className="p-3">
                        {q.status === "failed" ? (
                          <Badge variant="danger">فشل</Badge>
                        ) : q.status === "syncing" ? (
                          <Badge variant="accent">بيتزامن</Badge>
                        ) : (
                          <Badge variant="muted">في الانتظار</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* سجل المزامنات */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-text-primary">سجل آخر المزامنات</h2>
        <Card className="overflow-hidden">
          {log.length === 0 ? (
            <EmptyState
              icon={RefreshCw}
              title="لسه مفيش مزامنات"
              description="هيظهر هنا سجل كل دفعة مزامنة بعد ما تشتغل."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-border text-text-secondary">
                  <tr>
                    <th className="p-3 font-medium">الوقت</th>
                    <th className="p-3 font-medium">النتيجة</th>
                    <th className="p-3 font-medium">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-text-secondary">{formatDateTime(l.timestamp)}</td>
                      <td className="p-3">
                        {l.result === "success" ? (
                          <Badge variant="success">نجح</Badge>
                        ) : (
                          <Badge variant="danger">فشل</Badge>
                        )}
                      </td>
                      <td className="p-3 text-text-secondary">
                        {l.result === "success"
                          ? `${l.records_count} سجل`
                          : l.message ?? "خطأ"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function QueueStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  tone: "warning" | "success" | "danger";
}) {
  const toneMap = {
    warning: "bg-warning/15 text-warning",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
  };
  return (
    <Card className="flex items-center justify-between p-5">
      <div>
        <p className="text-sm text-text-secondary">{label}</p>
        <p className="mt-1 text-2xl font-bold text-text-primary tabular-nums">{value}</p>
      </div>
      <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg", toneMap[tone])}>
        <Icon className="h-6 w-6" />
      </div>
    </Card>
  );
}
