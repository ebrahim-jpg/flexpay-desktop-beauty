"use client";

import { Phone, User, Globe, CalendarDays, Pencil, Trash2, StickyNote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClassificationBadge } from "./ClassificationBadge";
import { GENDER_LABELS, type CustomerDTO } from "@/shared/customers";
import { formatDate } from "@/lib/formatters";

interface ProfileCardProps {
  customer: CustomerDTO;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function CustomerProfileCard({
  customer,
  canManage,
  onEdit,
  onDelete,
}: ProfileCardProps) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary">
            {customer.name.charAt(0)}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-text-primary">{customer.name}</h2>
              <ClassificationBadge classification={customer.classification} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
              {customer.phone && (
                <span className="flex items-center gap-1" dir="ltr">
                  <Phone className="h-4 w-4" />
                  {customer.phone}
                </span>
              )}
              {customer.gender && (
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {GENDER_LABELS[customer.gender]}
                </span>
              )}
              {customer.nationality && (
                <span className="flex items-center gap-1">
                  <Globe className="h-4 w-4" />
                  {customer.nationality}
                </span>
              )}
            </div>
            {customer.first_visit_at && (
              <p className="flex items-center gap-1 text-sm text-text-secondary">
                <CalendarDays className="h-4 w-4" />
                عميل منذ: {formatDate(customer.first_visit_at)}
              </p>
            )}
            {customer.notes && (
              <p className="mt-1 flex items-start gap-1.5 rounded-md bg-surface-secondary px-3 py-2 text-sm text-text-primary">
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-secondary" />
                {customer.notes}
              </p>
            )}
          </div>
        </div>

        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              تعديل
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              حذف
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
