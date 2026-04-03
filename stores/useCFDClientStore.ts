// stores/useCFDClientStore.ts
// CFD client-mode Zustand store (when this device acts as a customer-facing display)
import { mmkvStorage } from '@/lib/storage'
import type {
  CFDPairingData,
  CFDPayload,
  CFDScreenState
} from '@/types/cfd.types'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface CFDClientStore {
  // Connection
  isPaired: boolean
  connection: CFDPairingData | null
  connectionStatus: 'disconnected' | 'connecting' | 'connected'
  latency: number | null

  // Display state (from POS)
  screenState: CFDScreenState
  serverName: string | null
  customerName: string | null
  customerPhone: string | null
  orderNumber: string | null
  orderType: string | null
  tableName: string | null
  guestCount: number | null
  items: CFDPayload['items']

  // Totals
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
  branding: CFDPayload['branding'] | null
  layout: CFDPayload['layout'] | null
  orderingPanelImages: NonNullable<CFDPayload['orderingPanelImages']>
  tipConfig: CFDPayload['tipConfig'] | null
  carouselImages: string[]
  loyaltyPrompt: CFDPayload['loyaltyPrompt'] | null
  loyaltyResult: CFDPayload['loyaltyResult'] | null
  paymentMethod: 'cash' | 'card' | null

  // Actions
  setPairing: (data: CFDPairingData) => void
  clearPairing: () => void
  setConnectionStatus: (
    status: 'disconnected' | 'connecting' | 'connected'
  ) => void
  setLatency: (ms: number) => void
  updateFromPayload: (payload: CFDPayload) => void
}

export const useCFDClientStore = create<CFDClientStore>()(
  persist(
    (set, get) => ({
      // Initial state
      isPaired: false,
      connection: null,
      connectionStatus: 'disconnected',
      latency: null,

      screenState: 'pairing',
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

      // Actions
      setPairing: data =>
        set({
          isPaired: true,
          connection: data,
          screenState: 'idle'
        }),

      clearPairing: () =>
        set({
          isPaired: false,
          connection: null,
          connectionStatus: 'disconnected',
          screenState: 'pairing',
          items: [],
          branding: null
        }),

      setConnectionStatus: status => set({ connectionStatus: status }),

      setLatency: ms => set({ latency: ms }),

      updateFromPayload: payload =>
        set({
          screenState: payload.screenState,
          serverName: payload.serverName ?? null,
          customerName: payload.customerName ?? null,
          customerPhone: payload.customerPhone ?? null,
          orderNumber: payload.orderNumber,
          orderType: payload.orderType,
          tableName: payload.tableName ?? null,
          guestCount: payload.guestCount,
          items: payload.items,

          subtotal: payload.subtotal,
          subtotalCash: payload.subtotalCash,
          subtotalCard: payload.subtotalCard,

          discountAmount: payload.discountAmount,

          taxAmount: payload.taxAmount,
          taxCash: payload.taxCash,
          taxCard: payload.taxCard,

          tipAmount: payload.tipAmount,
          tipPercentage: payload.tipPercentage,

          total: payload.total,
          totalCash: payload.totalCash,
          totalCard: payload.totalCard,

          savingsAmount: payload.savingsAmount,

          outstandingTotal: payload.outstandingTotal,
          amountPaid: payload.amountPaid,
          branding: payload.branding ?? get().branding,
          layout: payload.layout ?? get().layout,
          orderingPanelImages:
            payload.orderingPanelImages ?? get().orderingPanelImages,
          tipConfig: payload.tipConfig ?? null,
          carouselImages: payload.carouselImages ?? get().carouselImages,
          loyaltyPrompt: payload.loyaltyPrompt ?? null,
          loyaltyResult: payload.loyaltyResult ?? null,
          paymentMethod: payload.paymentMethod ?? null
        })
    }),
    {
      name: 'cfd-client-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: state => ({
        isPaired: state.isPaired,
        connection: state.connection,
        branding: state.branding
      })
    }
  )
)
