"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { useSettingsStore } from "@/store/settings.store";
import {
  computeTotals,
  type CartItem,
  type SelectedModifier,
  type OrderType,
  type DiscountType,
  type OrderTotals,
  type FreeRecipientType,
} from "@/shared/orders";
import type { ProductDTO } from "@/shared/products";

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

// مفتاح يجمع نفس المنتج بنفس الحجم ونفس الخيارات في بند واحد
// ⚠️ الحجم جزء من المفتاح: من غيره «بيتزا سمول» و«بيتزا لارج» بيتلمّوا في بند واحد بسعر واحد
function signature(
  productId: number,
  variantId: number | null,
  modifiers: SelectedModifier[],
  notes: string
): string {
  const mods = [...modifiers].map((m) => m.option_id).sort().join(",");
  return `${productId}|${variantId ?? 0}|${mods}|${notes}`;
}

interface CartState {
  items: CartItem[];
  customerId: number | null;
  customerName: string;
  isGuest: boolean;
  orderType: OrderType;
  discountType: DiscountType;
  discountValue: number;
  isFree: boolean;
  freeRecipientType: FreeRecipientType | null;
  freeRecipientId: number | null;
  freeRecipientName: string;
  notes: string;
  onlineOrderLocalId: string | null; // لو السلة اتملّت من طلب متجر — للربط والتمييز
  deliveryZoneId: string | null; // منطقة التوصيل (سعرها للعرض بس)
  deliveryPersonId: number | null; // الدليفري المسؤول
  // ملاحظة: العنوان مالوش state منفصل — العنوان/الملاحظة العامة كلاهما في notes
  // (حقل الهيدر «عنوان / ملاحظة التوصيل») — قاعدة: حقل واحد بلا ازدواجية.

  addItem: (
    product: ProductDTO,
    modifiers: SelectedModifier[],
    notes?: string,
    addQty?: number,
    size?: { id: number; size: string; price: number } | null
  ) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  incrementQuantity: (lineId: string, delta: number) => void;
  setCustomer: (id: number | null, name: string) => void;
  setOrderType: (type: OrderType) => void;
  setDiscount: (type: DiscountType, value: number) => void;
  setFree: (isFree: boolean) => void;
  setFreeRecipient: (
    type: FreeRecipientType,
    id: number,
    name: string
  ) => void;
  clearFree: () => void;
  setNotes: (notes: string) => void;
  setOnlineOrder: (localId: string | null) => void;
  setDeliveryZone: (zoneId: string | null) => void;
  setDeliveryPerson: (personId: number | null) => void;
  clearCart: () => void;

  subtotal: () => number;
  totals: () => OrderTotals;
  changeAmount: (paid: number) => number;
  itemCount: () => number;
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  customerId: null,
  customerName: "زائر",
  isGuest: true,
  orderType: "counter",
  discountType: "none",
  discountValue: 0,
  isFree: false,
  freeRecipientType: null,
  freeRecipientId: null,
  freeRecipientName: "",
  notes: "",
  onlineOrderLocalId: null,
  deliveryZoneId: null,
  deliveryPersonId: null,

  addItem: (product, modifiers, notes = "", addQty, size = null) => {
    // ⚠️ الحجم **بيستبدل** سعر المنتج، والإضافات بتتجمع فوقه (مش الاتنين زيادة).
    // نفس المعادلة بالظبط في `buildLine` بالـMain — والسعر النهائي من هناك مش من هنا.
    const basePrice = size ? size.price : product.price;
    const adjustments = modifiers.reduce((s, m) => s + m.price_adjustment, 0);
    const unitPrice = basePrice + adjustments;
    const sig = signature(product.id, size?.id ?? null, modifiers, notes);
    // الكمية المضافة: وزن = الوزن الممرّر (أو 1 كيلو) | قطعة = 1
    const qty = addQty && addQty > 0 ? addQty : 1;

    set((state) => {
      // لو نفس المنتج بنفس الخيارات موجود → زوّد الكمية
      const existing = state.items.find(
        (i) => signature(i.productId, i.variantId, i.selectedModifiers, i.itemNotes) === sig
      );
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.lineId === existing.lineId
              ? {
                  ...i,
                  quantity: i.quantity + qty,
                  totalPrice: i.unitPrice * (i.quantity + qty),
                }
              : i
          ),
        };
      }
      const item: CartItem = {
        lineId: uid(),
        productId: product.id,
        productName: product.name,
        image: product.image,
        basePrice,
        selectedModifiers: modifiers,
        unitPrice,
        quantity: qty,
        totalPrice: unitPrice * qty,
        itemNotes: notes,
        saleType: product.sale_type,
        variantId: size?.id ?? null,
        variantSize: size?.size ?? null,
      };
      return { items: [...state.items, item] };
    });
  },

  removeItem: (lineId) =>
    set((state) => ({ items: state.items.filter((i) => i.lineId !== lineId) })),

  updateQuantity: (lineId, quantity) =>
    set((state) => ({
      items: state.items
        .map((i) =>
          i.lineId === lineId
            ? { ...i, quantity, totalPrice: i.unitPrice * quantity }
            : i
        )
        .filter((i) => i.quantity > 0),
    })),

  incrementQuantity: (lineId, delta) => {
    const item = get().items.find((i) => i.lineId === lineId);
    if (!item) return;
    get().updateQuantity(lineId, Math.min(99, item.quantity + delta));
  },

  setCustomer: (id, name) =>
    set({
      customerId: id,
      customerName: name,
      isGuest: id === null,
    }),

  setOrderType: (type) => set({ orderType: type }),

  setDiscount: (type, value) => set({ discountType: type, discountValue: value }),

  setFree: (isFree) => set({ isFree }),

  setFreeRecipient: (type, id, name) =>
    set({
      isFree: true,
      freeRecipientType: type,
      freeRecipientId: id,
      freeRecipientName: name,
    }),

  clearFree: () =>
    set({
      isFree: false,
      freeRecipientType: null,
      freeRecipientId: null,
      freeRecipientName: "",
    }),

  setNotes: (notes) => set({ notes }),

  setOnlineOrder: (localId) => set({ onlineOrderLocalId: localId }),

  setDeliveryZone: (zoneId) => set({ deliveryZoneId: zoneId }),

  setDeliveryPerson: (personId) => set({ deliveryPersonId: personId }),

  clearCart: () =>
    set({
      items: [],
      customerId: null,
      customerName: "زائر",
      isGuest: true,
      orderType: "counter",
      discountType: "none",
      discountValue: 0,
      isFree: false,
      freeRecipientType: null,
      freeRecipientId: null,
      freeRecipientName: "",
      notes: "",
      onlineOrderLocalId: null,
      deliveryZoneId: null,
      deliveryPersonId: null,
    }),

  subtotal: () => get().items.reduce((s, i) => s + i.totalPrice, 0),

  totals: () => {
    const taxRate = useSettingsStore.getState().taxRate;
    const { discountType, discountValue } = get();
    return computeTotals(get().subtotal(), discountType, discountValue, taxRate);
  },

  changeAmount: (paid) => paid - get().totals().total,

  // عدد الأصناف: المنتج الموزون = صنف واحد (مهما كان وزنه)، القطعة = كميتها
  itemCount: () =>
    get().items.reduce(
      (s, i) => s + (i.saleType === "weight" ? 1 : i.quantity),
      0
    ),
}));

// hook مشتق للإجماليات — يحسب بـ useMemo بدل إرجاع object من الـ selector
// (إرجاع object جديد من selector بيسبب infinite loop في useSyncExternalStore)
export function useCartTotals() {
  const subtotal = useCartStore((s) => s.subtotal());
  const discountType = useCartStore((s) => s.discountType);
  const discountValue = useCartStore((s) => s.discountValue);
  const taxRate = useSettingsStore((s) => s.taxRate);
  return useMemo(
    () => computeTotals(subtotal, discountType, discountValue, taxRate),
    [subtotal, discountType, discountValue, taxRate]
  );
}
