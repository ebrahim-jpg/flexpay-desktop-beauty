"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useManagerGuardStore } from "@/store/manager-guard.store";
import { useAuthStore } from "@/store/auth.store";
import { ROLE_LABELS } from "@/shared/permissions";

// تحذير لما المدير/المالك يسجّل عملية (بيع/مصروف) على حسابه — يظهر تلقائياً عبر الحارس.
export function ManagerGuardModal() {
  const pending = useManagerGuardStore((s) => s.pending);
  const confirm = useManagerGuardStore((s) => s.confirm);
  const cancel = useManagerGuardStore((s) => s.cancel);
  const setSuppressed = useManagerGuardStore((s) => s.setSuppressed);
  const user = useAuthStore((s) => s.currentUser);
  const [dontWarn, setDontWarn] = useState(false);

  useEffect(() => {
    if (pending) setDontWarn(false);
  }, [pending]);

  function onConfirm() {
    if (dontWarn) setSuppressed(true);
    confirm();
  }

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && cancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-5 w-5" />
            العملية هتتسجّل على حسابك
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-text-primary">
            أنت داخل بحساب <b>«{user?.name}»</b> ({user ? ROLE_LABELS[user.role] : "—"}). العملية
            دي هتتسجّل على الحساب ده — <b>مش على حساب الموظف</b>.
          </p>
          <p className="text-text-secondary">
            المدير/المالك نادرًا يستلم وردية صالة. لو نسيت تبدّل الحساب، اضغط إلغاء وسجّل دخول
            بحساب الموظف.
          </p>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-secondary p-3">
            <Switch checked={dontWarn} onCheckedChange={setDontWarn} />
            <span className="text-text-primary">
              أنا مستلم الوردية النهاردة — بطّل التحذير لحد ما أسجّل خروج
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button onClick={onConfirm}>أيوه، سجّل على حسابي</Button>
          <Button variant="outline" onClick={cancel}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
