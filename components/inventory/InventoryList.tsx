"use client";

import { Boxes } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { InventoryItemCard } from "./InventoryItemCard";
import type { InventoryItemDTO } from "@/shared/inventory";

interface InventoryListProps {
  items: InventoryItemDTO[];
  canManage: boolean;
  onRestock: (item: InventoryItemDTO) => void;
  onWaste: (item: InventoryItemDTO) => void;
  onHistory: (item: InventoryItemDTO) => void;
  onEdit: (item: InventoryItemDTO) => void;
  onDelete: (item: InventoryItemDTO) => void;
}

export function InventoryList({ items, ...handlers }: InventoryListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="مفيش مواد"
        description="ابدأ بإضافة أول مادة خام في المخزون."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((item) => (
        <InventoryItemCard key={item.id} item={item} {...handlers} />
      ))}
    </div>
  );
}
