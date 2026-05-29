// contexts/CFDDisplayDataContext.tsx
// Abstraction layer: both external CFD tablets and built-in secondary displays
// read from the same interface via useCFDDisplayData().
//
// The context constant + types live in `./CFDDisplayDataContext.base.ts` so
// the WebView's react-native-web bundle can reuse them without dragging in
// the Zustand stores below (which transitively pull MMKV via lib/storage).
import { useCFDBuiltinStore } from '@/stores/useCFDBuiltinStore'
import { useCFDClientStore } from '@/stores/useCFDClientStore'
import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  CFDDisplayDataContext,
  useCFDDisplayData,
  type CFDDisplayData
} from './CFDDisplayDataContext.base'

export {
  CFDDisplayDataContext,
  useCFDDisplayData,
  type CFDDisplayData
}

/** For external CFD tablets — reads from useCFDClientStore (WebSocket-driven) */
export function CFDExternalDisplayProvider ({
  children
}: {
  children: React.ReactNode
}) {
  const store = useCFDClientStore(useShallow(s => ({
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
    merchantHasLoyalty: s.merchantHasLoyalty,
    pricingDisplayMode: s.pricingDisplayMode,
    themeMode: s.themeMode
  })))

  const data = useMemo<CFDDisplayData>(() => ({
    connectionStatus: store.connectionStatus,
    latency: store.latency,
    screenState: store.screenState,
    serverName: store.serverName,
    customerName: store.customerName ?? null,
    customerPhone: store.customerPhone ?? null,
    orderNumber: store.orderNumber,
    orderType: store.orderType,
    tableName: store.tableName ?? null,
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
    layout: store.layout ?? null,
    orderingPanelImages: store.orderingPanelImages,
    tipConfig: store.tipConfig,
    carouselImages: store.carouselImages,
    loyaltyPrompt: store.loyaltyPrompt ?? null,
    loyaltyResult: store.loyaltyResult ?? null,
    paymentMethod: store.paymentMethod ?? null,
    merchantHasLoyalty: store.merchantHasLoyalty,
    pricingDisplayMode: store.pricingDisplayMode ?? 'dual',
    themeMode: store.themeMode
  }), [store])

  return (
    <CFDDisplayDataContext.Provider value={data}>
      {children}
    </CFDDisplayDataContext.Provider>
  )
}

/** For built-in secondary display — reads from useCFDBuiltinStore (Zustand direct, same JS runtime) */
export function CFDBuiltinDisplayProvider ({
  children
}: {
  children: React.ReactNode
}) {
  const store = useCFDBuiltinStore(useShallow(s => ({
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
    merchantHasLoyalty: s.merchantHasLoyalty,
    pricingDisplayMode: s.pricingDisplayMode,
    themeMode: s.themeMode
  })))

  const data = useMemo<CFDDisplayData>(() => ({
    connectionStatus: 'connected',
    latency: null,
    screenState: store.screenState,
    serverName: store.serverName,
    customerName: store.customerName ?? null,
    customerPhone: store.customerPhone ?? null,
    orderNumber: store.orderNumber,
    orderType: store.orderType,
    tableName: store.tableName ?? null,
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
    layout: store.layout ?? null,
    orderingPanelImages: store.orderingPanelImages,
    tipConfig: store.tipConfig,
    carouselImages: store.carouselImages,
    loyaltyPrompt: store.loyaltyPrompt ?? null,
    loyaltyResult: store.loyaltyResult ?? null,
    paymentMethod: store.paymentMethod ?? null,
    merchantHasLoyalty: store.merchantHasLoyalty,
    pricingDisplayMode: store.pricingDisplayMode ?? 'dual',
    themeMode: store.themeMode
  }), [store])

  return (
    <CFDDisplayDataContext.Provider value={data}>
      {children}
    </CFDDisplayDataContext.Provider>
  )
}
