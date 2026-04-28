// web/cfdWebDisplayProvider.tsx
// In-memory CFD display state for the WebView shell. Mirrors the
// `CFDDisplayData` shape used by `CFDScreenRouter` so the same React tree
// runs unchanged in the WebView.
//
// Why a separate store (instead of reusing `useCFDClientStore`):
//   `useCFDClientStore` persists via MMKV through `@/lib/storage`, which
//   has native-only deps (`react-native-mmkv`). Rather than shimming MMKV
//   for web, we use a tiny in-memory zustand store here. Identical update
//   semantics, zero native deps.
//
// Data flow:
//   Host RN  --(injectJavaScript)-->  window.__cfdRecv(payload)
//                                        |
//                                        v
//                        applyPayload(payload) -> store.setState(...)
//                                        |
//                                        v
//                            CFDDisplayDataContext consumers re-render

import {
  CFDDisplayDataContext,
  type CFDDisplayData,
} from "@/contexts/CFDDisplayDataContext.base";
import type { CFDPayload, CFDScreenState } from "@/types/cfd.types";
import React, { useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

const initialState: CFDDisplayData = {
  connectionStatus: "connected",
  latency: null,
  screenState: "idle",
  serverName: null,
  customerName: null,
  customerPhone: null,
  orderNumber: null,
  orderType: null,
  tableName: null,
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
  layout: null,
  orderingPanelImages: { primary: [], secondary: [] },
  tipConfig: null,
  carouselImages: [],
  loyaltyPrompt: null,
  loyaltyResult: null,
  paymentMethod: null,
};

interface CFDWebDisplayStore extends CFDDisplayData {
  applyPayload: (payload: Partial<CFDPayload> & { screenState?: CFDScreenState }) => void;
  setScreenState: (state: CFDScreenState) => void;
  reset: () => void;
}

export const useCFDWebDisplayStore = create<CFDWebDisplayStore>()((set) => ({
  ...initialState,
  applyPayload: (payload) => {
    set((current) => ({
      // Carry forward existing values if the payload omits a field.
      ...current,
      screenState: payload.screenState ?? current.screenState,
      serverName: payload.serverName ?? current.serverName,
      customerName: payload.customerName ?? current.customerName,
      customerPhone: payload.customerPhone ?? current.customerPhone,
      orderNumber: payload.orderNumber ?? current.orderNumber,
      orderType: payload.orderType ?? current.orderType,
      tableName: payload.tableName ?? current.tableName,
      guestCount: payload.guestCount ?? current.guestCount,
      items: payload.items ?? current.items,
      subtotal: payload.subtotal ?? current.subtotal,
      subtotalCash: payload.subtotalCash ?? current.subtotalCash,
      subtotalCard: payload.subtotalCard ?? current.subtotalCard,
      discountAmount: payload.discountAmount ?? current.discountAmount,
      taxAmount: payload.taxAmount ?? current.taxAmount,
      taxCash: payload.taxCash ?? current.taxCash,
      taxCard: payload.taxCard ?? current.taxCard,
      tipAmount: payload.tipAmount ?? current.tipAmount,
      tipPercentage: payload.tipPercentage ?? current.tipPercentage,
      total: payload.total ?? current.total,
      totalCash: payload.totalCash ?? current.totalCash,
      totalCard: payload.totalCard ?? current.totalCard,
      savingsAmount: payload.savingsAmount ?? current.savingsAmount,
      outstandingTotal: payload.outstandingTotal ?? current.outstandingTotal,
      amountPaid: payload.amountPaid ?? current.amountPaid,
      branding: payload.branding ?? current.branding,
      layout: payload.layout ?? current.layout,
      orderingPanelImages:
        payload.orderingPanelImages ?? current.orderingPanelImages,
      tipConfig: payload.tipConfig ?? current.tipConfig,
      carouselImages: payload.carouselImages ?? current.carouselImages,
      loyaltyPrompt: payload.loyaltyPrompt ?? current.loyaltyPrompt,
      loyaltyResult: payload.loyaltyResult ?? current.loyaltyResult,
      paymentMethod: payload.paymentMethod ?? current.paymentMethod,
    }));
  },
  setScreenState: (state) => set({ screenState: state }),
  reset: () => set(initialState),
}));

/**
 * Web-only display provider that feeds `CFDDisplayDataContext` from the
 * in-memory store. Drop-in replacement for `CFDBuiltinDisplayProvider` /
 * `CFDExternalDisplayProvider` inside the WebView shell.
 */
export function CFDWebDisplayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = useCFDWebDisplayStore(
    useShallow((s) => ({
      connectionStatus: s.connectionStatus,
      latency: s.latency,
      screenState: s.screenState,
      serverName: s.serverName,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      orderNumber: s.orderNumber,
      orderType: s.orderType,
      tableName: s.tableName,
      guestCount: s.guestCount,
      items: s.items,
      subtotal: s.subtotal,
      subtotalCash: s.subtotalCash,
      subtotalCard: s.subtotalCard,
      discountAmount: s.discountAmount,
      taxAmount: s.taxAmount,
      taxCash: s.taxCash,
      taxCard: s.taxCard,
      tipAmount: s.tipAmount,
      tipPercentage: s.tipPercentage,
      total: s.total,
      totalCash: s.totalCash,
      totalCard: s.totalCard,
      savingsAmount: s.savingsAmount,
      outstandingTotal: s.outstandingTotal,
      amountPaid: s.amountPaid,
      branding: s.branding,
      layout: s.layout,
      orderingPanelImages: s.orderingPanelImages,
      tipConfig: s.tipConfig,
      carouselImages: s.carouselImages,
      loyaltyPrompt: s.loyaltyPrompt,
      loyaltyResult: s.loyaltyResult,
      paymentMethod: s.paymentMethod,
    }))
  );

  const value = useMemo<CFDDisplayData>(() => store, [store]);

  return (
    <CFDDisplayDataContext.Provider value={value}>
      {children}
    </CFDDisplayDataContext.Provider>
  );
}
