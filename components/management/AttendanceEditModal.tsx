"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useIPC } from "@/hooks/useIPC";
import { formatDate } from "@/lib/formatters";
import type { AttendanceRowDTO } from "@/shared/management";

interface AttendanceEditModalProps {
  row: AttendanceRowDTO | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

// "HH:MM" من ISO بالتوقيت المحلي
function timeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// يبني ISO من تاريخ اليوم التجاري + وقت جديد
function buildISO(businessDate: string, time: string): string {
  return new Date(`${businessDate}T${time}:00`).toISOString();
}

export function AttendanceEditModal({
  row,
  onOpenChange,
  onChanged,
}: AttendanceEditModalProps) {
  const { invoke } = useIPC();
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (row) {
      setInTime(timeValue(row.clock_in));
      setOutTime(timeValue(row.clock_out));
    }
  }, [row]);

  if (!row) return null;

  async function handleSave() {
    if (!row) return;
    try {
      setSaving(true);
      if (row.clock_in_id && inTime && inTime !== timeValue(row.clock_in)) {
        await invoke("attendance:updateLog", {
          id: row.clock_in_id,
          timestamp: buildISO(row.business_date, inTime),
        });
      }
      if (row.clock_out_id && outTime && outTime !== timeValue(row.clock_out)) {
        await invoke("attendance:updateLog", {
          id: row.clock_out_id,
          timestamp: buildISO(row.business_date, outTime),
        });
      }
      toast.success("تم حفظ التعديل");
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!row) return;
    try {
      if (row.clock_in_id) await invoke("attendance:deleteLog", row.clock_in_id);
      if (row.clock_out_id) await invoke("attendance:deleteLog", row.clock_out_id);
      toast.success("تم حذف السجل");
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحذف");
    }
  }

  return (
    <>
      <Dialog open={!!row} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              تعديل حضور — {row.user_name} ({formatDate(row.business_date)})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>وقت الحضور</Label>
              <Input
                type="time"
                value={inTime}
                onChange={(e) => setInTime(e.target.value)}
                disabled={!row.clock_in_id}
                dir="ltr"
              />
              {!row.clock_in_id && (
                <p className="text-xs text-text-secondary">مفيش تسجيل حضور لليوم ده.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>وقت الانصراف</Label>
              <Input
                type="time"
                value={outTime}
                onChange={(e) => setOutTime(e.target.value)}
                disabled={!row.clock_out_id}
                dir="ltr"
              />
              {!row.clock_out_id && (
                <p className="text-xs text-text-secondary">لسه مسجّلش انصراف.</p>
              )}
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              className="text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              حذف السجل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="حذف سجل الحضور"
        description={`هيتحذف تسجيل حضور وانصراف ${row.user_name} ليوم ${formatDate(row.business_date)}.`}
        confirmText="حذف"
        variant="danger"
        onConfirm={handleDelete}
      />
    </>
  );
}
