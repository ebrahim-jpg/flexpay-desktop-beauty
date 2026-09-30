"use client";

import { Truck, Phone, Mail, Pencil, Trash2, Package, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSettingsStore } from "@/store/settings.store";
import type { SupplierDTO } from "@/shared/inventory";

interface SupplierListProps {
  suppliers: SupplierDTO[];
  canManage: boolean;
  onEdit: (supplier: SupplierDTO) => void;
  onDelete: (supplier: SupplierDTO) => void;
  onLedger: (supplier: SupplierDTO) => void;
}

export function SupplierList({
  suppliers,
  canManage,
  onEdit,
  onDelete,
  onLedger,
}: SupplierListProps) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        title="مفيش موردين"
        description="ابدأ بإضافة أول مورد للمحل."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {suppliers.map((s) => (
        <Card key={s.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-text-primary">{s.name}</p>
                <Badge variant="muted" className="mt-1">
                  <Package className="ms-0 me-1 h-3 w-3" />
                  {s.item_count} مادة
                </Badge>
              </div>
            </div>
            {canManage && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEdit(s)} title="تعديل">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(s)}
                  title="حذف"
                  className="text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="mt-3 space-y-1 text-sm text-text-secondary">
            {s.phone && (
              <p className="flex items-center gap-2" dir="ltr">
                <Phone className="h-3.5 w-3.5" />
                {s.phone}
              </p>
            )}
            {s.email && (
              <p className="flex items-center gap-2" dir="ltr">
                <Mail className="h-3.5 w-3.5" />
                {s.email}
              </p>
            )}
          </div>

          {/* الرصيد (آجل) + كشف الحساب */}
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            {s.balance > 0.001 ? (
              <Badge variant="danger">عليه {formatCurrency(s.balance)}</Badge>
            ) : (
              <Badge variant="success">خالص</Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => onLedger(s)}>
              <FileText className="h-4 w-4" />
              كشف حساب
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
