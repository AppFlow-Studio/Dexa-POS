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
