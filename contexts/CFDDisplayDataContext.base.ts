// contexts/CFDDisplayDataContext.base.ts
// Tiny module exporting just the React context + types used by every CFD
// display surface (off-device WS client, on-device built-in display, on-device
// WebView). Kept separate from the *.tsx file because that file pulls in
// `useCFDBuiltinStore` / `useCFDClientStore`, whose transitive deps include
// `lib/storage.ts` (MMKV with encryptionKey) — which fails to load in a
// react-native-web build.
//
// The web bundle imports only this base file. Native code can keep importing
// from `contexts/CFDDisplayDataContext` (which re-exports everything here).

import type {
  CFDBranding,
  CFDCartItem,
  CFDPayload,
  CFDScreenState,
} from "@/types/cfd.types";
import { createContext, useContext } from "react";
import { useStore, type StoreApi } from "zustand";

export interface CFDDisplayData {
  // Connection
  connectionStatus: "disconnected" | "connecting" | "connected";
  latency: number | null;

  // Display state
  screenState: CFDScreenState;
  serverName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  orderNumber: string | null;
  orderType: string | null;
  tableName: string | null;
  guestCount: number | null;
  items: CFDCartItem[];

  // Totals (all cents)
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

  // Branding & config
  branding: CFDBranding | null;
  layout: CFDPayload["layout"] | null;
  orderingPanelImages: NonNullable<CFDPayload["orderingPanelImages"]>;
  tipConfig: CFDPayload["tipConfig"] | null;
  carouselImages: string[];

  // Loyalty
  loyaltyPrompt: CFDPayload["loyaltyPrompt"] | null;
  loyaltyResult: CFDPayload["loyaltyResult"] | null;

  // Payment
  paymentMethod: "cash" | "card" | "manual" | null;

  // Loyalty program availability (gates the "Join Loyalty" CTA on result screen)
  merchantHasLoyalty: boolean;

  // Theme — propagated from POS so the CFD matches the operator's chosen mode.
  themeMode: "light" | "dark";
}

export const CFDDisplayDataContext = createContext<CFDDisplayData | null>(null);

export function useCFDDisplayData(): CFDDisplayData {
  const context = useContext(CFDDisplayDataContext);
  if (!context) {
    throw new Error(
      "useCFDDisplayData must be used within a CFDExternalDisplayProvider, CFDBuiltinDisplayProvider, or CFDWebDisplayProvider"
    );
  }
  return context;
}

// Optional Zustand store API exposed by providers that want field-level
// subscriptions. When provided, `useCFDDisplayField(key)` subscribes only to
// `state[key]`, so consumers re-render only when that field actually changes.
// Providers that don't supply it (legacy fallback path) still work via
// `useCFDDisplayData()` — but every consumer re-renders on any field change.
export type CFDDisplayStoreApi = StoreApi<CFDDisplayData>;
export const CFDDisplayStoreContext =
  createContext<CFDDisplayStoreApi | null>(null);

/**
 * Subscribe to a single field of the CFD display data without re-rendering
 * on unrelated changes. Used by interactive screens (TipSelectionScreen,
 * LoyaltyPromptScreen) where keystroke responsiveness matters and the host
 * is pushing payloads that touch other fields.
 *
 * Conditional hook: the branch is determined by which provider wraps the
 * subtree (CFDDisplayStoreContext present or not). That presence is stable
 * for any given mounted component, so React's rules-of-hooks ordering is
 * preserved per-component-instance even though the hook count differs
 * across provider variants.
 */
export function useCFDDisplayField<K extends keyof CFDDisplayData>(
  key: K
): CFDDisplayData[K] {
  const storeApi = useContext(CFDDisplayStoreContext);
  const fullData = useContext(CFDDisplayDataContext);
  if (storeApi) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useStore(storeApi, (s) => s[key]);
  }
  if (!fullData) {
    throw new Error(
      "useCFDDisplayField must be used within a CFD display provider"
    );
  }
  return fullData[key];
}
