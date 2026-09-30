"use client";

import { useState } from "react";
import { UserRound, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { useManagerGuardStore } from "@/store/manager-guard.store";
import { ROLE_LABELS } from "@/shared/permissions";

// ⚠️ نسخة البلايستيشن: «اختصارات الكاشير» (زر كيبورد = منتج) اتشالت مع صفحة الكاشير.
export default function ProfilePage() {
  const { invoke } = useIPC();
  const user = useAuthStore((s) => s.currentUser);

  return (
    <div className="space-y-6">
      <PageHeader title="ملفي الشخصي" description="بياناتك وكلمة السر" />

      {/* معلومات الحساب */}
      <Card className="flex items-center gap-4 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <UserRound className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold text-text-primary">{user?.name ?? "—"}</p>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Badge variant="muted">{user ? ROLE_LABELS[user.role] ?? user.role : "—"}</Badge>
            <span dir="ltr">@{user?.username}</span>
          </div>
        </div>
      </Card>

      {(user?.role === "owner" || user?.role === "manager") && <ManagerGuardCard />}
      <ChangePasswordCard invoke={invoke} />
    </div>
  );
}

function ManagerGuardCard() {
  const suppressed = useManagerGuardStore((s) => s.suppressed);
  const setSuppressed = useManagerGuardStore((s) => s.setSuppressed);
  return (
    <Card className="space-y-3 p-5">
      <h3 className="flex items-center gap-2 font-bold text-text-primary">
        <KeyRound className="h-4 w-4" />
        تحذير البيع على حسابي
      </h3>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium text-text-primary">نبّهني قبل ما أسجّل بيع/مصروف على حسابي</p>
          <p className="text-xs text-text-secondary">
            بيمنع إنك تسجّل بالغلط على حسابك بدل حساب موظف الصالة. لو أنت مستلم الوردية النهاردة
            عطّله — وبيرجع شغّال تلقائي لما تسجّل خروج.
          </p>
        </div>
        <Switch checked={!suppressed} onCheckedChange={(on) => setSuppressed(!on)} />
      </label>
    </Card>
  );
}

function ChangePasswordCard({ invoke }: { invoke: ReturnType<typeof useIPC>["invoke"] }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (newPassword.length < 4) {
      toast.error("كلمة السر الجديدة لازم 4 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirm) {
      toast.error("تأكيد كلمة السر مش مطابق");
      return;
    }
    try {
      setSaving(true);
      await invoke("profile:changePassword", { oldPassword, newPassword });
      toast.success("اتغيّرت كلمة السر");
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التغيير");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h3 className="flex items-center gap-2 font-bold text-text-primary">
        <KeyRound className="h-4 w-4" />
        تغيير كلمة السر
      </h3>
      <div className="grid max-w-md gap-3">
        <div className="space-y-1.5">
          <Label>كلمة السر الحالية</Label>
          <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label>كلمة السر الجديدة</Label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label>تأكيد كلمة السر</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" />
        </div>
        <Button onClick={save} disabled={saving || !newPassword} className="w-fit">
          {saving ? "جاري الحفظ..." : "حفظ كلمة السر"}
        </Button>
      </div>
    </Card>
  );
}
