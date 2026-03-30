// stores/useCFDBuiltinStore.ts
// Zustand store for built-in secondary display (ReactRootView on Presentation).
// POS writes via .getState().update(), secondary display reads reactively.
// No persistence — ephemeral, reset on app restart.
import type {
  CFDCartItem,
  CFDBranding,
  CFDPayload,
  CFDScreenState,
} from "@/types/cfd.types";
import { create } from "zustand";

interface CFDBuiltinState {
  screenState: CFDScreenState;
  serverName: string | null;
  customerName: string | null;
  orderNumber: string | null;
  orderType: string | null;
  guestCount: number | null;
  items: CFDCartItem[];

  subtotal: number;
  subtotalCash: number;
  subtotalCard: number;
  discountAmount: number;
  taxAmount: number;
  taxCash: number;
  taxCard: number;
  tipAmount: number;
  tipPercentage: number | null;
  total: number;
  totalCash: number;
  totalCard: number;
  savingsAmount: number;
  outstandingTotal: number;
  amountPaid: number;

  branding: CFDBranding | null;
  tipConfig: CFDPayload["tipConfig"] | null;
  carouselImages: string[];

  // Actions
  update: (data: Partial<Omit<CFDBuiltinState, "update" | "reset">>) => void;
  reset: () => void;
}

const initialState: Omit<CFDBuiltinState, "update" | "reset"> = {
  screenState: "idle",
  serverName: null,
  customerName: null,
  orderNumber: null,
  orderType: null,
  guestCount: null,
  items: [],
  subtotal: 0,
  subtotalCash: 0,
  subtotalCard: 0,
  discountAmount: 0,
  taxAmount: 0,
  taxCash: 0,
  taxCard: 0,
  tipAmount: 0,
  tipPercentage: null,
  total: 0,
  totalCash: 0,
  totalCard: 0,
  savingsAmount: 0,
  outstandingTotal: 0,
  amountPaid: 0,
  branding: null,
  tipConfig: null,
  carouselImages: [],
};

export const useCFDBuiltinStore = create<CFDBuiltinState>()((set) => ({
  ...initialState,
  update: (data) => set(data),
  reset: () => set(initialState),
}));
