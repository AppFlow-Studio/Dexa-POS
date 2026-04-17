// contexts/CFDDisplayDataContext.tsx
// Abstraction layer: both external CFD tablets and built-in secondary displays
// read from the same interface via useCFDDisplayData().
import { useCFDBuiltinStore } from '@/stores/useCFDBuiltinStore'
import { useCFDClientStore } from '@/stores/useCFDClientStore'
import type {
  CFDBranding,
  CFDCartItem,
  CFDPayload,
  CFDScreenState
} from '@/types/cfd.types'
import React, { createContext, useContext, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface CFDDisplayData {
  // Connection
  connectionStatus: 'disconnected' | 'connecting' | 'connected'
  latency: number | null

  // Display state
  screenState: CFDScreenState
  serverName: string | null
  customerName: string | null
  customerPhone: string | null
  orderNumber: string | null
  orderType: string | null
  tableName: string | null
  guestCount: number | null
  items: CFDCartItem[]

  // Totals (all cents)
  subtotal: number
  subtotalCash: number
  subtotalCard: number
  discountAmount: number
  taxAmount: number
  taxCash: number
  taxCard: number
  tipAmount: number
  tipPercentage: number | null
  total: number
  totalCash: number
  totalCard: number
  savingsAmount: number
  outstandingTotal: number
  amountPaid: number

  // Branding & config
  branding: CFDBranding | null
  layout: CFDPayload['layout'] | null
  orderingPanelImages: NonNullable<CFDPayload['orderingPanelImages']>
  tipConfig: CFDPayload['tipConfig'] | null
  carouselImages: string[]

  // Loyalty
  loyaltyPrompt: CFDPayload['loyaltyPrompt'] | null
  loyaltyResult: CFDPayload['loyaltyResult'] | null

  // Payment
  paymentMethod: 'cash' | 'card' | 'manual' | null
}

const CFDDisplayDataContext = createContext<CFDDisplayData | null>(null)

export function useCFDDisplayData (): CFDDisplayData {
  const context = useContext(CFDDisplayDataContext)
  if (!context) {
    throw new Error(
      'useCFDDisplayData must be used within a CFDExternalDisplayProvider or CFDBuiltinDisplayProvider'
    )
  }
  return context
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
    paymentMethod: s.paymentMethod
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
    paymentMethod: store.paymentMethod ?? null
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
    paymentMethod: s.paymentMethod
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
    paymentMethod: store.paymentMethod ?? null
  }), [store])

  return (
    <CFDDisplayDataContext.Provider value={data}>
      {children}
    </CFDDisplayDataContext.Provider>
  )
}
