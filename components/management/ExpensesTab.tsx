"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ExpensesList } from "./ExpensesList";
import { ExpenseModal } from "./ExpenseModal";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import { businessDateKey, shiftDateKey } from "@/shared/business-day";
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseDTO,
  type ExpenseCategory,
} from "@/shared/management";

const CATEGORIES: (ExpenseCategory | "all")[] = [
  "all",
  "staff",
  "inventory",
  "utilities",
  "resources",
  "maintenance",
  "cleaning",
  "other",
];

export function ExpensesTab() {
  const { invoke } = useIPC();
  const role = useAuthStore((s) => s.currentUser?.role);
  const businessDayStart = useSettingsStore((s) => s.businessDayStart);
  const canDelete = role === "owner";
  const todayKey = businessDateKey(new Date(), businessDayStart);
  const minDate = shiftDateKey(todayKey, -29);

  const [mode, setMode] = useState<"today" | "last30">("today");
  const [category, setCategory] = useState<ExpenseCategory | "all">("all");
  const [dateFilter, setDateFilter] = useState("");
  const [person, setPerson] = useState("all");
  const [staff, setStaff] = useState("all");
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseDTO | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list =
        mode === "today"
          ? await invoke("expenses:getToday")
          : await invoke("expenses:getLast30Days", {
              category: "all", // الفلترة بالفئة بقت client-side عشان تشتغل في الوضعين
              dateFrom: dateFilter || null,
              dateTo: dateFilter || null,
            });
      setExpenses(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل المصاريف");
    } finally {
      setLoading(false);
    }
  }, [invoke, mode, dateFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // أشخاص المصاريف (خرجت من درج/وردية مين) — للفلتر
  const people = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.created_by_name))).sort(),
    [expenses]
  );
  // موظفين مرتبطين بمصاريف (مرتّبات/سُلف...) — للفلترة بموظف معيّن
  const staffNames = useMemo(
    () =>
      Array.from(
        new Set(expenses.filter((e) => e.staff_name).map((e) => e.staff_name as string))
      ).sort(),
    [expenses]
  );
  const visibleExpenses = useMemo(
    () =>
      expenses.filter(
        (e) =>
          (person === "all" || e.created_by_name === person) &&
          (category === "all" || e.category === category) &&
          (staff === "all" || e.staff_name === staff)
      ),
    [expenses, person, category, staff]
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await invoke("expenses:delete", deleteTarget.id);
      toast.success("تم حذف المصروف");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحذف");
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg bg-surface-secondary p-1">
              <Tab active={mode === "today"} onClick={() => setMode("today")} label="اليوم" />
              <Tab active={mode === "last30"} onClick={() => setMode("last30")} label="آخر 30 يوم" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {mode === "last30" && (
                <div className="flex items-center gap-1">
                  <Input
                    type="date"
                    value={dateFilter}
                    min={minDate}
                    max={todayKey}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-40"
                    dir="ltr"
                  />
                  {dateFilter && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDateFilter("")}
                      title="كل الأيام"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory | "all")}
                className="w-36"
                title="فلترة بالفئة"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "كل الفئات" : EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
              {staffNames.length > 0 && (
                <Select
                  value={staff}
                  onChange={(e) => setStaff(e.target.value)}
                  className="w-40"
                  title="فلترة بموظف"
                >
                  <option value="all">كل الموظفين</option>
                  {staffNames.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              )}
              {people.length > 1 && (
                <Select
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                  className="w-44"
                  title="خرجت من درج مين"
                >
                  <option value="all">كل الورديات</option>
                  {people.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              )}
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="h-5 w-5" />
                إضافة مصروف
              </Button>
            </div>
          </div>

          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <ExpensesList
              expenses={visibleExpenses}
              canDelete={canDelete}
              onDelete={setDeleteTarget}
            />
          )}
      </div>

      <ExpenseModal open={modalOpen} onOpenChange={setModalOpen} onSaved={load} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="حذف المصروف"
        description={`متأكد إنك عايز تحذف "${deleteTarget?.description}"؟`}
        confirmText="حذف"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-md px-4 py-2 text-sm font-medium transition-colors " +
        (active ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary")
      }
    >
      {label}
    </button>
  );
}
