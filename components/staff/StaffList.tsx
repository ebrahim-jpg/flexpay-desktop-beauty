"use client";

import { UserRound, Pencil, Ban, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, type Role } from "@/shared/permissions";
import type { SafeUser } from "@/types/ipc.types";

interface StaffListProps {
  users: SafeUser[];
  canManage: boolean;
  viewerRole: Role;
  onEdit: (user: SafeUser) => void;
  onDeactivate: (user: SafeUser) => void;
  onReactivate: (user: SafeUser) => void;
}

const roleBadge: Record<Role, "default" | "accent" | "muted"> = {
  owner: "default",
  manager: "accent",
  cashier: "muted",
  stylist: "accent",
  waiter: "muted",
  chef: "muted",
  employee: "muted",
  delivery: "muted",
  seller: "muted",
};

export function StaffList({
  users,
  canManage,
  viewerRole,
  onEdit,
  onDeactivate,
  onReactivate,
}: StaffListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((user) => (
        <Card key={user.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-text-primary">{user.name}</p>
                <p className="text-xs text-text-secondary" dir="ltr">
                  {user.username}
                </p>
              </div>
            </div>
            {user.is_active ? (
              <Badge variant="success">نشط</Badge>
            ) : (
              <Badge variant="danger">معطّل</Badge>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <Badge variant={roleBadge[user.role]}>
              {ROLE_LABELS[user.role]}
            </Badge>

            {canManage && (user.role !== "owner" || viewerRole === "owner") && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(user)}
                  title="تعديل"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {user.role !== "owner" &&
                  (user.is_active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeactivate(user)}
                      title="تعطيل"
                      className="text-danger hover:bg-danger/10"
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onReactivate(user)}
                      title="إعادة تفعيل"
                      className="text-success hover:bg-success/10"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  ))}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
