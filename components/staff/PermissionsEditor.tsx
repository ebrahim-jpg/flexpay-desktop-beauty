"use client";

import { Switch } from "@/components/ui/switch";
import {
  CUSTOMIZABLE_PERMISSIONS,
  PERMISSION_LABELS,
  type Permissions,
} from "@/shared/permissions";

interface PermissionsEditorProps {
  value: Permissions;
  onChange: (value: Permissions) => void;
}

// وصف مختصر لكل صلاحية قابلة للتخصيص
const HINTS: Partial<Record<keyof Permissions, string>> = {
  canGiveDiscount: "يقدر يطبّق خصم على الفاتورة وقت الحساب.",
  canManageAttendance: "يقدر يسجّل حضور وانصراف الموظفين.",
  canManageExpenses: "يقدر يسجّل مصاريف المحل.",
};

// يظهر فقط للكاشير — 3 صلاحيات قابلة للتخصيص. باقي الأدوار صلاحياتها ثابتة.
export function PermissionsEditor({ value, onChange }: PermissionsEditorProps) {
  function toggle(key: keyof Permissions, checked: boolean) {
    onChange({ ...value, [key]: checked });
  }

  return (
    <div className="space-y-1 rounded-lg border border-border p-3">
      <p className="mb-1 text-sm font-medium text-text-primary">
        صلاحيات الموظف
      </p>
      <p className="mb-2 text-xs text-text-secondary">
        دي الصلاحيات الوحيدة القابلة للتخصيص. باقي حاجات النظام (ومنها مبيعات اليوم والتقارير) ممنوعة على الموظف.
      </p>
      <div className="space-y-1">
        {CUSTOMIZABLE_PERMISSIONS.map((key) => (
          <label
            key={key}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-surface-secondary"
          >
            <span>
              <span className="block text-sm text-text-primary">
                {PERMISSION_LABELS[key]}
              </span>
              {HINTS[key] && (
                <span className="block text-xs text-text-secondary">
                  {HINTS[key]}
                </span>
              )}
            </span>
            <Switch
              checked={value[key]}
              onCheckedChange={(c) => toggle(key, c)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
