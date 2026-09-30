"use client";

import { create } from "zustand";

// حالة واجهة الكاشير المشتركة (عشان الاختصارات تقدر تفتح الدفع من بره OrderSummary)
interface PosUiState {
  checkoutOpen: boolean;
  openCheckout: () => void;
  closeCheckout: () => void;
  setCheckoutOpen: (open: boolean) => void;
}

export const usePosUiStore = create<PosUiState>()((set) => ({
  checkoutOpen: false,
  openCheckout: () => set({ checkoutOpen: true }),
  closeCheckout: () => set({ checkoutOpen: false }),
  setCheckoutOpen: (open) => set({ checkoutOpen: open }),
}));

// معرّفات حقول البحث — يستخدمها هوك الاختصارات للتركيز
export const POS_PRODUCT_SEARCH_ID = "pos-product-search";
export const POS_CUSTOMER_SEARCH_ID = "pos-customer-search";
