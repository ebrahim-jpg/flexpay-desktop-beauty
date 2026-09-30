"use client";

import { AlertTriangle, Plus, Trash, History, Pencil, PackageX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/shared/inventory";
import type { InventoryItemDTO } from "@/shared/inventory";

interface InventoryItemCardProps {
  item: InventoryItemDTO;
  canManage: boolean;
  onRestock: (item: InventoryItemDTO) => void;
  onWaste: (item: InventoryItemDTO) => void;
  onHistory: (item: InventoryItemDTO) => void;
  onEdit: (item: InventoryItemDTO) => void;
  onDelete: (item: InventoryItemDTO) => void;
}

// 3 منازل عشرية للكميات
function qty(n: number): string {
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 3 });
}

export function InventoryItemCard({
  item,
  canManage,
  onRestock,
  onWaste,
  onHistory,
  onEdit,
  onDelete,
}: InventoryItemCardProps) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const bg =
    item.status === "out_of_stock"
      ? "bg-danger/5 border-danger/30"
      : item.status === "low"
        ? "bg-warning/5 border-warning/30"
        : "";

  return (
    <Card className={cn("p-4", bg)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {item.status === "low" && <AlertTriangle className="h-4 w-4 text-warning" />}
            {item.status === "out_of_stock" && <PackageX className="h-4 w-4 text-danger" />}
            <h3 className="truncate font-semibold text-text-primary">{item.name}</h3>
            {item.status === "out_of_stock" && <Badge variant="danger">نفد</Badge>}
            {item.status === "low" && <Badge variant="warning">منخفض</Badge>}
          </div>
          {item.supplier_name && (
            <p className="mt-0.5 text-xs text-text-secondary">
              المورد: {item.supplier_name}
            </p>
          )}
        </div>
        <span className="shrink-0 text-lg font-bold text-text-primary" dir="ltr">
          {qty(item.current_quantity)} {item.unit}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <p className="text-text-secondary">
          النطاق المتوقع:{" "}
          <span className="font-medium text-text-primary" dir="ltr">
            {qty(item.expected_min)} — {qty(item.expected_max)}
          </span>{" "}
          {item.waste_percentage > 0 && (
            <span className="text-xs">(تهدير {item.waste_percentage}%)</span>
          )}
        </p>
        {item.current_quantity <= item.alert_threshold && (
          <p className="text-xs text-warning">
            أقل من أو يساوي حد التنبيه ({qty(item.alert_threshold)} {item.unit})
          </p>
        )}
        <p className="text-text-secondary">
          التكلفة:{" "}
          <span className="font-medium text-text-primary">
            {formatCurrency(item.cost_per_unit)}/{item.unit}
          </span>
        </p>
      </div>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={() => onRestock(item)}>
            <Plus className="h-4 w-4" />
            إضافة كمية
          </Button>
          <Button variant="outline" size="sm" onClick={() => onWaste(item)}>
            <Trash className="h-4 w-4" />
            هالك
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onHistory(item)}
            title="سجل الحركات"
          >
            <History className="h-4 w-4" />
          </Button>
          <div className="ms-auto flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(item)} title="تعديل">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(item)}
              title="حذف"
              className="text-danger hover:bg-danger/10"
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
