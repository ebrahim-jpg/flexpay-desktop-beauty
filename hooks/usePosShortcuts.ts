"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCartStore } from "@/store/cart.store";
import { useIPC } from "@/hooks/useIPC";
import {
  usePosUiStore,
  POS_PRODUCT_SEARCH_ID,
  POS_CUSTOMER_SEARCH_ID,
} from "@/store/pos-ui.store";
import type { ProductDTO } from "@/shared/products";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

function focusById(id: string): void {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement) {
    el.focus();
    el.select();
  }
}

/**
 * اختصارات لوحة المفاتيح لصفحة الكاشير:
 *  أزرار النظام المحجوزة (مينفعش تتربط بمنتج):
 *   - مسافة            → التركيز على بحث المنتجات
 *   - Ctrl/⌘ + مسافة   → التركيز على بحث العميل
 *   - Enter            → فتح شاشة الحساب
 *   - Esc              → إغلاق شاشة الحساب
 *  اختصارات المستخدم (حرف/رقم واحد) → تضيف منتج مربوط فوراً.
 */
export function usePosShortcuts(products: ProductDTO[]): void {
  const { invoke } = useIPC();
  const productsRef = useRef<ProductDTO[]>(products);
  const shortcutsRef = useRef<Map<string, number>>(new Map());

  // خلّي المنتجات محدّثة دايماً للـ listener من غير ما نعيد ربطه
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // حمّل اختصارات المستخدم الحالي مرة واحدة
  useEffect(() => {
    void invoke("profile:getShortcuts")
      .then((list) => {
        shortcutsRef.current = new Map(list.map((s) => [s.key, s.product_id]));
      })
      .catch(() => undefined);
  }, [invoke]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // وهي شاشة الدفع مفتوحة، سيب التحكم ليها بالكامل
      if (usePosUiStore.getState().checkoutOpen) return;

      const typing = isTypingTarget(e.target);

      // Ctrl/⌘ + Space → بحث العميل
      if (e.code === "Space" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        focusById(POS_CUSTOMER_SEARCH_ID);
        return;
      }

      // Space → بحث المنتجات (لو مش بيكتب)
      if (e.code === "Space" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        focusById(POS_PRODUCT_SEARCH_ID);
        return;
      }

      // Enter → الحساب
      if (e.key === "Enter" && !typing) {
        const cart = useCartStore.getState();
        const blocked = cart.orderType === "delivery" && cart.isGuest;
        if (cart.items.length > 0 && !blocked) {
          e.preventDefault();
          usePosUiStore.getState().openCheckout();
        }
        return;
      }

      // Esc → إغلاق الحساب
      if (e.key === "Escape" && usePosUiStore.getState().checkoutOpen) {
        usePosUiStore.getState().closeCheckout();
        return;
      }

      // اختصار منتج: حرف/رقم واحد، بدون modifiers، ومش بيكتب في حقل
      if (
        !typing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.length === 1 &&
        /^[a-z0-9]$/i.test(e.key)
      ) {
        const pid = shortcutsRef.current.get(e.key.toLowerCase());
        if (pid != null) {
          const product = productsRef.current.find((p) => p.id === pid);
          if (product) {
            e.preventDefault();
            useCartStore.getState().addItem(product, [], "", 1);
            toast.success(`+ ${product.name}`, { duration: 700 });
          }
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      usePosUiStore.getState().closeCheckout();
    };
  }, []);
}
