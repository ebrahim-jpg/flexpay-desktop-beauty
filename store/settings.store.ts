"use client";

import { create } from "zustand";
import { ipc, isElectron } from "@/hooks/useIPC";
import {
  getBusinessDay,
  getBusinessDayRange,
} from "@/lib/business-day";
import {
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_NATIONALITIES,
  type PaymentMethod,
  type SettingsDTO,
  type UpdateSettingsInput,
} from "@/shared/settings";

interface SettingsState extends SettingsDTO {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  applySettings: (dto: SettingsDTO) => void;
  updateSettings: (partial: UpdateSettingsInput) => Promise<void>;
  getEnabledPaymentMethods: () => PaymentMethod[];
  formatCurrency: (amount: number) => string;
  getBusinessDay: (date?: Date) => Date;
  getBusinessDayRange: (date?: Date) => { from: Date; to: Date };
}

const DEFAULT_SETTINGS: SettingsDTO = {
  shopName: "محلي",
  shopLogo: null,
  country: "مصر",
  currency: "جنيه مصري",
  currencySymbol: "ج.م",
  taxRate: 0,
  businessDayStart: 0,
  nationalities: [...DEFAULT_NATIONALITIES],
  paymentMethods: [...DEFAULT_PAYMENT_METHODS],
  deliveryZones: [],
  lowStockThreshold: 10,
  absenceAlertDays: 14,
  receiptHeader: "",
  receiptFooter: "شكراً لزيارتكم",
  printerName: null,
  kitchenPrinterName: null,
  shopCode: null,
  secretKeyTail: null,
  syncServerUrl: "https://api.yourplatform.com",
  syncEnabled: true,
  autoHideOutOfStock: true,
  autoClockoutHours: 0,
  attendanceWarnHours: 0,
  bookingAlertMinutes: 60,
  updatedAt: null,
};

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,

  // يُستدعى عند تسجيل الدخول
  loadSettings: async () => {
    if (!isElectron()) {
      set({ isLoaded: true });
      return;
    }
    const dto = await ipc.invoke("settings:get");
    set({ ...dto, isLoaded: true });
  },

  applySettings: (dto) => set({ ...dto }),

  updateSettings: async (partial) => {
    const dto = await ipc.invoke("settings:update", partial);
    set({ ...dto });
  },

  getEnabledPaymentMethods: () =>
    get().paymentMethods.filter((m) => m.enabled),

  // "125.50 ج.م" — العملة من الإعدادات، لا hardcoded
  formatCurrency: (amount) => {
    const symbol = get().currencySymbol || "ج.م";
    const formatted = new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
    return `${formatted} ${symbol}`;
  },

  getBusinessDay: (date = new Date()) =>
    getBusinessDay(date, get().businessDayStart),

  getBusinessDayRange: (date = new Date()) =>
    getBusinessDayRange(getBusinessDay(date, get().businessDayStart), get().businessDayStart),
}));
