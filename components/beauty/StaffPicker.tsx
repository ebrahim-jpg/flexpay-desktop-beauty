"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useIPC } from "@/hooks/useIPC";
import { cn } from "@/lib/utils";
import type { SafeUser } from "@/types/ipc.types";

/**
 * منتقي الحلاق/الأخصائي — **مكوّن واحد لتلات مسارات**: فتح جلسة على كرسي ·
 * تحويل حجز لجلسة · تغيير اللي عمل خدمة معيّنة.
 *
 * ⚠️ **ليه إجباري ومن غير «تخطّي»:** عليه بتتحسب **عمولة الحلاق**. جلسة بلا حلاق
 * معناها فلوس مش معروف صاحبها آخر الشهر — وده أسوأ من دوسة زيادة.
 *
 * ⚠️ وبيعرض **اللي بيشتغلوا على العملاء بس** (الحلاق والمدير والمالك) — مفيش معنى
 * تسند خدمة لموظف نظافة.
 */
const WORKING_ROLES = ["stylist", "manager", "owner"];

export function StaffPicker({
  open,
  title,
  description,
  currentId,
  onPick,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description?: string;
  /** الحلاق الحالي (لو بنغيّر) — بيتعلّم في القايمة */
  currentId?: number | null;
  onPick: (staff: SafeUser) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { invoke } = useIPC();
  const [staff, setStaff] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void invoke("users:getAll")
      .then((list) => {
        if (!active) return;
        setStaff(list.filter((u) => u.is_active && WORKING_ROLES.includes(u.role)));
      })
      .catch(() => {
        if (active) setStaff([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, invoke]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? "مين هيشتغل على العميل؟"}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-text-secondary">جاري التحميل...</p>
        ) : staff.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">
            مفيش حلاقين مفعّلين — ضيفهم من شاشة الموظفين الأول.
          </p>
        ) : (
          <div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-y-auto">
            {staff.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onPick(u);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-3 text-right transition-colors",
                  u.id === currentId
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary hover:bg-primary/5"
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-secondary">
                  <UserRound className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-text-primary">{u.name}</span>
                  {u.id === currentId && (
                    <span className="block text-[11px] text-primary">الحالي</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
