"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, FileText, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PurchaseInvoiceModal } from "@/components/inventory/PurchaseInvoiceModal";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  PurchaseInvoiceDTO,
  PurchaseInvoiceListItem,
} from "@/shared/purchases";

export function PurchaseInvoicesTab() {
  const { invoke } = useIPC();
  // يقدر يسجّل فاتورة: مدير المخزون أو كاشير مخصّص له تسجيل الفواتير
  const canManage = useAuthStore(
    (s) =>
      s.hasPermission("canManageInventory") ||
      s.hasPermission("canCreatePurchaseInvoices")
  );
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [invoices, setInvoices] = useState<PurchaseInvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseInvoiceDTO | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setInvoices(await invoke("purchases:getInvoices"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الفواتير");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: number) {
    try {
      const inv = await invoke("purchases:getInvoiceById", id);
      if (inv) setDetail(inv);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر فتح الفاتورة");
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-5 w-5" />
            فاتورة توريد جديدة
          </Button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center text-text-secondary">
          <FileText className="h-8 w-8 opacity-40" />
          <p>مفيش فواتير توريد لسه.</p>
          <p className="text-xs">سجّل فاتورة فيها كذا مادة مرة واحدة بدل ما تضيف لكل مادة لوحدها.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-text-secondary">
              <tr>
                <th className="px-4 py-3 text-right font-medium">التاريخ</th>
                <th className="px-4 py-3 text-right font-medium">الفاتورة</th>
                <th className="px-4 py-3 text-right font-medium">المورد</th>
                <th className="px-4 py-3 text-center font-medium">البنود</th>
                <th className="px-4 py-3 text-left font-medium">الإجمالي</th>
                <th className="px-4 py-3 text-left font-medium">المدفوع</th>
                <th className="px-4 py-3 text-center font-medium">النوع</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => openDetail(inv.id)}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-text-secondary" dir="ltr">{inv.invoice_date}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{inv.reference || "—"}</td>
                  <td className="px-4 py-3 text-text-primary">{inv.supplier_name || "بدون مورد"}</td>
                  <td className="px-4 py-3 text-center text-text-secondary">{inv.item_count}</td>
                  <td className="px-4 py-3 text-left font-semibold text-text-primary" dir="ltr">{formatCurrency(inv.total_cost)}</td>
                  <td className="px-4 py-3 text-left text-text-secondary" dir="ltr">{formatCurrency(inv.paid_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    {inv.payment_type === "credit" ? (
                      <Badge variant="warning">آجل</Badge>
                    ) : (
                      <Badge variant="success">كاش</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PurchaseInvoiceModal open={createOpen} onOpenChange={setCreateOpen} onSaved={load} />

      {/* تفاصيل الفاتورة */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              فاتورة توريد {detail?.reference ? `— ${detail.reference}` : ""}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Info label="التاريخ" value={detail.invoice_date} ltr />
                <Info label="المورد" value={detail.supplier_name || "بدون مورد"} />
                <Info label="النوع" value={detail.payment_type === "credit" ? "آجل" : "كاش"} />
                <Info label="الإجمالي" value={formatCurrency(detail.total_cost)} ltr />
                <Info label="المدفوع" value={formatCurrency(detail.paid_amount)} ltr />
                <Info
                  label="دين على المورد"
                  value={formatCurrency(Math.max(0, detail.total_cost - detail.paid_amount))}
                  ltr
                />
                {detail.drawer_amount > 0 && (
                  <Info
                    label="من الدرج"
                    value={`${formatCurrency(detail.drawer_amount)}${detail.drawer_owner_name ? ` — ${detail.drawer_owner_name}` : ""}`}
                  />
                )}
                <Info label="سجّلها" value={detail.created_by_name} />
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-secondary text-text-secondary">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">المادة</th>
                      <th className="px-3 py-2 text-center font-medium">الكمية</th>
                      <th className="px-3 py-2 text-left font-medium">سعر الوحدة</th>
                      <th className="px-3 py-2 text-left font-medium">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-3 py-2 text-text-primary">
                          <span className="inline-flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 text-text-secondary" />
                            {it.item_name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-text-secondary" dir="ltr">
                          {it.quantity} {it.unit || ""}
                        </td>
                        <td className="px-3 py-2 text-left text-text-secondary" dir="ltr">{formatCurrency(it.unit_cost)}</td>
                        <td className="px-3 py-2 text-left font-medium text-text-primary" dir="ltr">{formatCurrency(it.line_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detail.notes && (
                <p className="rounded-md bg-surface-secondary p-3 text-xs text-text-secondary">
                  {detail.notes}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="font-medium text-text-primary" dir={ltr ? "ltr" : undefined}>
        {value}
      </p>
    </div>
  );
}
