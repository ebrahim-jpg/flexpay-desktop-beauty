"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useIPC } from "@/hooks/useIPC";
import { MAX_AREA_LENGTH, type GamingRoomDTO } from "@/shared/gaming";

interface Draft {
  id?: number;
  name: string;
  area: string;
  is_active: boolean;
}

const toDraft = (r: GamingRoomDTO): Draft => ({ id: r.id, name: r.name, area: r.area ?? "", is_active: r.is_active });

// إدارة الكراسي («بلايستيشن + كافيه»): الاسم + المنطقة بس. **مفيش سعر ولا عدد كراسي** (قرار صاحب
// المشروع: الكراسي بتزيد وتقل على حسب الناس). الكرسي اللي عليها حساب مفتوح مايتوقفش/مايتحذفش (الـmain بيرفض).
export function TablesManager({ onChanged }: { onChanged?: () => void }) {
  const { invoke } = useIPC();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    try {
      const tables = await invoke("gaming:rooms:list", { includeInactive: true });
      setDrafts(tables.map(toDraft));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الكراسي");
    }
  }, [invoke]);

  useEffect(() => {
    void load();
  }, [load]);

  // اقتراحات المناطق من الموجود — عشان «خارجي» و«خارجى» مايبقوش منطقتين
  const areas = useMemo(
    () => [...new Set(drafts.map((d) => d.area.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")),
    [drafts]
  );

  function patch(i: number, p: Partial<Draft>) {
    setDrafts((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...p } : d)));
  }

  async function save(i: number) {
    const d = drafts[i];
    try {
      setSavingIdx(i);
      await invoke("gaming:rooms:save", {
        id: d.id,
        name: d.name,
        area: d.area.trim() || null,
        is_active: d.is_active,
      });
      toast.success(`اتحفظت ${d.name}`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ الكرسي");
    } finally {
      setSavingIdx(null);
    }
  }

  async function remove(d: Draft) {
    if (d.id == null) {
      setDrafts((ds) => ds.filter((x) => x !== d));
      return;
    }
    try {
      await invoke("gaming:rooms:delete", d.id);
      toast.success(`اتحذفت ${d.name}`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حذف الكرسي");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>الكراسي والمناطق</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setDrafts((ds) => [
              ...ds,
              { name: `كرسي ${ds.length + 1}`, area: ds[ds.length - 1]?.area ?? "", is_active: true },
            ])
          }
        >
          <Plus />
          كرسي جديدة
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {drafts.length === 0 && (
          <p className="text-sm text-text-secondary">
            لسه مفيش كراسي — ضيف الكراسي، وحط لكل واحدة منطقة (داخلي / خارجي / الدور التاني) لو عايز تقسّمهم.
          </p>
        )}
        {drafts.length > 0 && (
          <div className="grid grid-cols-[1.4fr_1.2fr_auto_auto] items-center gap-2 px-1 text-xs text-text-secondary">
            <span>الاسم</span>
            <span>المنطقة (اختياري)</span>
            <span>مفعّلة</span>
            <span />
          </div>
        )}
        <datalist id="table-areas">
          {areas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        {drafts.map((d, i) => (
          <div key={d.id ?? `new-${i}`} className="grid grid-cols-[1.4fr_1.2fr_auto_auto] items-center gap-2">
            <Input value={d.name} onChange={(e) => patch(i, { name: e.target.value })} />
            <Input
              value={d.area}
              list="table-areas"
              maxLength={MAX_AREA_LENGTH}
              placeholder="داخلي"
              onChange={(e) => patch(i, { area: e.target.value })}
            />
            <Switch checked={d.is_active} onCheckedChange={(c) => patch(i, { is_active: c })} />
            <div className="flex gap-1">
              <Button size="icon" variant="outline" disabled={savingIdx === i} onClick={() => void save(i)} aria-label="حفظ">
                <Save />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setToDelete(d)} aria-label="حذف">
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`حذف ${toDelete?.name ?? "الكرسي"}؟`}
        description="الحسابات القديمة بتفضل في السجل والتقارير. الكرسي اللي عليها حساب مفتوح مايتحذفش."
        confirmText="حذف"
        variant="danger"
        onConfirm={async () => {
          if (toDelete) await remove(toDelete);
          setToDelete(null);
        }}
      />
    </Card>
  );
}
