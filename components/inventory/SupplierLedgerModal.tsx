"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Banknote, Wallet, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { useCashierNet, isOverDrawerNet } from "@/hooks/useCashierNet";
import { DrawerNetWarning } from "@/components/shared/DrawerNetWarning";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/formatters";
import { SUPPLIER_TX_LABELS, type SupplierDTO, type SupplierLedger } from "@/shared/inventory";
import type { SafeUser } from "@/types/ipc.types";

interface SupplierLedgerModalProps {
  supplier: SupplierDTO | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function SupplierLedgerModal({
  supplier,
  onOpenChange,
  onChanged,
}: SupplierLedgerModalProps) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [ledger, setLedger] = useState<SupplierLedger | null>(null);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("");
  const [drawer, setDrawer] = useState("");
  const [drawerOwnerId, setDrawerOwnerId] = useState<number | "">("");
  const [cashiers, setCashiers] = useState<SafeUser[]>([]);
  const [notes, setNotes] = useState("");
  const [paying, setPaying] = useState(false);

  const supplierId = supplier?.id ?? null;
  const drw = Number(drawer) || 0;
  const needsDrawerOwner = drw > 0 && drawerOwnerId === "";
  // حماية الدرج: صافي الكاشير المختار
  const netInfo = useCashierNet(drw > 0 && drawerOwnerId !== "" ? Number(drawerOwnerId) : null);
  const overNet = isOverDrawerNet(netInfo, drw);

  const load = useCallback(async () => {
    if (supplierId == null) return;
    try {
      setLoading(true);
      const res = await invoke("suppliers:getLedger", supplierId);
      setLedger(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل كشف الحساب");
    } finally {
      setLoading(false);
    }
  }, [invoke, supplierId]);

  useEffect(() => {
    if (supplierId != null) {
      setAmount("");
      setDrawer("");
      setDrawerOwnerId("");
      setNotes("");
      void load();
      void invoke("users:getActiveCashiers").then(setCashiers).catch(() => undefined);
    }
  }, [supplierId, load, invoke]);

  const balance = ledger?.supplier.balance ?? supplier?.balance ?? 0;

  async function handlePay() {
    if (supplierId == null) return;
    const amt = Number(amount) || 0;
    const drw = Number(drawer) || 0;
    if (amt <= 0) {
      toast.error("اكتب مبلغ الدفعة");
      return;
    }
    if (drw > amt) {
      toast.error("اللي خرج من الدرج مينفعش يكون أكبر من الدفعة");
      return;
    }
    if (needsDrawerOwner) {
      toast.error("حدّد الفلوس خرجت من درج مين");
      return;
    }
    if (overNet && netInfo) {
      toast.error(`صافي درج ${netInfo.cashier_name} أقل من المبلغ — مينفعش يخرج أكتر مما في الدرج`);
      return;
    }
    try {
      setPaying(true);
      await invoke("suppliers:recordPayment", {
        supplier_id: supplierId,
        amount: amt,
        drawer_amount: drw,
        drawer_owner_id: drw > 0 ? Number(drawerOwnerId) : null,
        notes: notes.trim() || null,
      });
      toast.success("تم تسجيل الدفعة");
      setAmount("");
      setDrawer("");
      setDrawerOwnerId("");
      setNotes("");
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تسجيل الدفعة");
    } finally {
      setPaying(false);
    }
  }

  return (
    <Dialog open={!!supplier} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            كشف حساب — {supplier?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* الرصيد */}
          <div
            className={
              "flex items-center justify-between rounded-lg p-4 " +
              (balance > 0.001 ? "bg-danger/10" : "bg-success/10")
            }
          >
            <span className="font-medium text-text-primary">المستحق للمورد</span>
            <span
              className={
                "text-2xl font-bold tabular-nums " +
                (balance > 0.001 ? "text-danger" : "text-success")
              }
            >
              {formatCurrency(balance)}
            </span>
          </div>

          {ledger && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <span className="text-text-secondary">إجمالي الآجل</span>
                <span className="font-semibold text-text-primary tabular-nums">
                  {formatCurrency(ledger.total_purchased)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <span className="text-text-secondary">إجمالي المدفوع</span>
                <span className="font-semibold text-text-primary tabular-nums">
                  {formatCurrency(ledger.total_paid)}
                </span>
              </div>
            </div>
          )}

          {/* تسجيل دفعة */}
          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="flex items-center gap-2 font-semibold text-text-primary">
              <TrendingDown className="h-4 w-4 text-success" />
              تسجيل دفعة للمورد
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>مبلغ الدفعة</Label>
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  dir="ltr"
                  className="text-right"
                />
              </div>
              <div className="space-y-1.5">
                <Label>منهم من الدرج</Label>
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={drawer}
                  onChange={(e) => setDrawer(e.target.value)}
                  placeholder="0"
                  dir="ltr"
                  className="text-right"
                />
              </div>
            </div>
            {drw > 0 && (
              <div className="space-y-1.5">
                <Label>الفلوس خرجت من درج مين؟</Label>
                <Select
                  value={String(drawerOwnerId)}
                  onChange={(e) =>
                    setDrawerOwnerId(e.target.value ? Number(e.target.value) : "")
                  }
                  className={cn(needsDrawerOwner && "border-danger")}
                >
                  <option value="">اختر الموظف...</option>
                  {cashiers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <DrawerNetWarning net={netInfo} amount={drw} />
              </div>
            )}
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظة (اختياري)"
            />
            <p className="text-xs text-text-secondary">
              اللي خرج من الدرج بيتسجّل في مصاريف اليوم على{" "}
              <b>وردية الموظف اللي تختاره</b> (مش المدير). الباقي بيتخصم من رصيد المورد عادي.
            </p>
            <Button className="w-full" onClick={handlePay} disabled={paying}>
              {paying ? "جاري الحفظ..." : "تسجيل الدفعة"}
            </Button>
          </div>

          {/* كشف الحركات */}
          <div className="space-y-2">
            <p className="font-semibold text-text-primary">الحركات</p>
            {loading && !ledger ? (
              <LoadingSkeleton rows={3} />
            ) : !ledger || ledger.transactions.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-secondary">
                لسه مفيش حركات على المورد ده.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {ledger.transactions.map((tx) => {
                  const isPayment = tx.type === "payment";
                  return (
                    <div key={tx.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={
                            "flex h-9 w-9 items-center justify-center rounded-full " +
                            (isPayment
                              ? "bg-success/10 text-success"
                              : "bg-danger/10 text-danger")
                          }
                        >
                          {isPayment ? (
                            <Banknote className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {SUPPLIER_TX_LABELS[tx.type]}
                            {tx.description && (
                              <span className="mr-1 text-xs font-normal text-text-secondary">
                                — {tx.description}
                              </span>
                            )}
                          </p>
                          <p className="flex items-center gap-2 text-[11px] text-text-secondary">
                            <span>{formatDateTime(tx.created_at)}</span>
                            {tx.drawer_amount > 0 && (
                              <Badge variant="muted" className="gap-1">
                                <Wallet className="h-3 w-3" />
                                {formatCurrency(tx.drawer_amount)} من الدرج
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p
                          className={
                            "text-sm font-bold tabular-nums " +
                            (isPayment ? "text-success" : "text-danger")
                          }
                        >
                          {isPayment ? "−" : "+"}
                          {formatCurrency(Math.abs(tx.balance_change))}
                        </p>
                        <p className="text-[11px] text-text-secondary tabular-nums">
                          الرصيد: {formatCurrency(tx.balance_after)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
