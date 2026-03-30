// contexts/CFDDisplayDataContext.tsx
// Abstraction layer: both external CFD tablets and built-in secondary displays
// read from the same interface via useCFDDisplayData().
import { useCFDBuiltinStore } from "@/stores/useCFDBuiltinStore";
import { useCFDClientStore } from "@/stores/useCFDClientStore";
import type {
  CFDCartItem,
  CFDBranding,
  CFDPayload,
  CFDScreenState,
} from "@/types/cfd.types";
import React, { createContext, useContext } from "react";

export interface CFDDisplayData {
  // Connection
  connectionStatus: "disconnected" | "connecting" | "connected";
  latency: number | null;

  // Display state
  screenState: CFDScreenState;
  serverName: string | null;
  customerName: string | null;
  orderNumber: string | null;
  orderType: string | null;
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
  tipConfig: CFDPayload["tipConfig"] | null;
  carouselImages: string[];

  // Loyalty
  loyaltyPrompt: CFDPayload["loyaltyPrompt"] | null;
  loyaltyResult: CFDPayload["loyaltyResult"] | null;
}

const CFDDisplayDataContext = createContext<CFDDisplayData | null>(null);

export function useCFDDisplayData(): CFDDisplayData {
  const context = useContext(CFDDisplayDataContext);
  if (!context) {
    throw new Error(
      "useCFDDisplayData must be used within a CFDExternalDisplayProvider or CFDBuiltinDisplayProvider",
    );
  }
  return context;
}

/** For external CFD tablets — reads from useCFDClientStore (WebSocket-driven) */
export function CFDExternalDisplayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = useCFDClientStore();

  const data: CFDDisplayData = {
    connectionStatus: store.connectionStatus,
    latency: store.latency,
    screenState: store.screenState,
    serverName: store.serverName,
    customerName: store.customerName ?? null,
    orderNumber: store.orderNumber,
    orderType: store.orderType,
    guestCount: store.guestCount,
    items: store.items,
    subtotal: store.subtotal,
    subtotalCash: store.subtotalCash,
    subtotalCard: store.subtotalCard,
    discountAmount: store.discountAmount,
    taxAmount: store.taxAmount,
    taxCash: store.taxCash,
    taxCard: store.taxCard,
    tipAmount: store.tipAmount,
    tipPercentage: store.tipPercentage,
    total: store.total,
    totalCash: store.totalCash,
    totalCard: store.totalCard,
    savingsAmount: store.savingsAmount,
    outstandingTotal: store.outstandingTotal,
    amountPaid: store.amountPaid,
    branding: store.branding ?? null,
    tipConfig: store.tipConfig,
    carouselImages: store.carouselImages,
    loyaltyPrompt: store.loyaltyPrompt ?? null,
    loyaltyResult: store.loyaltyResult ?? null,
  };

  return (
    <CFDDisplayDataContext.Provider value={data}>
      {children}
    </CFDDisplayDataContext.Provider>
  );
}

/** For built-in secondary display — reads from useCFDBuiltinStore (Zustand direct, same JS runtime) */
export function CFDBuiltinDisplayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = useCFDBuiltinStore();

  const data: CFDDisplayData = {
    connectionStatus: "connected", // Always connected for built-in
    latency: null, // No network latency
    screenState: store.screenState,
    serverName: store.serverName,
    customerName: store.customerName ?? null,
    orderNumber: store.orderNumber,
    orderType: store.orderType,
    guestCount: store.guestCount,
    items: store.items,
    subtotal: store.subtotal,
    subtotalCash: store.subtotalCash,
    subtotalCard: store.subtotalCard,
    discountAmount: store.discountAmount,
    taxAmount: store.taxAmount,
    taxCash: store.taxCash,
    taxCard: store.taxCard,
    tipAmount: store.tipAmount,
    tipPercentage: store.tipPercentage,
    total: store.total,
    totalCash: store.totalCash,
    totalCard: store.totalCard,
    savingsAmount: store.savingsAmount,
    outstandingTotal: store.outstandingTotal,
    amountPaid: store.amountPaid,
    branding: store.branding,
    tipConfig: store.tipConfig,
    carouselImages: store.carouselImages,
    loyaltyPrompt: null,
    loyaltyResult: null,
  };

  return (
    <CFDDisplayDataContext.Provider value={data}>
      {children}
    </CFDDisplayDataContext.Provider>
  );
}
