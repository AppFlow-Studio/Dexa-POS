// stores/useCFDBuiltinStore.ts
// Zustand store for built-in secondary display (ReactRootView on Presentation).
// POS writes via .getState().update(), secondary display reads reactively.
// No persistence — ephemeral, reset on app restart.
//
// `update()` also mirrors every write to the CFD WebView bridge. The bridge
// is a no-op when no WebView is registered (legacy ReactSurface mode), so
// this is free. When the WebView is mounted, every screen-transition site
// in CFDProvider — even the ones that don't go through the debounced sync
// effect — automatically reaches the WebView.
import { pushPayload as pushCFDWebViewPayload } from '@/services/cfd/CFDWebViewBridge'
import type {
  CFDBranding,
  CFDCartItem,
  CFDPayload,
  CFDScreenState
} from '@/types/cfd.types'
import { create } from 'zustand'

interface CFDBuiltinState {
  screenState: CFDScreenState
  serverName: string | null
  customerName: string | null
  customerPhone: string | null
  orderNumber: string | null
  orderType: string | null
  tableName: string | null
  guestCount: number | null
  items: CFDCartItem[]

  subtotal: number
  subtotalCash: number
  subtotalCard: number
  discountAmount: number
  serviceCharge: number
  serviceChargeName: string | null
  serviceChargeRate: number | null
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

  branding: CFDBranding | null
  layout: CFDPayload['layout'] | null
  orderingPanelImages: NonNullable<CFDPayload['orderingPanelImages']>
  tipConfig: CFDPayload['tipConfig'] | null
  carouselImages: string[]
  paymentMethod: 'cash' | 'card' | 'manual' | null
  loyaltyPrompt: CFDPayload['loyaltyPrompt'] | null
  loyaltyResult: CFDPayload['loyaltyResult'] | null
  merchantHasLoyalty: boolean
  pricingDisplayMode: 'dual' | 'card_only' | 'cash_only'
  cfdUiScaleOverride: number | null
  themeMode: 'light' | 'dark'

  // Actions
  update: (data: Partial<Omit<CFDBuiltinState, 'update' | 'reset'>>) => void
  reset: () => void
}

const initialState: Omit<CFDBuiltinState, 'update' | 'reset'> = {
  screenState: 'idle',
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
  serviceCharge: 0,
  serviceChargeName: null,
  serviceChargeRate: null,
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
  paymentMethod: null,
  loyaltyPrompt: null,
  loyaltyResult: null,
  merchantHasLoyalty: false,
  pricingDisplayMode: 'dual',
  cfdUiScaleOverride: null,
  themeMode: 'dark'
}

export const useCFDBuiltinStore = create<CFDBuiltinState>()((set, get) => ({
  ...initialState,
  update: data => {
    if ('loyaltyResult' in data && data.loyaltyResult === null) {
      console.warn('[CFDBuiltinStore] loyaltyResult being set to null')
    }
    // Skip no-op updates to prevent unnecessary re-renders on the secondary display
    const current = get()
    const hasChange = Object.entries(data).some(
      ([key, value]) => current[key as keyof typeof current] !== value
    )
    if (!hasChange) return
    set(data)
    // Mirror to WebView. Silent no-op if no WebView mounted.
    try {
      pushCFDWebViewPayload(data as Record<string, unknown>)
    } catch (err) {
      console.error('[CFDBuiltinStore] WebView mirror failed:', err)
    }
  },
  reset: () => set(initialState)
}))
