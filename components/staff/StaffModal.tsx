"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Barcode } from "lucide-react";
import { PermissionsEditor } from "./PermissionsEditor";
import { generateBarcodePng, downloadPng } from "@/lib/barcode-image";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import {
  defaultPermissionsFor,
  canLogin,
  CUSTOMIZABLE_ROLES,
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  type Permissions,
  type Role,
} from "@/shared/permissions";
import type { SafeUser, CreateUserInput, UpdateUserInput } from "@/types/ipc.types";

// "" = استخدم القيمة العامة (null)؛ رقم صالح ≥ 0 = تخصيص للموظف
function parseHours(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

interface StaffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: SafeUser | null;
  onSaved: () => void;
}

export function StaffModal({
  open,
  onOpenChange,
  editing,
  onSaved,
}: StaffModalProps) {
  const { invoke } = useIPC();
  const viewerRole = useAuthStore((s) => s.currentUser?.role);
  const isEdit = !!editing;

  // المالك بس يقدر ينشئ/يعيّن دور "مالك". باقي الأدوار متاحة للمدير كمان.
  // مفيش ديليفري ولا بائع (ASSIGNABLE_ROLES) — ولو بتعدّل مستخدم قديم بدور منهم، دوره بيظهر عشان الفورم مايتلخبطش.
  const availableRoles: Role[] = ASSIGNABLE_ROLES.filter((r) => r !== "owner" || viewerRole === "owner");
  if (editing && !availableRoles.includes(editing.role)) availableRoles.push(editing.role);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [permissions, setPermissions] = useState<Permissions>(
    defaultPermissionsFor("cashier")
  );
  // كود الحضور (بديل البصمة) + تخصيص حدود الوقت لكل موظف
  const [attendanceCode, setAttendanceCode] = useState("");
  const [autoClockoutHours, setAutoClockoutHours] = useState("");
  const [warnHours, setWarnHours] = useState("");
  const [saving, setSaving] = useState(false);

  // إعادة ضبط النموذج عند الفتح
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setUsername(editing.username);
      setRole(editing.role);
      setPermissions(editing.permissions);
      setAutoClockoutHours(editing.auto_clockout_hours != null ? String(editing.auto_clockout_hours) : "");
      setWarnHours(editing.warn_hours != null ? String(editing.warn_hours) : "");
    } else {
      setName("");
      setUsername("");
      setRole("cashier");
      setPermissions(defaultPermissionsFor("cashier"));
      setAutoClockoutHours("");
      setWarnHours("");
    }
    setPassword("");
    setPin("");
    setAttendanceCode("");
  }, [open, editing]);

  // عند تغيير الدور: حدّث الصلاحيات الافتراضية
  function handleRoleChange(next: Role) {
    setRole(next);
    setPermissions(defaultPermissionsFor(next));
  }

  const usesPassword = role === "owner" || role === "manager";
  // الكاشير والنادل بيدخلوا بـPIN (شغل سريع على الشاشة)
  const usesPin = CUSTOMIZABLE_ROLES.includes(role);
  // الموظف مالوش دخول للنظام — مفيش باسورد ولا PIN
  const noLogin = !canLogin(role);

  function validate(): string | null {
    if (!name.trim()) return "اكتب اسم الموظف";
    if (!username.trim()) return "اكتب اسم المستخدم";
    if (usesPin) {
      if (!isEdit && !/^\d{4}$/.test(pin)) return "الـ PIN لازم 4 أرقام";
      if (isEdit && pin && !/^\d{4}$/.test(pin)) return "الـ PIN لازم 4 أرقام";
    }
    if (usesPassword) {
      if (!isEdit && password.length < 4) return "الباسورد 4 حروف على الأقل";
      if (isEdit && password && password.length < 4)
        return "الباسورد 4 حروف على الأقل";
    }
    // كود الحضور مطلوب لأي موظف جديد (بديل البصمة)؛ في التعديل اختياري
    if (!isEdit && !/^\d{5}$/.test(attendanceCode)) return "كود الحضور لازم 5 أرقام";
    if (isEdit && attendanceCode && !/^\d{5}$/.test(attendanceCode))
      return "كود الحضور لازم 5 أرقام";
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    try {
      setSaving(true);
      if (isEdit && editing) {
        const payload: UpdateUserInput = {
          id: editing.id,
          name: name.trim(),
          username: username.trim(),
          role,
          permissions: CUSTOMIZABLE_ROLES.includes(role) ? permissions : undefined,
          autoClockoutHours: parseHours(autoClockoutHours),
          warnHours: parseHours(warnHours),
        };
        if (usesPassword && password) payload.password = password;
        if (usesPin && pin) payload.pin = pin;
        await invoke("users:update", payload);
        // كود الحضور بيتحدّث لوحده (منفصل عن باقي البيانات)
        if (attendanceCode) {
          await invoke("users:setAttendanceCode", { userId: editing.id, code: attendanceCode });
        }
        toast.success("تم حفظ التعديلات");
      } else {
        const payload: CreateUserInput = {
          name: name.trim(),
          username: username.trim(),
          role,
          permissions: CUSTOMIZABLE_ROLES.includes(role) ? permissions : undefined,
          attendanceCode,
          autoClockoutHours: parseHours(autoClockoutHours),
          warnHours: parseHours(warnHours),
        };
        if (usesPassword) payload.password = password;
        if (usesPin) payload.pin = pin;
        await invoke("users:create", payload);
        toast.success("تم إضافة الموظف");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSaving(false);
    }
  }

  const ownerLocked = isEdit && editing?.role === "owner";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل موظف" : "إضافة موظف"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "عدّل بيانات الموظف. سيب الباسورد/الـ PIN فاضي لو مش عايز تغيّره."
              : "أضف موظف جديد وحدد دوره وصلاحياته."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>اسم المستخدم</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              dir="ltr"
              className="text-right"
            />
          </div>

          <div className="space-y-1.5">
            <Label>الدور</Label>
            <Select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value as Role)}
              disabled={ownerLocked}
            >
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-text-secondary">{ROLE_DESCRIPTIONS[role]}</p>
          </div>

          {usesPassword && (
            <div className="space-y-1.5">
              <Label>{isEdit ? "باسورد جديد (اختياري)" : "الباسورد"}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? "سيبه فاضي لو مش هيتغير" : "••••••••"}
              />
            </div>
          )}

          {usesPin && (
            <div className="space-y-1.5">
              <Label>{isEdit ? "PIN جديد (اختياري)" : "الـ PIN (4 أرقام)"}</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="••••"
                dir="ltr"
                className="text-center tracking-[0.5em]"
              />
            </div>
          )}

          {noLogin && (
            <p className="rounded-lg border border-border bg-surface-secondary/50 p-3 text-xs text-text-secondary">
              الموظف مالوش دخول للنظام (مفيش باسورد ولا PIN). بيتسجّل هنا عشان نستخدمه في
              الحضور والمصاريف.
            </p>
          )}

          {/* كود الحضور (بديل البصمة) — لأي دور */}
          <div className="space-y-1.5">
            <Label>
              كود الحضور {isEdit ? "(اختياري — سيبه فاضي لو مش هيتغير)" : "(5 أرقام)"}
            </Label>
            <Input
              inputMode="numeric"
              maxLength={5}
              value={attendanceCode}
              onChange={(e) => setAttendanceCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder={isEdit && editing?.has_attendance_code ? "معيّن — سيبه فاضي" : "•••••"}
              dir="ltr"
              className="text-center tracking-[0.5em]"
            />
            <p className="text-xs text-text-secondary">
              كود خاص بالموظف يسجّل بيه حضوره وانصرافه بنفسه (زي البصمة) — منفصل عن الباسورد.
            </p>
            {/* توليد باركود PNG للكود — عشان الموظف يسكنه بدل ما يكتبه (الكود مشفّر فبنولّده وقت ما تكتبه) */}
            {/^\d{5}$/.test(attendanceCode) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  try {
                    const png = generateBarcodePng(attendanceCode, name.trim() || "موظف");
                    downloadPng(png, `باركود-${name.trim() || attendanceCode}`);
                    toast.success("تم تنزيل الباركود");
                  } catch {
                    toast.error("تعذّر توليد الباركود");
                  }
                }}
              >
                <Barcode className="h-4 w-4" />
                تنزيل باركود الحضور (PNG)
              </Button>
            )}
          </div>

          {/* تخصيص حدود الوقت لهذا الموظف (اختياري — فاضي = القيمة العامة) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>انصراف تلقائي بعد (ساعة)</Label>
              <Input
                inputMode="decimal"
                value={autoClockoutHours}
                onChange={(e) => setAutoClockoutHours(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="عام"
                dir="ltr"
                className="text-center"
              />
            </div>
            <div className="space-y-1.5">
              <Label>تحذير بعد (ساعة)</Label>
              <Input
                inputMode="decimal"
                value={warnHours}
                onChange={(e) => setWarnHours(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="عام"
                dir="ltr"
                className="text-center"
              />
            </div>
          </div>
          <p className="text-xs text-text-secondary">
            سيبهم فاضيين عشان يستخدم الموظف القيمة العامة من الإعدادات.
          </p>

          {CUSTOMIZABLE_ROLES.includes(role) && (
            <PermissionsEditor value={permissions} onChange={setPermissions} />
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
