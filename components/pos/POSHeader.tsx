"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, Truck, AlertCircle, Bike } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CustomerSearch } from "./CustomerSearch";
import { useCartStore } from "@/store/cart.store";
import { useSettingsStore } from "@/store/settings.store";
import { useIPC } from "@/hooks/useIPC";
import { cn } from "@/lib/utils";
import type { SafeUser } from "@/types/ipc.types";

// هيدر كاشير المطعم — **تيك أواي أو توصيل بس**.
// ⚠️ أوردر الصالة مكانه شاشة «الطاولات» (حساب مفتوح على طاولة يتقفل بعدين)، مش هنا —
// عشان الموظف مايفتحش أوردر صالة بالغلط من الكاشير فيطلع من غير طاولة.
// نوع الطلب في الداتابيز لسه `counter`؛ «تيك أواي» هو لفظه في المطعم.
export function POSHeader() {
  const { invoke } = useIPC();
  const orderType = useCartStore((s) => s.orderType);
  const setOrderType = useCartStore((s) => s.setOrderType);
  const isGuest = useCartStore((s) => s.isGuest);
  const notes = useCartStore((s) => s.notes);
  const setNotes = useCartStore((s) => s.setNotes);
  const deliveryZoneId = useCartStore((s) => s.deliveryZoneId);
  const setDeliveryZone = useCartStore((s) => s.setDeliveryZone);
  const deliveryPersonId = useCartStore((s) => s.deliveryPersonId);
  const setDeliveryPerson = useCartStore((s) => s.setDeliveryPerson);

  const zones = useSettingsStore((s) => s.deliveryZones);
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [deliveryPersons, setDeliveryPersons] = useState<SafeUser[]>([]);

  useEffect(() => {
    let alive = true;
    void invoke("users:getAll")
      .then((users) => {
        if (alive) {
          setDeliveryPersons(
            users.filter((u) => u.role === "delivery" && u.is_active)
          );
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [invoke]);

  const isDelivery = orderType === "delivery";
  const deliveryNeedsCustomer = isDelivery && isGuest;
  const selectedZone = zones.find((z) => z.id === deliveryZoneId) ?? null;

  return (
    <header className="flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-8 w-px shrink-0 bg-border" />

        {/* العميل */}
        <div className="min-w-[220px] flex-1 sm:max-w-xs">
          <CustomerSearch />
        </div>

        {/* ملاحظة / عنوان التوصيل */}
        <div className="min-w-[200px] flex-1">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isDelivery ? "عنوان / ملاحظة التوصيل..." : "ملاحظة على الأوردر (اختياري)..."
            }
          />
        </div>

        {deliveryNeedsCustomer && (
          <p className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            التوصيل لازم تحدد عميل
          </p>
        )}
      </div>

      {/* صف التوصيل: منطقة + دليفري (يظهر مع التوصيل بس) */}
      {isDelivery && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-secondary/60 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
            <Bike className="h-4 w-4" />
            التوصيل:
          </span>

          {/* منطقة التوصيل */}
          <div className="min-w-[160px] flex-1 sm:max-w-[220px]">
            <Select
              value={deliveryZoneId ?? ""}
              onChange={(e) => setDeliveryZone(e.target.value || null)}
            >
              <option value="">
                {zones.length ? "اختر منطقة التوصيل" : "مفيش مناطق (زوّدها في الإعدادات)"}
              </option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} — {formatCurrency(z.price)}
                </option>
              ))}
            </Select>
          </div>

          {/* الدليفري */}
          <div className="min-w-[160px] flex-1 sm:max-w-[220px]">
            <Select
              value={deliveryPersonId != null ? String(deliveryPersonId) : ""}
              onChange={(e) =>
                setDeliveryPerson(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">
                {deliveryPersons.length ? "اختر الدليفري" : "مفيش دليفرية مضافين"}
              </option>
              {deliveryPersons.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>

          {selectedZone && (
            <span className="text-xs text-text-secondary">
              سعر التوصيل: <span className="font-bold text-text-primary">{formatCurrency(selectedZone.price)}</span>
              <span className="text-[10px]"> (للعميل بس — مش في حساب المحل)</span>
            </span>
          )}
        </div>
      )}
    </header>
  );
}

function SegButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-text-secondary hover:text-text-primary"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
