import { applyOptimisticPatch } from '@/hooks/orders/applyOptimisticPatch'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import {
  setCFDLoyaltyHandlers,
  triggerCFDLoyaltyJoin,
  triggerCFDLoyaltySkip,
  triggerCFDPhoneSubmit
} from '@/lib/cfdLoyaltyTriggers'
import { isCFDSalesPathname } from '@/lib/cfdRouting'
import { isValidUUID } from '@/lib/offlineIdRegistry'
import { DejavooSpinAPI } from '@/lib/payments/dejavoo-spin-api'
import { toastService } from '@/lib/toastService'
import { useColorScheme } from '@/lib/useColorScheme'
import { detectNativeHardware } from '@/native/HardwareDetection'
import {
  dismissSecondaryDisplay,
  showSecondaryDisplay
} from '@/native/SecondaryDisplay'
import { CFDController } from '@/services/cfd/CFDController'
import {
  setActionHandler as setCFDWebViewActionHandler,
  setSnapshotProvider as setCFDWebViewSnapshotProvider
} from '@/services/cfd/CFDWebViewBridge'
import { getCachedCapabilities } from '@/services/hardware/deviceDetection'
import {
  checkMerchantHasLoyalty,
  earnLoyaltyForOrder,
  findOrCreateCustomerByPhone,
  type LoyaltyEarnResult
} from '@/services/loyalty/loyaltyService'
import { queueFailedOperation } from '@/services/offlineSyncInit'
import { queueOperation } from '@/services/offlineSyncService'
import { getSharedCastlesService } from '@/services/terminals/castles-service'
import { getOrCreateCounter } from '@/services/terminals/castles-txn-counter'
import { getSharedValorService } from '@/services/terminals/valor-service'
import { getOrCreateValorCounter } from '@/services/terminals/valor-txn-counter'
import { adjustTips, type TipAdjustment } from '@/services/tipAdjustService'
import {
  getOrderTypeDisplay,
  resolveTableDisplayName
} from '@/lib/orderDisplay'
import { useActiveOrderTotals } from '@/stores/selectors/orderSelectors'
import { useCFDBuiltinStore } from '@/stores/useCFDBuiltinStore'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useLoyaltyStore } from '@/stores/useLoyaltyStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { usePreviousOrdersStore } from '@/stores/usePreviousOrdersStore'
import { useSeatingStore } from '@/stores/useSeatingStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTipAdjustStore } from '@/stores/useTipAdjustStore'
import { CASTLES_DEFAULT_PORT } from '@/types/castles'
import { VALOR_DEFAULT_PORT } from '@/types/valor'
import type {
  CFDCartItem,
  CFDPairingData,
  CFDPayload,
  CFDScreenState,
  CFDTipResponse
} from '@/types/cfd.types'
import { usePathname } from 'expo-router'
import { debounce } from 'lodash'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

const DEBUG = __DEV__
const ORDER_PROCESSING_IDLE_MS = 60 * 1000

// Re-export the loyalty trigger helpers so any existing importer of
// `@/contexts/CFDProvider` keeps working. Real implementation lives in
// `@/lib/cfdLoyaltyTriggers` so `CFDScreenRouter` (and the WebView web
// bundle) can depend on it without pulling the rest of CFDProvider's
// native graph.
export { triggerCFDLoyaltyJoin, triggerCFDLoyaltySkip, triggerCFDPhoneSubmit }

function Log (msg: string) {
  if (DEBUG) console.log(msg)
}

function logLoyaltyTrace (stage: string, details?: Record<string, unknown>) {
  if (!DEBUG) return
  if (details) {
    console.log('[CFD Loyalty Trace]', stage, details)
    return
  }
  console.log('[CFD Loyalty Trace]', stage)
}

export type CFDServerStatus =
  | 'initializing' // Setting up, not ready yet
  | 'ready' // Server running, waiting for connections
  | 'connected' // At least one CFD connected
  | 'error' // Failed to start
  | 'disabled' // No station/location selected

interface CFDContextType {
  serverStatus: CFDServerStatus
  isServerReady: boolean
  isConnected: boolean
  clientCount: number
  connectedClientIds: string[]
  serverError: string | null
  pairingData: CFDPairingData | null
  serverInfo: { ip: string; port: number } | null
  tipResponse: CFDTipResponse | null

  showTipSelection: (
    baseAmount?: number,
    presetPercentages?: number[],
    paymentMethod?: 'cash' | 'card' | 'manual'
  ) => void
  updateTip: (amount: number, percentage: number | null) => void
  setBaseAmount: (amount: number | null) => void
  setScreenState: (state: CFDScreenState | null) => void
  clearTipResponse: () => void
  showPayment: (paymentMethod?: 'cash' | 'card' | 'manual') => void
  showProcessing: (
    paymentMethod?: 'cash' | 'card' | 'manual',
    tipAmountOverride?: number
  ) => void
  showApproved: () => void
  showDeclined: () => void
  showIdle: () => void
  showLoyaltyPrompt: () => void
  showLoyaltyConfirmation: (
    result: LoyaltyEarnResult[],
    customerName?: string
  ) => void
  disconnectClient: (clientId: string) => void
  refreshCarouselImages: () => Promise<void>
  refreshOrderingPanelImages: () => Promise<void>
  markOrderProcessingActivity: () => void
  activeScreenState: CFDScreenState | null
}

const CFDContext = createContext<CFDContextType | null>(null)
const CFDOrderProcessingActivityContext = createContext<() => void>(() => {})

function areStringArraysEqual (a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function areOrderingPanelImagesEqual (
  a: NonNullable<CFDPayload['orderingPanelImages']>,
  b: NonNullable<CFDPayload['orderingPanelImages']>
): boolean {
  return (
    areStringArraysEqual(a.primary, b.primary) &&
    areStringArraysEqual(a.secondary, b.secondary)
  )
}

const noopCFDValue: CFDContextType = {
  serverStatus: 'disabled',
  isServerReady: false,
  isConnected: false,
  clientCount: 0,
  connectedClientIds: [],
  serverError: null,
  pairingData: null,
  serverInfo: null,
  tipResponse: null,
  showTipSelection: (
    _baseAmount?: number,
    _presetPercentages?: number[],
    _paymentMethod?: 'cash' | 'card' | 'manual'
  ) => {},
  updateTip: () => {},
  setBaseAmount: () => {},
  setScreenState: () => {},
  clearTipResponse: () => {},
  showPayment: (_paymentMethod?: 'cash' | 'card' | 'manual') => {},
  showProcessing: (
    _paymentMethod?: 'cash' | 'card' | 'manual',
    _tipAmountOverride?: number
  ) => {},
  showApproved: () => {},
  showDeclined: () => {},
  showIdle: () => {},
  showLoyaltyPrompt: () => {},
  showLoyaltyConfirmation: () => {},
  disconnectClient: () => {},
  refreshCarouselImages: async () => {},
  refreshOrderingPanelImages: async () => {},
  markOrderProcessingActivity: () => {},
  activeScreenState: null
}

export function CFDProvider ({ children }: { children: React.ReactNode }) {
  const isCFDMode = useStoreSettingsStore(s => s.isCFDMode)

  // In CFD client mode, this device is a display client — don't start server
  if (isCFDMode) {
    return (
      <CFDOrderProcessingActivityContext.Provider value={noopCFDValue.markOrderProcessingActivity}>
        <CFDContext.Provider value={noopCFDValue}>{children}</CFDContext.Provider>
      </CFDOrderProcessingActivityContext.Provider>
    )
  }

  return <CFDServerProvider>{children}</CFDServerProvider>
}

function CFDServerProvider ({ children }: { children: React.ReactNode }) {
  const controllerRef = useRef<CFDController | null>(null)
  const pathname = usePathname()

  // Status states
  const [serverStatus, setServerStatus] = useState<CFDServerStatus>('disabled')
  const [isConnected, setIsConnected] = useState(false)
  const [clientCount, setClientCount] = useState(0)
  const [connectedClientIds, setConnectedClientIds] = useState<string[]>([])
  const [pairingData, setPairingData] = useState<CFDPairingData | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [tipResponse, setTipResponse] = useState<CFDTipResponse | null>(null)
  const [currentTip, setCurrentTip] = useState<{
    amount: number
    percentage: number | null
  }>({ amount: 0, percentage: null })
  const [activeScreenState, setActiveScreenState] =
    useState<CFDScreenState | null>(null)
  const activeScreenStateRef = useRef<CFDScreenState | null>(null)
  const [activePaymentMethod, setActivePaymentMethod] = useState<
    'cash' | 'card' | 'manual' | null
  >(null)
  const [baseAmountOverride, setBaseAmountOverride] = useState<number | null>(
    null
  )
  const tipConfigRef = useRef<CFDPayload['tipConfig'] | null>(null)
  const lastPayloadHashRef = useRef('')
  const lastShowPaymentAtRef = useRef<number>(0)
  // Frozen totals snapshot taken at showProcessing — held until result screen clears
  const frozenTotalsRef = useRef<{
    subtotal: number
    subtotalCash: number
    subtotalCard: number
    discountAmount: number
    taxAmount: number
    taxCash: number
    taxCard: number
    total: number
    totalCash: number
    totalCard: number
    tipAmount: number
    savingsAmount: number
    outstandingTotal: number
    amountPaid: number
    paymentMethod: 'cash' | 'card' | 'manual' | null
    localOrderId: string | null
    dbOrderId: string | null
    customerId: string | null
    customerPhone: string | null
    customerName: string | null
    orderNumber: string | null
    orderType: string | null
    tableName: string | null
    guestCount: number | null
    items: CFDCartItem[]
  } | null>(null)
  const lastStableLiveTotalsRef = useRef<{
    subtotal: number
    subtotalCash: number
    subtotalCard: number
    discountAmount: number
    taxAmount: number
    taxCash: number
    taxCard: number
    total: number
    totalCash: number
    totalCard: number
    savingsAmount: number
    outstandingTotal: number
    amountPaid: number
  } | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const builtinIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loyaltyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultAutoIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const orderProcessingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const loyaltyFlowRequestIdRef = useRef(0)
  const merchantClosedDuringLoyaltyRef = useRef(false)
  // Latched when a sale finishes (Done/Skip on the approved screen) while the
  // operator's payment sheet is still open. Keeps the CFD on idle instead of
  // snapping back to the live `ordering` payload. Cleared once the operator
  // actually moves on (active order changes or order-processing goes idle).
  const saleCompletedAwaitingCloseRef = useRef(false)
  const queuedLoyaltyOrderIdsRef = useRef<Set<string>>(new Set())
  // Dedupe via cheap structural fingerprints — replaces a per-flush
  // JSON.stringify of the entire cart. The fingerprint is checked at flush
  // time (after debounce) so canceling a queued dispatch leaves
  // lastPayloadHashRef accurate to what was actually sent.
  const debouncedUpdateRef = useRef(
    debounce((ctrl: CFDController, params: any, fingerprint: string) => {
      if (fingerprint === lastPayloadHashRef.current) return
      ctrl.updateOrder(params)
      lastPayloadHashRef.current = fingerprint
    }, 150)
  )
  const debouncedBuiltinUpdateRef = useRef(
    debounce((data: Record<string, unknown>, fingerprint: string) => {
      if (fingerprint === lastBuiltinFingerprintRef.current) return
      // Single write — the store internally mirrors to the WebView bridge.
      useCFDBuiltinStore.getState().update(data as any)
      lastBuiltinFingerprintRef.current = fingerprint
      lastBuiltinScreenStateRef.current =
        (data.screenState as string | undefined) ??
        lastBuiltinScreenStateRef.current
    }, 60)
  )
  // Fingerprint of the last payload pushed to the built-in store. Lets us skip
  // dispatching when no field that the secondary display reads has changed.
  const lastBuiltinFingerprintRef = useRef('')
  // Last screenState we actually dispatched. Used to bypass the debounce on
  // screen-state transitions (idle ↔ ordering ↔ payment) so transitions feel
  // instant; cart-edit churn within the same screenState still gets batched.
  const lastBuiltinScreenStateRef = useRef<string>('')
  const [isOrderProcessingIdle, setIsOrderProcessingIdle] = useState(false)
  const isOrderProcessingIdleRef = useRef(false)
  const pathnameRef = useRef(pathname)
  const [lastOrderProcessingActivityAt, setLastOrderProcessingActivityAt] =
    useState(() => Date.now())

  const clearOrderProcessingIdleTimer = useCallback(() => {
    if (!orderProcessingIdleTimerRef.current) return
    clearTimeout(orderProcessingIdleTimerRef.current)
    orderProcessingIdleTimerRef.current = null
  }, [])

  const markOrderProcessingActivity = useCallback(() => {
    setLastOrderProcessingActivityAt(Date.now())
    setIsOrderProcessingIdle(false)
  }, [])

  // Store settings
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const organizationLogoUrl = useStoreSettingsStore(s => s.organizationLogoUrl)
  const showCFDOrderingRightPanel = useStoreSettingsStore(
    s => s.showCFDOrderingRightPanel
  )
  const cfdPricingDisplayMode = useStoreSettingsStore(
    s => (s.selectedStore?.cfd_pricing_display_mode ?? 'dual') as 'dual' | 'card_only' | 'cash_only'
  )
  const cfdOrderingRightPanelMode = useStoreSettingsStore(
    s => s.cfdOrderingRightPanelMode
  )
  const tipsConfig = useLocationConfigStore(s => s.config.tips)
  const tipPresetPercentages = tipsConfig.presetPercentages

  // CFD WebView snapshot provider — pushes the full current display state
  // to the WebView on mount/reload so it catches up on every accumulated
  // useCFDBuiltinStore write (carouselImages, orderingPanelImages, branding,
  // etc.) — not just the most recent partial.
  //
  // The snapshot reads from `useCFDBuiltinStore`, which can lag the
  // authoritative `activeScreenState` React state during a loyalty flow
  // (the loyalty screens are dispatched via direct `update()` calls and
  // can race with other writes). If the WebView reloads or re-readies
  // mid-loyalty, an out-of-date `screenState` would clobber the prompt
  // and dismiss the customer's input. Override with the React-state
  // truth when we're on a loyalty screen.
  useEffect(() => {
    setCFDWebViewSnapshotProvider(() => {
      const s = useCFDBuiltinStore.getState()
      const liveScreenState = activeScreenStateRef.current
      const effectiveScreenState =
        liveScreenState === 'loyalty_prompt' ||
        liveScreenState === 'loyalty_confirmation'
          ? liveScreenState
          : s.screenState
      return {
        screenState: effectiveScreenState,
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
        serviceCharge: s.serviceCharge,
        serviceChargeName: s.serviceChargeName,
        serviceChargeRate: s.serviceChargeRate,
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
      }
    })
    return () => {
      setCFDWebViewSnapshotProvider(null)
    }
  }, [])

  // Theme — propagated to external CFD tablet AND on-device WebView so the
  // CFD always matches the POS operator's chosen mode.
  const { colorScheme } = useColorScheme()

  // Mirror colorScheme into useCFDBuiltinStore so the WebView snapshot picks
  // it up on every (re)mount and incremental updates flow through too.
  useEffect(() => {
    useCFDBuiltinStore
      .getState()
      .update({ themeMode: colorScheme === 'dark' ? 'dark' : 'light' })
  }, [colorScheme])

  // Loyalty
  // Kill switch — set EXPO_PUBLIC_CFD_DISABLE_LOYALTY=1 to bypass the
  // entire CFD loyalty flow (no Join CTA on the Approved screen, no
  // auto-loyalty trigger after payment, no loyalty_prompt /
  // loyalty_confirmation transitions). Use this while we work through
  // the loyalty path's stability issues; flip back to 0 / unset when
  // the flow is fixed.
  const cfdLoyaltyDisabled =
    process.env.EXPO_PUBLIC_CFD_DISABLE_LOYALTY === '1' ||
    process.env.EXPO_PUBLIC_CFD_DISABLE_LOYALTY === 'true'
  // The CFD reads merchantHasLoyalty to decide whether to show the
  // "Join Loyalty" CTA on the Approved screen. The kill switch is the
  // sole control — when 0/unset, always show loyalty. The DB check
  // (checkMerchantHasLoyalty) was silently returning false if no
  // loyalty_programs rows exist, hiding the button even with flag=0.
  const merchantHasLoyalty = !cfdLoyaltyDisabled

  useEffect(() => {
    if (!DEBUG) return
    console.log('[CFDProvider] loyalty flags', {
      EXPO_PUBLIC_CFD_DISABLE_LOYALTY:
        process.env.EXPO_PUBLIC_CFD_DISABLE_LOYALTY,
      cfdLoyaltyDisabled,
      merchantHasLoyalty
    })
  }, [cfdLoyaltyDisabled, merchantHasLoyalty])

  // Mirror merchantHasLoyalty (persisted in useLoyaltyStore via MMKV) into
  // useCFDBuiltinStore so the WebView/legacy CFD pick it up on every load,
  // including offline boots before any network check fires.
  useEffect(() => {
    console.log(
      '[CFDProvider] updating useCFDBuiltinStore merchantHasLoyalty ->',
      merchantHasLoyalty
    )
    useCFDBuiltinStore.getState().update({ merchantHasLoyalty })
  }, [merchantHasLoyalty])

  // Mirror pricingDisplayMode into useCFDBuiltinStore so the built-in WebView
  // picks up the location setting on every load.
  useEffect(() => {
    useCFDBuiltinStore.getState().update({ pricingDisplayMode: cfdPricingDisplayMode })
  }, [cfdPricingDisplayMode])

  // Order store selectors - Individual selectors for stability
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const activeOrder = useOrderStore(s =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : null
  )
  const activeOrderSeating = useSeatingStore(s =>
    activeOrder?.id ? s.byOrderId[activeOrder.id] : undefined
  )
  // Ref so loyalty callbacks always see the latest order without re-registering
  const activeOrderRef = useRef(activeOrder)
  const activeOrderIdRef = useRef(activeOrderId)
  useEffect(() => {
    activeOrderRef.current = activeOrder
  }, [activeOrder])
  useEffect(() => {
    activeOrderIdRef.current = activeOrderId
  }, [activeOrderId])
  useEffect(() => {
    activeScreenStateRef.current = activeScreenState
  }, [activeScreenState])

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    isOrderProcessingIdleRef.current = isOrderProcessingIdle
  }, [isOrderProcessingIdle])

  useEffect(() => {
    clearOrderProcessingIdleTimer()

    const onOrderProcessing = pathname.includes('order-processing')
    const hasCustomerFlow =
      activeScreenState === 'payment' ||
      activeScreenState === 'processing' ||
      activeScreenState === 'approved' ||
      activeScreenState === 'declined' ||
      activeScreenState === 'tip_selection' ||
      activeScreenState === 'loyalty_prompt' ||
      activeScreenState === 'loyalty_confirmation'
    const activeOrderItemCount = activeOrder?.items?.length ?? 0
    const isEmptyOrder = activeOrderItemCount === 0

    if (!onOrderProcessing || hasCustomerFlow || !activeOrder || !isEmptyOrder) {
      setIsOrderProcessingIdle(false)
      return
    }

    if (isOrderProcessingIdle) return

    const elapsed = Date.now() - lastOrderProcessingActivityAt
    const delay = Math.max(0, ORDER_PROCESSING_IDLE_MS - elapsed)
    orderProcessingIdleTimerRef.current = setTimeout(() => {
      orderProcessingIdleTimerRef.current = null
      setIsOrderProcessingIdle(true)
    }, delay)

    return clearOrderProcessingIdleTimer
  }, [
    pathname,
    activeScreenState,
    activeOrder,
    isOrderProcessingIdle,
    lastOrderProcessingActivityAt,
    clearOrderProcessingIdleTimer
  ])

  const activeOrderSubtotal = useOrderStore(s => s.activeOrderSubtotal)
  const activeOrderTax = useOrderStore(s => s.activeOrderTax)
  const activeOrderTotal = useOrderStore(s => s.activeOrderTotal)
  const activeOrderDiscount = useOrderStore(s => s.activeOrderDiscount)
  const activeOrderOutstandingTotal = useOrderStore(
    s => s.activeOrderOutstandingTotal
  )
  // Cash-side outstanding. On a cash-discounted split the payment RPC can leave
  // the card-side outstanding at 0 while the cash side still owes a portion, so
  // a non-split CFD payload that reads only the card side shows $0 due. Use
  // whichever side still owes for the order-level (non-split) outstanding.
  const activeOrderOutstandingCash = useOrderStore(
    s => s.activeOrderOutstandingCash
  )
  const activeOrderOutstandingEffective = Math.max(
    activeOrderOutstandingTotal ?? 0,
    activeOrderOutstandingCash ?? 0
  )

  // Granular field selectors — used as effect deps so unrelated `activeOrder`
  // mutations (status, sync state, etc.) don't re-fire the CFD payload pipelines.
  const activeOrderCustomerName = useOrderStore(s =>
    s.activeOrderId
      ? s.ordersById[s.activeOrderId]?.customer_name ?? null
      : null
  )
  const activeOrderCustomerPhone = useOrderStore(s =>
    s.activeOrderId
      ? s.ordersById[s.activeOrderId]?.customer_phone ?? null
      : null
  )
  const activeOrderDisplayNumber = useOrderStore(s =>
    s.activeOrderId
      ? s.ordersById[s.activeOrderId]?.display_number ?? null
      : null
  )
  const activeOrderOrderNumber = useOrderStore(s =>
    s.activeOrderId ? s.ordersById[s.activeOrderId]?.order_number ?? null : null
  )
  const activeOrderOrderType = useOrderStore(s =>
    s.activeOrderId ? s.ordersById[s.activeOrderId]?.order_type ?? null : null
  )
  const activeOrderServiceLocationId = useOrderStore(s =>
    s.activeOrderId
      ? s.ordersById[s.activeOrderId]?.service_location_id ?? null
      : null
  )
  const activeOrderGuestCount = useOrderStore(s =>
    s.activeOrderId ? s.ordersById[s.activeOrderId]?.guest_count ?? null : null
  )
  const activeOrderAmountPaid = useOrderStore(s =>
    s.activeOrderId ? s.ordersById[s.activeOrderId]?.amount_paid ?? 0 : 0
  )

  // Content-based fingerprint so cfdItems transform only runs when actual item
  // data changes, not when the items array reference changes due to unrelated
  // order mutations (e.g. status changes, payment updates).
  const itemsFingerprint = useMemo(() => {
    if (!activeOrder?.items) return ''
    return activeOrder.items
      .map(
        i =>
          `${i.id}:${i.quantity}:${i.unitPrice}:${i.cashPrice}:${i.is_voided}:${
            i.seatNumber
          }:${i.courseNumber}:${i.name}:${i.open_item_name ?? ''}`
      )
      .join('|')
  }, [activeOrder?.items])

  // Transform cart items to CFD format with dual pricing.
  // Wrapped in try-catch: an unhandled throw here propagates to the secondary
  // display's React surface, which has no Sentry wrapper — the native layer
  // surfaces it as a brief Android system crash dialog on Landi devices.
  const cfdItems: CFDCartItem[] = useMemo(() => {
    try {
      // Idle gate: skip the O(n) dual-pricing transform entirely when there is
      // no CFD surface to render it. `isConnected` (external paired CFD) is in
      // deps; the built-in CFD is read via getCachedCapabilities() (cache-first,
      // same source used at mount detection) to avoid a TDZ ReferenceError —
      // `hasBuiltinCfd` state is declared far below this memo. Downstream push
      // effects + displayItems already gate on isConnected/hasBuiltinCfd, so an
      // empty result while idle changes nothing the CFD surface renders.
      if (!isConnected && !getCachedCapabilities()?.hasBuiltinCfd) return []
      if (!activeOrder?.items) return []
      const hideCourseNumbersOnCfd = pathname.includes('order-processing')

      const result: CFDCartItem[] = []
      for (const item of activeOrder.items) {
        if (item.is_voided || item.quantity <= 0 || item.isDraft) continue
        try {
          const cardUnitPrice = item.unitPrice || item.price || 0
          const cashUnitPrice = item.cashPrice || cardUnitPrice
          const cardLineTotal = item.subtotal || cardUnitPrice * item.quantity
          const cashLineTotal =
            item.cashSubtotal || cashUnitPrice * item.quantity

          result.push({
            id: item.id,
            name: item.is_open_item
              ? item.open_item_name ?? 'Open Item'
              : item.name || 'Item',
            quantity: item.quantity,
            unitPrice: Math.round(cardUnitPrice * 100),
            seatNumber:
              activeOrderSeating?.itemSeatMap?.[item.id] ??
              (item.db_order_item_id
                ? activeOrderSeating?.dbIdToSeatMap?.[item.db_order_item_id]
                : undefined) ??
              item.seatNumber ??
              null,
            courseNumber: hideCourseNumbersOnCfd
              ? undefined
              : item.courseNumber,
            cashPrice: Math.round(cashUnitPrice * 100),
            cardPrice: Math.round(cardUnitPrice * 100),
            lineTotal: Math.round(cardLineTotal * 100),
            lineTotalCash: Math.round(cashLineTotal * 100),
            lineTotalCard: Math.round(cardLineTotal * 100),
            modifiers: [
              ...(item.customizations?.size
                ? [
                    {
                      name: item.customizations.size.name,
                      price: Math.round(
                        (item.customizations.size.priceModifier || 0) * 100
                      ),
                      priceCash: Math.round(
                        (item.customizations.size.priceModifier || 0) * 100
                      ),
                      priceCard: Math.round(
                        (item.customizations.size.priceModifier || 0) * 100
                      )
                    }
                  ]
                : []),
              ...(item.customizations?.addOns?.map(a => ({
                name: a.name,
                price: Math.round((a.price || 0) * 100),
                priceCash: Math.round((a.price || 0) * 100),
                priceCard: Math.round((a.price || 0) * 100)
              })) ?? []),
              ...(item.customizations?.modifiers?.flatMap(m =>
                m.options.map(o => ({
                  name: o.name,
                  price: Math.round((o.price || 0) * 100),
                  priceCash: Math.round((o.price || 0) * 100),
                  priceCard: Math.round((o.price || 0) * 100),
                  isNo: o.isNo,
                  categoryName: m.categoryName
                }))
              ) ?? [])
            ],
            notes: item.customizations?.notes
          })
        } catch (itemErr) {
          console.warn(
            '[CFD] Skipping item due to transform error:',
            item.id,
            itemErr
          )
        }
      }
      return result
    } catch (err) {
      console.error('[CFD] cfdItems transform failed:', err)
      return []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsFingerprint, activeOrderSeating, pathname, isConnected])

  // Initialize CFD controller
  useEffect(() => {
    // Check prerequisites
    if (
      !selectedStation?.id ||
      !selectedStore?.id ||
      !selectedStore?.name ||
      !selectedStation?.station_name
    ) {
      setServerStatus('disabled')
      setPairingData(null)
      return
    }

    setServerStatus('initializing')
    setServerError(null)

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const attemptStart = async (retryNum: number) => {
      if (cancelled) return

      const ctrl = new CFDController({
        stationId: selectedStation.id,
        stationName: selectedStation.station_name,
        locationId: selectedStore.id,
        branding: {
          restaurantName: selectedStore.name,
          locationCode: selectedStore.code,
          logoUrl: organizationLogoUrl,
          primaryColor: '#10b981'
        },
        port: 8765
      })

      controllerRef.current = ctrl

      // Route WebView (built-in CFD) user actions through the same dispatch
      // path as the off-device WebSocket clients. Bridge no-ops if no WebView
      // is mounted.
      setCFDWebViewActionHandler(message => {
        if (controllerRef.current !== ctrl) return
        try {
          ctrl.routeClientMessage(JSON.stringify(message))
        } catch (err) {
          console.error('[CFD] WebView action route error:', err)
        }
      })

      try {
        const info = await ctrl.start({
          onCFDConnected: clientId => {
            if (controllerRef.current !== ctrl) return
            console.log('[useCFD] CFD connected:', clientId)
            setIsConnected(true)
            setClientCount(ctrl.clientCount)
            setConnectedClientIds(ctrl.connectedClientIds)
            setServerStatus('connected')
          },
          onCFDDisconnected: clientId => {
            if (controllerRef.current !== ctrl) return
            console.log('[useCFD] CFD disconnected:', clientId)
            const count = ctrl.clientCount
            setClientCount(count)
            setConnectedClientIds(ctrl.connectedClientIds)
            setIsConnected(count > 0)
            setServerStatus(count > 0 ? 'connected' : 'ready')
          },
          onTipSelected: (response: CFDTipResponse) => {
            if (controllerRef.current !== ctrl) return
            console.log('[useCFD] Tip selected:', response)
            setTipResponse(response)
          },
          onPhoneSubmitted: async phone => {
            if (controllerRef.current !== ctrl) return
            if (!selectedStore?.id) return
            const requestId = ++loyaltyFlowRequestIdRef.current
            clearLoyaltyTimer()

            const order = activeOrderRef.current
            const frozen = frozenTotalsRef.current
            const dbOrderId = order?.db_order_id ?? frozen?.dbOrderId
            logLoyaltyTrace('external-phone-submitted:start', {
              requestId,
              phoneDigits: phone.replace(/\D/g, '').length,
              dbOrderId,
              hasOrder: !!order,
              hasFrozen: !!frozen,
              activeScreenState: activeScreenStateRef.current
            })
            if (!dbOrderId) {
              const fallbackCustomerName =
                order?.customer_name ?? frozen?.customerName ?? undefined
              void queueDeferredLoyaltyEarn({
                order,
                frozen,
                fallbackCustomerName,
                fallbackCustomerPhone: phone
              })
              logLoyaltyTrace(
                'external-phone-submitted:missing-db-order-id-fallback-confirmation',
                {
                  fallbackCustomerName: fallbackCustomerName ?? null
                }
              )
              useCFDBuiltinStore.getState().update({
                screenState: 'loyalty_confirmation',
                loyaltyResult: {
                  customerName: fallbackCustomerName,
                  programs: []
                }
              })
              setActiveScreenState('loyalty_confirmation')
              ctrl.showLoyaltyConfirmation([], fallbackCustomerName)
              scheduleLoyaltyReturnToIdle(
                requestId,
                'external-phone-submitted:fallback'
              )
              return
            }

            const merchantId = selectedStore.merchant_id

            try {
              const { id: customerId, name } =
                await findOrCreateCustomerByPhone(phone, merchantId, supabase)
              logLoyaltyTrace('external-phone-submitted:customer-resolved', {
                customerId,
                customerName: name ?? null
              })
              // Directly update the order's customer_id so the RPC can find it immediately
              await supabase
                .from('orders')
                .update({ customer_id: customerId })
                .eq('id', dbOrderId)

              if (requestId !== loyaltyFlowRequestIdRef.current) return

              const results = await earnLoyaltyWithReadiness({
                dbOrderId,
                requestId,
                traceStage: 'external-phone-submitted',
                maxAttempts: 8
              })

              if (requestId !== loyaltyFlowRequestIdRef.current) return

              if (results.length === 0) {
                console.warn(
                  '[CFD Loyalty] No loyalty program data returned after phone submit; showing confirmation fallback'
                )
                void queueDeferredLoyaltyEarn({
                  order,
                  frozen,
                  fallbackCustomerName: name ?? undefined,
                  fallbackCustomerPhone: phone,
                  fallbackCustomerId: customerId
                })
              }

              const loyaltyResult = {
                customerName: name ?? undefined,
                programs: results.map(r => ({
                  name: r.program_name,
                  type: r.program_type,
                  earned: r.earned,
                  newBalance: r.new_balance,
                  rewardUnlocked: r.reward_unlocked,
                  progressPercent:
                    (r as any).progress_percent ??
                    (r as any).progressPercent ??
                    null,
                  remainingToReward:
                    (r as any).remaining_to_reward ??
                    (r as any).remainingToReward ??
                    null,
                  rewardThreshold:
                    (r as any).reward_threshold ??
                    (r as any).rewardThreshold ??
                    null,
                  rewardLabel:
                    (r as any).reward_label ?? (r as any).rewardLabel ?? null,
                  canRedeemNow:
                    (r as any).can_redeem_now ?? (r as any).canRedeemNow ?? null
                }))
              }
              // Set store BEFORE triggering screen state so component mounts with data
              useCFDBuiltinStore.getState().update({
                screenState: 'loyalty_confirmation',
                loyaltyResult
              })
              setActiveScreenState('loyalty_confirmation')
              logLoyaltyTrace('external-phone-submitted:show-confirmation', {
                requestId,
                customerName: name ?? null,
                programCount: results.length
              })
              ctrl.showLoyaltyConfirmation(results, name ?? undefined)
              scheduleLoyaltyReturnToIdle(requestId, 'external-phone-submitted')
            } catch (err) {
              logLoyaltyTrace('external-phone-submitted:error', {
                requestId,
                dbOrderId,
                message: err instanceof Error ? err.message : String(err)
              })
              console.error('[CFD Loyalty] Error processing loyalty:', err)
              const fallbackCustomerName =
                order?.customer_name ?? frozen?.customerName ?? undefined
              void queueDeferredLoyaltyEarn({
                order,
                frozen,
                fallbackCustomerName,
                fallbackCustomerPhone: phone
              })

              useCFDBuiltinStore.getState().update({
                screenState: 'loyalty_confirmation',
                loyaltyResult: {
                  customerName: fallbackCustomerName,
                  programs: []
                }
              })
              setActiveScreenState('loyalty_confirmation')
              ctrl.showLoyaltyConfirmation([], fallbackCustomerName)
              scheduleLoyaltyReturnToIdle(
                requestId,
                'external-phone-submitted:error-fallback'
              )
            }
          },
          onLoyaltySkip: () => {
            if (controllerRef.current !== ctrl) return
            clearLoyaltyTimer()
            finishLoyaltyFlow('external-loyalty-skip')
          },
          onLoyaltyJoin: () => {
            if (controllerRef.current !== ctrl) return
            // Kill switch — drop the request and reset to idle so a
            // stray client-side Join tap (or a stale state on an
            // external CFD client) can't drag us into the broken path.
            if (cfdLoyaltyDisabled) {
              console.log(
                '[useCFD] Loyalty Join ignored — loyalty disabled flag'
              )
              clearResultAutoIdleTimer()
              clearLoyaltyTimer()
              setActiveScreenState(null)
              ctrl.showIdle()
              return
            }
            // Customer EXPLICITLY pressed Join — they want to type their
            // phone now. Skip the silent auto-earn lookup path (which
            // can sit on backend lookups for several seconds before
            // showing the prompt) and flip the CFD straight to the
            // phone prompt. The auto-earn path remains for implicit
            // post-paid flows that don't go through this callback.
            console.log('[useCFD] Loyalty Join pressed — showing prompt')
            ++loyaltyFlowRequestIdRef.current
            clearResultAutoIdleTimer()
            clearLoyaltyTimer()
            setActiveScreenState('loyalty_prompt')
            ctrl.showLoyaltyPrompt(selectedStore?.name ?? '')
            useCFDBuiltinStore
              .getState()
              .update({ screenState: 'loyalty_prompt', loyaltyResult: null })
          }
        })

        if (cancelled) {
          ctrl.stop()
          return
        }

        console.log('[useCFD] Server started:', info)
        setPairingData(ctrl.getPairingData())
        setServerStatus('ready')
      } catch (error: any) {
        if (cancelled) return
        console.error('[useCFD] Server failed to start:', error)
        setServerStatus('error')
        setServerError(error.message)
        const delay = Math.min(3000 * (retryNum + 1), 30000)
        retryTimer = setTimeout(() => attemptStart(retryNum + 1), delay)
      }
    }

    attemptStart(0)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      console.log('[useCFD] Stopping Server...')
      setCFDWebViewActionHandler(null)
      controllerRef.current?.stop()
      controllerRef.current = null
      setServerStatus('disabled')
      setPairingData(null)
      setIsConnected(false)
      setClientCount(0)
      setConnectedClientIds([])
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      if (builtinIdleTimerRef.current) {
        clearTimeout(builtinIdleTimerRef.current)
        builtinIdleTimerRef.current = null
      }
      if (orderProcessingIdleTimerRef.current) {
        clearTimeout(orderProcessingIdleTimerRef.current)
        orderProcessingIdleTimerRef.current = null
      }
      if (loyaltyTimerRef.current) {
        clearTimeout(loyaltyTimerRef.current)
        loyaltyTimerRef.current = null
      }
    }
  }, [
    selectedStation?.id,
    selectedStore?.id,
    selectedStore?.name,
    selectedStation?.station_name
    // organizationLogoUrl removed — handled by the branding effect below
  ])

  // Update branding on running server when logo URL changes (avoids full server restart)
  useEffect(() => {
    if (serverStatus === 'ready' || serverStatus === 'connected') {
      controllerRef.current?.updateBranding({
        restaurantName: selectedStore?.name ?? '',
        locationCode: selectedStore?.code ?? null,
        logoUrl: organizationLogoUrl,
        primaryColor: '#10b981'
      })
    }
  }, [
    organizationLogoUrl,
    serverStatus,
    selectedStore?.name,
    selectedStore?.code
  ])

  // Fetch and Sync Carousel Images (for both WS clients and built-in display)
  const supabase = useSupabaseClient()
  const [hasBuiltinCfd, setHasBuiltinCfd] = useState(false)

  const fetchCarouselImages = useCallback(async () => {
    if (!selectedStore?.id || !controllerRef.current) return
    try {
      const { data, error } = await supabase.rpc('get_active_cfd_images', {
        target_location_id: selectedStore.id
      })
      if (error) {
        console.error('[CFD] Failed to fetch images:', error)
        return
      }
      if (data && Array.isArray(data)) {
        const imageUrls = data
          .map((d: any) => d.image_url)
          .filter(
            (url: unknown): url is string =>
              typeof url === 'string' && url.length > 0
          )
        const currentImages = useCFDBuiltinStore.getState().carouselImages
        if (areStringArraysEqual(currentImages, imageUrls)) {
          if (__DEV__) console.log('[CFD] Carousel images unchanged')
          return
        }
        console.log('[CFD] Updating carousel images:', imageUrls.length)
        // Optional-chain — controller may have stopped (station change, logout)
        // between the early-return check above and this point on the await.
        // Builtin store still gets the update so the WebView path works.
        controllerRef.current?.updateCarouselImages(imageUrls)
        useCFDBuiltinStore.getState().update({ carouselImages: imageUrls })
      }
    } catch (err) {
      console.error('[CFD] Error fetching images:', err)
    }
  }, [selectedStore?.id, supabase])

  const fetchOrderingPanelImages = useCallback(async () => {
    if (!selectedStore?.id || !controllerRef.current) return
    try {
      const { data, error } = await supabase
        .from('cfd_ordering_panel_images')
        .select('panel_slot, image_url, display_order')
        .eq('location_id', selectedStore.id)
        .eq('is_active', true)
        .order('panel_slot', { ascending: true })
        .order('display_order', { ascending: true })

      if (error) {
        console.error('[CFD] Failed to fetch ordering panel images:', error)
        return
      }

      const orderingPanelImages = {
        primary: [] as string[],
        secondary: [] as string[]
      }

      ;(data ?? []).forEach((row: any) => {
        if (typeof row.image_url !== 'string' || !row.image_url) return
        if (row.panel_slot === 'secondary') {
          orderingPanelImages.secondary.push(row.image_url)
        } else {
          orderingPanelImages.primary.push(row.image_url)
        }
      })

      // Optional-chain — same race as fetchCarouselImages.
      const currentOrderingPanelImages =
        useCFDBuiltinStore.getState().orderingPanelImages
      if (
        areOrderingPanelImagesEqual(
          currentOrderingPanelImages,
          orderingPanelImages
        )
      ) {
        if (__DEV__) console.log('[CFD] Ordering panel images unchanged')
        return
      }

      controllerRef.current?.updateOrderingPanelImages(orderingPanelImages)
      useCFDBuiltinStore.getState().update({ orderingPanelImages })
    } catch (err) {
      console.error('[CFD] Error fetching ordering panel images:', err)
    }
  }, [selectedStore?.id, supabase])

  useEffect(() => {
    if (isConnected || hasBuiltinCfd) {
      fetchCarouselImages()
      fetchOrderingPanelImages()
      const interval = setInterval(() => {
        fetchCarouselImages()
        fetchOrderingPanelImages()
      }, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [
    isConnected,
    hasBuiltinCfd,
    fetchCarouselImages,
    fetchOrderingPanelImages
  ])

  // Check loyalty on mount (5-min TTL cache)
  useEffect(() => {
    if (!selectedStore?.id) return
    const {
      merchantHasLoyalty: cached,
      checkedAt,
      setMerchantHasLoyalty
    } = useLoyaltyStore.getState()
    const stale = Date.now() - checkedAt > 5 * 60_000
    if (!cached || stale) {
      checkMerchantHasLoyalty(selectedStore.merchant_id, supabase)
        .then(setMerchantHasLoyalty)
        .catch(() => {}) // non-fatal
    }
  }, [selectedStore?.id])

  // Order totals with dual pricing (used by both WS sync and built-in display)
  const orderTotals = useActiveOrderTotals()

  // ==================== PAYMENT STORE → CFD SYNC ====================
  // Drive CFD payment screen directly from payment store view state,
  // so there are no race conditions between mounting/unmounting view components.
  const paymentIsOpen = usePaymentStore(s => s.isOpen)
  const paymentView = usePaymentStore(s => s.view)
  const paymentSplits = usePaymentStore(s => s.splits)
  const paymentActiveSplitId = usePaymentStore(s => s.activeSplitId)
  const paymentActiveSplit = useMemo(
    () =>
      paymentSplits.find(split => split.id === paymentActiveSplitId) ?? null,
    [paymentSplits, paymentActiveSplitId]
  )

  // Auto-sync order to CFD (WebSocket clients)
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !isConnected) return

    // A "Sales Screen" indicates the cashier is actively taking or editing an order.
    // Shared with the builtin (WebView) sync effect — see `lib/cfdRouting.ts`.
    const isSalesScreen = isCFDSalesPathname(pathname)

    // We show order data IF:
    // 1. We are in an active transaction state (Tip Selection, Payment, etc.)
    // 2. We are on the Sales screen and have an active order.
    const shouldShowOrderData =
      !!activeScreenState ||
      (isSalesScreen && !!activeOrder && !isOrderProcessingIdle)

    const frozen = frozenTotalsRef.current
    const displayItems = frozen?.items ?? cfdItems
    const displayCustomerName =
      frozen?.customerName ?? activeOrder?.customer_name ?? null
    const displayOrderNumber =
      frozen?.orderNumber ??
      activeOrder?.display_number ??
      activeOrder?.order_number ??
      null
    const rawOrderType = frozen?.orderType ?? activeOrder?.order_type ?? null
    const displayOrderType = rawOrderType
      ? getOrderTypeDisplay(rawOrderType)
      : null
    const liveTableName = activeOrder?.order_type
      ?.toLowerCase()
      .includes('dine')
      ? resolveTableDisplayName(
          activeOrder?.service_location_id,
          activeOrder?.service_location_name
        )
      : null
    const displayTableName = frozen?.tableName ?? liveTableName
    const displayGuestCount =
      frozen?.guestCount ?? activeOrder?.guest_count ?? null
    const currentBase = frozen
      ? frozen.subtotalCard / 100
      : baseAmountOverride ?? activeOrderSubtotal

    if (DEBUG) {
      console.log(
        `[CFD Sync] State: ${
          activeScreenState || 'auto'
        }, Path: ${pathname}, Visible: ${shouldShowOrderData}`
      )
    }

    if (!shouldShowOrderData) {
      // Debounce idle transition to prevent flicker during screen navigation
      if (!idleTimerRef.current) {
        idleTimerRef.current = setTimeout(() => {
          frozenTotalsRef.current = null
          controller.showIdle()
          idleTimerRef.current = null
        }, 500)
      }
      return () => {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current)
          idleTimerRef.current = null
        }
        debouncedUpdateRef.current.cancel()
      }
    }

    // Cancel any pending idle transition since we have data to show
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }

    // items should always be synced if we're showing order data
    let cardSubtotal = frozen?.subtotalCard ?? Math.round(currentBase * 100)
    let cashSubtotal =
      frozen?.subtotalCash ??
      Math.round((orderTotals?.cashSubtotal ?? currentBase) * 100)
    let cardTax = frozen?.taxCard ?? Math.round(activeOrderTax * 100)
    let cashTax =
      frozen?.taxCash ??
      Math.round((orderTotals?.cashTax ?? activeOrderTax) * 100)
    // Prefer the live calculator's totals over the legacy
    // `activeOrderTotal` store field. The legacy field is written by
    // recalculateOrder / _ensureTotalsFresh / applyBackendItemData and
    // lags by one render relative to `useActiveOrderTotals()` — which
    // means the CFD's TOTAL can show the pre-SC value while the SC line
    // (sourced from orderTotals.serviceCharge below) reflects the fresh
    // SC. They then disagree by ~SC's worth (the CFD-vs-POS-total bug).
    // Both POS panes (PricingBreakdownSheet / Totals.tsx) already use
    // orderTotals exclusively; CFD should too.
    const liveCardTotal = Math.round(
      ((orderTotals?.total ?? activeOrderTotal) + currentTip.amount) * 100
    )
    const liveCashTotal = Math.round(
      ((orderTotals?.cashTotal ?? activeOrderTotal) + currentTip.amount) * 100
    )
    let cardTotal = frozen ? frozen.totalCard : liveCardTotal
    let cashTotal = frozen ? frozen.totalCash : liveCashTotal
    let savingsAmount = frozen
      ? frozen.savingsAmount
      : Math.max(0, liveCardTotal - liveCashTotal)
    const displayTipAmount = frozen
      ? frozen.tipAmount
      : Math.round(currentTip.amount * 100)
    let displayOutstandingTotal = frozen
      ? frozen.outstandingTotal
      : Math.round((activeOrderOutstandingEffective + currentTip.amount) * 100)
    let displayAmountPaid = frozen
      ? frozen.amountPaid
      : Math.round((activeOrder?.amount_paid ?? 0) * 100)
    let displayDiscountAmount =
      frozen?.discountAmount ?? Math.round(activeOrderDiscount * 100)

    const isSplitPaymentDisplay =
      !frozen &&
      !!paymentActiveSplit &&
      (activeScreenState === 'payment' ||
        activeScreenState === 'processing' ||
        activeScreenState === 'tip_selection')

    if (isSplitPaymentDisplay) {
      const splitCardBase = Math.round((paymentActiveSplit.amount ?? 0) * 100)
      const splitCashBase = Math.round(
        (paymentActiveSplit.cashAmount ?? paymentActiveSplit.amount ?? 0) * 100
      )
      const splitPreferredBase =
        activePaymentMethod === 'cash' ? splitCashBase : splitCardBase

      cardSubtotal = splitCardBase
      cashSubtotal = splitCashBase
      cardTax = 0
      cashTax = 0
      cardTotal = splitCardBase + displayTipAmount
      cashTotal = splitCashBase + displayTipAmount
      savingsAmount = Math.max(0, cardTotal - cashTotal)
      displayOutstandingTotal = splitPreferredBase + displayTipAmount
      displayAmountPaid = 0
      displayDiscountAmount = 0
    }

    const hasItemsForStabilization = displayItems.length > 0
    const totalsCollapsedToZero =
      !frozen &&
      hasItemsForStabilization &&
      cardSubtotal === 0 &&
      cashSubtotal === 0 &&
      cardTotal === 0 &&
      cashTotal === 0

    if (totalsCollapsedToZero && lastStableLiveTotalsRef.current) {
      const stable = lastStableLiveTotalsRef.current
      cardSubtotal = stable.subtotalCard
      cashSubtotal = stable.subtotalCash
      cardTax = stable.taxCard
      cashTax = stable.taxCash
      cardTotal = stable.totalCard
      cashTotal = stable.totalCash
      savingsAmount = stable.savingsAmount
      displayOutstandingTotal = stable.outstandingTotal
      displayAmountPaid = stable.amountPaid
      displayDiscountAmount = stable.discountAmount
    } else if (
      !frozen &&
      (cardSubtotal > 0 || cashSubtotal > 0 || cardTotal > 0 || cashTotal > 0)
    ) {
      lastStableLiveTotalsRef.current = {
        subtotal: cardSubtotal,
        subtotalCash: cashSubtotal,
        subtotalCard: cardSubtotal,
        discountAmount: displayDiscountAmount,
        taxAmount: cardTax,
        taxCash: cashTax,
        taxCard: cardTax,
        total: cardTotal,
        totalCash: cashTotal,
        totalCard: cardTotal,
        savingsAmount,
        outstandingTotal: displayOutstandingTotal,
        amountPaid: displayAmountPaid
      }
    }

    const params = {
      screenState: activeScreenState || undefined,
      serverName: null,
      customerName: displayCustomerName,
      customerPhone: activeOrder?.customer_phone ?? null,
      orderNumber: displayOrderNumber,
      orderType: displayOrderType,
      tableName: displayTableName,
      guestCount: displayGuestCount,
      items: displayItems,
      subtotal: cardSubtotal,
      subtotalCash: cashSubtotal,
      subtotalCard: cardSubtotal,
      discountAmount: displayDiscountAmount,
      serviceCharge: Math.round((orderTotals?.serviceCharge ?? 0) * 100),
      serviceChargeName: orderTotals?.serviceChargeName ?? null,
      serviceChargeRate: orderTotals?.serviceChargeRate ?? null,
      taxAmount: cardTax,
      taxCash: cashTax,
      taxCard: cardTax,
      tipAmount: displayTipAmount,
      tipPercentage: currentTip.percentage,
      total: cardTotal,
      totalCash: cashTotal,
      totalCard: cardTotal,
      savingsAmount,
      outstandingTotal: displayOutstandingTotal,
      amountPaid: displayAmountPaid,
      paymentMethod: frozen ? frozen.paymentMethod : activePaymentMethod,
      layout: {
        showOrderingRightPanel: showCFDOrderingRightPanel,
        orderingRightPanelMode: cfdOrderingRightPanelMode
      },
      orderingPanelImages: useCFDBuiltinStore.getState().orderingPanelImages,
      tipConfig: tipConfigRef.current ?? undefined,
      loyaltyResult:
        activeScreenState === 'loyalty_confirmation'
          ? useCFDBuiltinStore.getState().loyaltyResult
          : null,
      merchantHasLoyalty,
      pricingDisplayMode: cfdPricingDisplayMode,
      themeMode: colorScheme
    }

    // Structural fingerprint — replaces a per-flush JSON.stringify of the full
    // cart. itemsFingerprint already covers item-level changes; the rest are
    // scalars composed into a single string for cheap equality.
    const wsFingerprint =
      `${itemsFingerprint}|${activeScreenState ?? ''}|${
        activePaymentMethod ?? ''
      }|` +
      `${pathname}|${colorScheme}|${displayCustomerName ?? ''}|` +
      `${activeOrder?.customer_phone ?? ''}|${displayOrderNumber ?? ''}|` +
      `${displayOrderType ?? ''}|${displayTableName ?? ''}|${
        displayGuestCount ?? ''
      }|` +
      `${cardSubtotal}|${cashSubtotal}|${cardTax}|${cashTax}|${cardTotal}|${cashTotal}|` +
      `${displayDiscountAmount}|${orderTotals?.serviceCharge ?? 0}|${displayTipAmount}|${
        currentTip.percentage ?? ''
      }|` +
      `${displayOutstandingTotal}|${displayAmountPaid}|${savingsAmount}|` +
      `${showCFDOrderingRightPanel ? 1 : 0}|${cfdOrderingRightPanelMode}|${
        merchantHasLoyalty ? 1 : 0
      }|${cfdPricingDisplayMode}`

    if (wsFingerprint === lastPayloadHashRef.current) {
      return () => {
        debouncedUpdateRef.current.cancel()
      }
    }

    // Payment state transitions need immediate delivery; ordering state can be debounced
    const isPaymentState =
      activeScreenState === 'payment' ||
      activeScreenState === 'processing' ||
      activeScreenState === 'approved' ||
      activeScreenState === 'declined' ||
      activeScreenState === 'tip_selection' ||
      activeScreenState === 'loyalty_prompt' ||
      activeScreenState === 'loyalty_confirmation'

    if (isPaymentState) {
      debouncedUpdateRef.current.cancel()
      controller.updateOrder(params)
      lastPayloadHashRef.current = wsFingerprint
    } else {
      debouncedUpdateRef.current(controller, params, wsFingerprint)
    }

    return () => {
      debouncedUpdateRef.current.cancel()
    }
    // Intentionally narrowed: activeOrder is read from closure but excluded from
    // deps so unrelated order mutations (status, sync state) don't refire this
    // effect. The granular selectors below cover every field actually used.
    // itemsFingerprint is subsumed by cfdItems (which is memoized on it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isConnected,
    isOrderProcessingIdle,
    activeOrderCustomerName,
    activeOrderCustomerPhone,
    activeOrderDisplayNumber,
    activeOrderOrderNumber,
    activeOrderOrderType,
    activeOrderServiceLocationId,
    activeOrderGuestCount,
    activeOrderAmountPaid,
    cfdItems,
    activeOrderSubtotal,
    activeOrderDiscount,
    activeOrderTax,
    activeOrderTotal,
    activeOrderOutstandingTotal,
    activeOrderOutstandingCash,
    orderTotals,
    currentTip,
    activeScreenState,
    activePaymentMethod,
    baseAmountOverride,
    pathname, // Essential for responding to screen changes
    showCFDOrderingRightPanel,
    cfdOrderingRightPanelMode,
    paymentActiveSplit,
    colorScheme,
    merchantHasLoyalty,
    cfdPricingDisplayMode
  ])

  // ==================== BUILT-IN SECONDARY DISPLAY ====================

  // Check for built-in CFD once on mount (async with cache-first, native-fallback)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      // Try cache first (fast path for subsequent boots)
      let hasCfd = getCachedCapabilities()?.hasBuiltinCfd ?? false

      // If cache miss, detect directly via native module
      if (!hasCfd) {
        const hw = await detectNativeHardware()
        hasCfd = hw?.hasSecondaryDisplay ?? false
      }

      if (mounted) {
        setHasBuiltinCfd(hasCfd)
        if (hasCfd) {
          Log('[Built-in CFD] Detected built-in secondary display')
        }
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Show/dismiss secondary display Presentation (lifecycle only — data flows via Zustand)
  useEffect(() => {
    if (hasBuiltinCfd) {
      showSecondaryDisplay()
    }
    return () => {
      if (hasBuiltinCfd) {
        dismissSecondaryDisplay()
      }
    }
  }, [hasBuiltinCfd])

  // Sync order data to built-in display via useCFDBuiltinStore.
  // Entire effect is wrapped in try-catch: unhandled exceptions here propagate
  // to the native Presentation layer as a JavascriptException, causing Android
  // to show a brief system crash dialog on the secondary display.
  useEffect(() => {
    try {
      if (!hasBuiltinCfd) return
      // Loyalty screens are managed directly — don't overwrite with order sync
      if (
        activeScreenState === 'loyalty_prompt' ||
        activeScreenState === 'loyalty_confirmation'
      )
        return
      if (
        activeScreenStateRef.current === 'loyalty_prompt' ||
        activeScreenStateRef.current === 'loyalty_confirmation'
      )
        return
      // Frozen totals are active — showProcessing/showApproved/showDeclined own the display directly
      if (frozenTotalsRef.current) return

      // Shared helper — see lib/cfdRouting.ts. Floor-plan / waitlist /
      // edit-layout / clean-table are NOT sales context.
      const isSalesScreen = isCFDSalesPathname(pathname)

      // A sale just finished (Done/Skip) but the operator hasn't closed the
      // payment sheet yet. Stay idle and clear the latch once they actually
      // move on. "Moved on" = payment sheet closed, OR they left the sales
      // screen / cleared the order / order-processing went idle.
      //
      // Closing the sheet is the key signal: the latch only exists to avoid
      // flashing order data BEHIND the still-open sheet. Once it's closed, a
      // still-active order on the sales screen should repaint as `ordering`
      // rather than be stranded on branding idle — previously the latch only
      // cleared when the order was emptied (isOrderProcessingIdle requires an
      // empty order), so a live, non-empty order kept the CFD stuck idle.
      if (saleCompletedAwaitingCloseRef.current) {
        if (
          !paymentIsOpen ||
          !isSalesScreen ||
          !activeOrder ||
          isOrderProcessingIdle
        ) {
          saleCompletedAwaitingCloseRef.current = false
        }
      }

      const shouldShowOrderData =
        !saleCompletedAwaitingCloseRef.current &&
        (!!activeScreenState ||
          (isSalesScreen && !!activeOrder && !isOrderProcessingIdle))

      if (!shouldShowOrderData) {
        // Build the idle payload once — used by both the immediate-dispatch
        // (transition from non-idle, e.g. operator navigated away) and the
        // debounced path (already-idle defensive flicker guard).
        const dispatchIdle = () => {
          try {
            const s = activeScreenStateRef.current
            const storeState = useCFDBuiltinStore.getState().screenState
            if (
              s === 'loyalty_prompt' ||
              s === 'loyalty_confirmation' ||
              storeState === 'loyalty_prompt' ||
              storeState === 'loyalty_confirmation'
            ) {
              return
            }
            useCFDBuiltinStore.getState().update({
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
              tipConfig: null,
              paymentMethod: null,
              loyaltyPrompt: null,
              loyaltyResult: null,
              branding: {
                restaurantName: selectedStore?.name ?? '',
                locationCode: selectedStore?.code ?? null,
                logoUrl: organizationLogoUrl,
                primaryColor: '#10b981'
              },
              layout: {
                showOrderingRightPanel: showCFDOrderingRightPanel,
                orderingRightPanelMode: cfdOrderingRightPanelMode
              }
            })
            lastBuiltinScreenStateRef.current = 'idle'
          } catch (err) {
            console.error('[CFD] Builtin idle transition error:', err)
          }
        }

        // Transition from a non-idle state — dispatch immediately. The 500ms
        // debounce was added to debounce flicker between mid-payment swaps;
        // a navigation-driven idle has nothing to flicker against and should
        // feel instant on the secondary display.
        if (lastBuiltinScreenStateRef.current !== 'idle') {
          if (builtinIdleTimerRef.current) {
            clearTimeout(builtinIdleTimerRef.current)
            builtinIdleTimerRef.current = null
          }
          dispatchIdle()
          return () => {
            if (builtinIdleTimerRef.current) {
              clearTimeout(builtinIdleTimerRef.current)
              builtinIdleTimerRef.current = null
            }
          }
        }

        // Already idle — no-op. The store's `update()` already ref-equality
        // checks each field and skips redundant writes, so we don't need a
        // debounce here. Keeping a debounce caused rapid-navigation flicker
        // where pending idle dispatches got cancelled and never fired.
        return
      }

      // Cancel any pending idle transition since we have data to show
      if (builtinIdleTimerRef.current) {
        clearTimeout(builtinIdleTimerRef.current)
        builtinIdleTimerRef.current = null
      }

      const screenState: CFDScreenState = activeScreenState || 'ordering'
      const currentBase = baseAmountOverride ?? activeOrderSubtotal
      let cardSubtotal = Math.round(currentBase * 100)
      let cashSubtotal = Math.round(
        (orderTotals?.cashSubtotal ?? currentBase) * 100
      )
      let cardTax = Math.round(activeOrderTax * 100)
      let cashTax = Math.round((orderTotals?.cashTax ?? activeOrderTax) * 100)
      // Same SC-vs-total divergence fix as the primary path above —
      // prefer orderTotals.total (live calc, SC-inclusive in the same
      // pass as orderTotals.serviceCharge) over the legacy
      // activeOrderTotal store field which lags by one render.
      const liveCardTotal = Math.round(
        ((orderTotals?.total ?? activeOrderTotal) + currentTip.amount) * 100
      )
      const liveCashTotal = Math.round(
        ((orderTotals?.cashTotal ?? activeOrderTotal) + currentTip.amount) * 100
      )

      let cardTotal = liveCardTotal
      let cashTotal = liveCashTotal
      let savingsAmount = Math.max(0, liveCardTotal - liveCashTotal)
      const displayTipAmount = Math.round(currentTip.amount * 100)
      let displayOutstandingTotal = Math.round(
        (activeOrderOutstandingEffective + currentTip.amount) * 100
      )
      let displayAmountPaid = Math.round((activeOrder?.amount_paid ?? 0) * 100)
      let displayDiscountAmount = Math.round(activeOrderDiscount * 100)

      const isSplitPaymentDisplay =
        !!paymentActiveSplit &&
        (activeScreenState === 'payment' ||
          activeScreenState === 'processing' ||
          activeScreenState === 'tip_selection')

      if (isSplitPaymentDisplay) {
        const splitCardBase = Math.round((paymentActiveSplit.amount ?? 0) * 100)
        const splitCashBase = Math.round(
          (paymentActiveSplit.cashAmount ?? paymentActiveSplit.amount ?? 0) *
            100
        )
        const splitPreferredBase =
          activePaymentMethod === 'cash' ? splitCashBase : splitCardBase

        cardSubtotal = splitCardBase
        cashSubtotal = splitCashBase
        cardTax = 0
        cashTax = 0
        cardTotal = splitCardBase + displayTipAmount
        cashTotal = splitCashBase + displayTipAmount
        savingsAmount = Math.max(0, cardTotal - cashTotal)
        displayOutstandingTotal = splitPreferredBase + displayTipAmount
        displayAmountPaid = 0
        displayDiscountAmount = 0
      }

      const hasItemsForStabilization = cfdItems.length > 0
      const totalsCollapsedToZero =
        cardSubtotal === 0 &&
        cashSubtotal === 0 &&
        cardTotal === 0 &&
        cashTotal === 0 &&
        hasItemsForStabilization

      if (totalsCollapsedToZero && lastStableLiveTotalsRef.current) {
        const stable = lastStableLiveTotalsRef.current
        cardSubtotal = stable.subtotalCard
        cashSubtotal = stable.subtotalCash
        cardTax = stable.taxCard
        cashTax = stable.taxCash
        cardTotal = stable.totalCard
        cashTotal = stable.totalCash
        savingsAmount = stable.savingsAmount
        displayOutstandingTotal = stable.outstandingTotal
        displayAmountPaid = stable.amountPaid
        displayDiscountAmount = stable.discountAmount
      }

      // For dine-in orders, resolve the table's display name (not its UUID).
      const builtinTableName = activeOrder?.order_type
        ?.toLowerCase()
        .includes('dine')
        ? resolveTableDisplayName(
            activeOrder?.service_location_id,
            activeOrder?.service_location_name
          )
        : null

      const computedOrderNumber =
        activeOrder?.display_number ?? activeOrder?.order_number ?? null

      const computedPaymentMethod = (
        paymentView === 'cash'
          ? 'cash'
          : paymentView === 'card' || paymentView === 'manual'
          ? 'card'
          : null
      ) as 'cash' | 'card' | 'manual' | null

      // Structural fingerprint — short-circuits the dispatch when nothing the
      // built-in display reads has changed. Computed BEFORE the payload object
      // so we skip the ~30-field allocation entirely on no-op fires (which
      // happen on every keystroke during cart edits).
      const builtinFingerprint =
        `${itemsFingerprint}|${screenState}|${computedPaymentMethod ?? ''}|` +
        `${pathname}|${activeOrderCustomerName ?? ''}|` +
        `${activeOrderCustomerPhone ?? ''}|${computedOrderNumber ?? ''}|` +
        `${activeOrderOrderType ?? ''}|${builtinTableName ?? ''}|` +
        `${activeOrderGuestCount ?? ''}|` +
        `${cardSubtotal}|${cashSubtotal}|${cardTax}|${cashTax}|` +
        `${cardTotal}|${cashTotal}|${displayDiscountAmount}|${orderTotals?.serviceCharge ?? 0}|${displayTipAmount}|` +
        `${currentTip.percentage ?? ''}|${displayOutstandingTotal}|` +
        `${displayAmountPaid}|${savingsAmount}|` +
        `${selectedStore?.name ?? ''}|${selectedStore?.code ?? ''}|` +
        `${organizationLogoUrl ?? ''}|${showCFDOrderingRightPanel ? 1 : 0}|` +
        `${cfdOrderingRightPanelMode}`

      if (builtinFingerprint === lastBuiltinFingerprintRef.current) {
        return
      }

      const updatePayload = {
        screenState,
        serverName: null,
        customerName: activeOrder?.customer_name ?? null,
        customerPhone: activeOrder?.customer_phone ?? null,
        orderNumber: computedOrderNumber,
        orderType: activeOrder?.order_type
          ? getOrderTypeDisplay(activeOrder.order_type)
          : null,
        tableName: builtinTableName,
        guestCount: activeOrder?.guest_count ?? null,
        items: cfdItems,
        subtotal: cardSubtotal,
        subtotalCash: cashSubtotal,
        subtotalCard: cardSubtotal,
        discountAmount: displayDiscountAmount,
        serviceCharge: Math.round((orderTotals?.serviceCharge ?? 0) * 100),
        serviceChargeName: orderTotals?.serviceChargeName ?? null,
        serviceChargeRate: orderTotals?.serviceChargeRate ?? null,
        taxAmount: cardTax,
        taxCash: cashTax,
        taxCard: cardTax,
        tipAmount: displayTipAmount,
        tipPercentage: currentTip.percentage,
        total: cardTotal,
        totalCash: cashTotal,
        totalCard: cardTotal,
        savingsAmount,
        outstandingTotal: displayOutstandingTotal,
        amountPaid: displayAmountPaid,
        layout: {
          showOrderingRightPanel: showCFDOrderingRightPanel,
          orderingRightPanelMode: cfdOrderingRightPanelMode
        },
        orderingPanelImages: useCFDBuiltinStore.getState().orderingPanelImages,
        tipConfig: tipConfigRef.current ?? null,
        branding: {
          restaurantName: selectedStore?.name ?? '',
          locationCode: selectedStore?.code ?? null,
          logoUrl: organizationLogoUrl,
          primaryColor: '#10b981'
        },
        paymentMethod: computedPaymentMethod,
        loyaltyResult: null
      }

      // Payment-related states need immediate updates; ordering states are debounced
      // to batch rapid cart changes and reduce secondary display render pressure.
      const isPaymentState =
        screenState === 'payment' ||
        screenState === 'processing' ||
        screenState === 'approved' ||
        screenState === 'declined' ||
        screenState === 'tip_selection'

      // Bypass debounce on a screenState change so transitions land
      // immediately (idle ↔ ordering, etc. — no perceptible 60ms delay).
      // Same-screen churn (rapid cart edits) still goes through the debounce.
      const isScreenStateTransition =
        screenState !== lastBuiltinScreenStateRef.current

      if (isPaymentState || isScreenStateTransition) {
        debouncedBuiltinUpdateRef.current.cancel()
        // Store mirrors to WebView internally.
        useCFDBuiltinStore.getState().update(updatePayload)
        lastBuiltinFingerprintRef.current = builtinFingerprint
        lastBuiltinScreenStateRef.current = screenState
      } else {
        debouncedBuiltinUpdateRef.current(updatePayload, builtinFingerprint)
      }
    } catch (err) {
      console.error('[CFD] Builtin display sync effect error:', err)
    }
    // Intentionally narrowed — see WebSocket effect above for rationale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasBuiltinCfd,
    isOrderProcessingIdle,
    activeOrderCustomerName,
    activeOrderCustomerPhone,
    activeOrderDisplayNumber,
    activeOrderOrderNumber,
    activeOrderOrderType,
    activeOrderServiceLocationId,
    activeOrderGuestCount,
    activeOrderAmountPaid,
    cfdItems,
    activeOrderSubtotal,
    activeOrderDiscount,
    activeOrderTax,
    activeOrderTotal,
    activeOrderOutstandingTotal,
    activeOrderOutstandingCash,
    // `orderTotals` intentionally NOT in deps: it returns a fresh object on
    // every order mutation (status, sync_version, etc.), defeating the granular
    // selectors above. The body still reads it via closure; it's captured fresh
    // on every render that's actually relevant (items/payments/discount), all
    // of which are already represented in this dep list.
    currentTip,
    activeScreenState,
    activePaymentMethod,
    paymentView,
    baseAmountOverride,
    pathname,
    selectedStore?.name,
    selectedStore?.code,
    organizationLogoUrl,
    showCFDOrderingRightPanel,
    cfdOrderingRightPanelMode,
    paymentActiveSplit,
    paymentIsOpen
  ])

  useEffect(() => {
    if (!paymentIsOpen) {
      // Don't clobber processing/approved/declined — showApproved/showDeclined own their lifecycle
      const current = activeScreenStateRef.current
      if (
        current === 'processing' ||
        current === 'approved' ||
        current === 'declined' ||
        current === 'loyalty_prompt' ||
        current === 'loyalty_confirmation'
      )
        return
      frozenTotalsRef.current = null
      setActiveScreenState(null)
      setActivePaymentMethod(null)
      controllerRef.current?.showIdle()
      return
    }

    if (paymentView === 'card' || paymentView === 'manual') {
      lastShowPaymentAtRef.current = Date.now()
      setActiveScreenState('payment')
      const cfdPaymentMethod = paymentView === 'manual' ? 'manual' : 'card'
      setActivePaymentMethod(cfdPaymentMethod)
      controllerRef.current?.showPayment(cfdPaymentMethod)
    } else if (
      paymentView === 'cash' ||
      paymentView === 'success' ||
      paymentView === 'split-payment-success'
    ) {
      // Cash: tip selection / payment / processing owned by CashPaymentView callbacks
      // Success: owned by showApproved/showDeclined
    } else {
      frozenTotalsRef.current = null
      setActiveScreenState(null)
      setActivePaymentMethod(null)
    }
  }, [paymentIsOpen, paymentView])

  // ==================== EXPOSED METHODS ====================

  const showTipSelection = useCallback(
    (
      baseAmount?: number,
      presetPercentages?: number[],
      paymentMethod?: 'cash' | 'card' | 'manual'
    ) => {
      // New payment activity — release any prior sale-completed latch.
      saleCompletedAwaitingCloseRef.current = false
      const currentBase = baseAmount ?? activeOrderSubtotal
      setBaseAmountOverride(baseAmount ?? null)
      setActiveScreenState('tip_selection')
      setActivePaymentMethod(paymentMethod ?? null)

      const config = {
        subtotalForTip: Math.round(currentBase * 100), // CONVERT TO CENTS
        presetPercentages: presetPercentages || tipPresetPercentages,
        allowCustom: tipsConfig.allowCustom ?? true,
        maxTipPercentage: tipsConfig.maxTipPercentage ?? 100,
      }
      tipConfigRef.current = config
      controllerRef.current?.showTipSelection(
        config.subtotalForTip,
        config.presetPercentages
      )
      // Write directly to the built-in store too. The post-auth tip-adjust
      // path runs while `frozenTotalsRef` is still set from showProcessing,
      // which makes the builtin sync effect early-return — so the WebView
      // would otherwise stay stuck on the processing screen.
      useCFDBuiltinStore.getState().update({
        screenState: 'tip_selection',
        tipConfig: config,
        paymentMethod: paymentMethod ?? null
      })
    },
    [activeOrderSubtotal, tipPresetPercentages, tipsConfig.allowCustom]
  )

  const updateTip = useCallback((amount: number, percentage: number | null) => {
    setCurrentTip({ amount, percentage })

    const frozen = frozenTotalsRef.current
    if (frozen) {
      const nextTipAmount = Math.round(amount * 100)
      const baseCardTotal = Math.max(0, frozen.totalCard - frozen.tipAmount)
      const baseCashTotal = Math.max(0, frozen.totalCash - frozen.tipAmount)

      frozenTotalsRef.current = {
        ...frozen,
        tipAmount: nextTipAmount,
        total: baseCardTotal + nextTipAmount,
        totalCard: baseCardTotal + nextTipAmount,
        totalCash: baseCashTotal + nextTipAmount
      }
    }
  }, [])

  const setBaseAmount = useCallback((amount: number | null) => {
    setBaseAmountOverride(amount)
  }, [])

  const setScreenState = useCallback((state: CFDScreenState | null) => {
    setActiveScreenState(state)
    if (state === null) {
      frozenTotalsRef.current = null
      setActivePaymentMethod(null)
    }
  }, [])

  const clearTipResponse = useCallback(() => {
    setTipResponse(null)
  }, [])

  const showPayment = useCallback(
    (paymentMethod?: 'cash' | 'card' | 'manual') => {
      // New payment activity — release any prior sale-completed latch.
      saleCompletedAwaitingCloseRef.current = false
      lastShowPaymentAtRef.current = Date.now()
      setActiveScreenState('payment')
      setActivePaymentMethod(paymentMethod ?? null)
      controllerRef.current?.showPayment(paymentMethod)
    },
    []
  )

  const showProcessing = useCallback(
    (
      paymentMethod?: 'cash' | 'card' | 'manual',
      tipAmountOverride?: number
    ) => {
      const tipDollars =
        tipAmountOverride !== undefined ? tipAmountOverride : currentTip.amount
      const tipAmt = Math.round(tipDollars * 100)
      const splitCardBase = paymentActiveSplit
        ? Math.round((paymentActiveSplit.amount ?? 0) * 100)
        : null
      const splitCashBase = paymentActiveSplit
        ? Math.round(
            (paymentActiveSplit.cashAmount ?? paymentActiveSplit.amount ?? 0) *
              100
          )
        : null
      const isSplitFlow = splitCardBase !== null && splitCashBase !== null
      const cardBaseTotal = isSplitFlow
        ? splitCardBase
        : Math.round(activeOrderTotal * 100)
      const cashBaseTotal = isSplitFlow
        ? splitCashBase
        : Math.round((orderTotals?.cashTotal ?? activeOrderTotal) * 100)
      const selectedPaymentMethod = paymentMethod ?? activePaymentMethod
      const outstandingBase = isSplitFlow
        ? selectedPaymentMethod === 'cash'
          ? splitCashBase
          : splitCardBase
        : Math.round(activeOrderOutstandingEffective * 100)
      const cardTotal = cardBaseTotal + tipAmt
      const cashTotal = cashBaseTotal + tipAmt
      const savings = Math.max(0, cardTotal - cashTotal)
      const frozen = {
        subtotal: isSplitFlow
          ? cardBaseTotal
          : Math.round((baseAmountOverride ?? activeOrderSubtotal) * 100),
        subtotalCard: isSplitFlow
          ? cardBaseTotal
          : Math.round((baseAmountOverride ?? activeOrderSubtotal) * 100),
        subtotalCash: isSplitFlow
          ? cashBaseTotal
          : Math.round(
              (orderTotals?.cashSubtotal ??
                baseAmountOverride ??
                activeOrderSubtotal) * 100
            ),
        discountAmount: isSplitFlow ? 0 : Math.round(activeOrderDiscount * 100),
        taxAmount: isSplitFlow ? 0 : Math.round(activeOrderTax * 100),
        taxCash: isSplitFlow
          ? 0
          : Math.round((orderTotals?.cashTax ?? activeOrderTax) * 100),
        taxCard: isSplitFlow ? 0 : Math.round(activeOrderTax * 100),
        total: cardTotal,
        totalCard: cardTotal,
        totalCash: cashTotal,
        tipAmount: tipAmt,
        savingsAmount: savings,
        outstandingTotal: outstandingBase + tipAmt,
        amountPaid: isSplitFlow
          ? 0
          : Math.round((activeOrder?.amount_paid ?? 0) * 100),
        paymentMethod: paymentMethod ?? null,
        localOrderId: activeOrder?.id ?? activeOrderIdRef.current ?? null,
        dbOrderId: activeOrder?.db_order_id ?? null,
        customerId: activeOrder?.customer_id ?? null,
        customerPhone: activeOrder?.customer_phone ?? null,
        customerName: activeOrder?.customer_name ?? null,
        orderNumber:
          activeOrder?.display_number ?? activeOrder?.order_number ?? null,
        orderType: activeOrder?.order_type
          ? getOrderTypeDisplay(activeOrder.order_type)
          : null,
        tableName: activeOrder?.order_type?.toLowerCase().includes('dine')
          ? resolveTableDisplayName(
              activeOrder?.service_location_id,
              activeOrder?.service_location_name
            )
          : null,
        guestCount: activeOrder?.guest_count ?? null,
        items: cfdItems
      }
      frozenTotalsRef.current = frozen

      // Write directly to builtin store immediately — don't wait for React re-render
      if (hasBuiltinCfd) {
        useCFDBuiltinStore.getState().update({
          screenState: 'processing',
          total: cardTotal,
          totalCard: cardTotal,
          totalCash: cashTotal,
          tipAmount: tipAmt,
          savingsAmount: savings,
          outstandingTotal: frozen.outstandingTotal,
          amountPaid: frozen.amountPaid,
          paymentMethod: paymentMethod ?? null
        })
      }

      setActiveScreenState('processing')
      setActivePaymentMethod(paymentMethod ?? null)
      controllerRef.current?.showProcessing(paymentMethod, frozen)
    },
    [
      activeOrder,
      activeOrderDiscount,
      activeOrderOutstandingTotal,
      activeOrderOutstandingCash,
      activeOrderSubtotal,
      activeOrderTax,
      activeOrderTotal,
      activePaymentMethod,
      baseAmountOverride,
      cfdItems,
      currentTip,
      hasBuiltinCfd,
      orderTotals,
      paymentActiveSplit
    ]
  )

  const showApproved = useCallback(() => {
    const frozen = frozenTotalsRef.current
    if (hasBuiltinCfd && frozen) {
      useCFDBuiltinStore.getState().update({
        screenState: 'approved',
        total: frozen.total,
        totalCard: frozen.totalCard,
        totalCash: frozen.totalCash,
        tipAmount: frozen.tipAmount,
        savingsAmount: frozen.savingsAmount,
        paymentMethod: frozen.paymentMethod
      })
    }
    setActiveScreenState('approved')
    controllerRef.current?.showApproved(
      frozen
        ? {
            total: frozen.total,
            totalCard: frozen.totalCard,
            totalCash: frozen.totalCash,
            tipAmount: frozen.tipAmount,
            savingsAmount: frozen.savingsAmount,
            paymentMethod: frozen.paymentMethod
          }
        : undefined
    )
  }, [hasBuiltinCfd])

  const showDeclined = useCallback(() => {
    const frozen = frozenTotalsRef.current
    if (hasBuiltinCfd && frozen) {
      useCFDBuiltinStore.getState().update({
        screenState: 'declined',
        total: frozen.total,
        totalCard: frozen.totalCard,
        totalCash: frozen.totalCash,
        tipAmount: frozen.tipAmount,
        savingsAmount: frozen.savingsAmount,
        paymentMethod: frozen.paymentMethod
      })
    }
    setActiveScreenState('declined')
    controllerRef.current?.showDeclined(
      frozen
        ? {
            total: frozen.total,
            totalCard: frozen.totalCard,
            totalCash: frozen.totalCash,
            tipAmount: frozen.tipAmount,
            savingsAmount: frozen.savingsAmount,
            paymentMethod: frozen.paymentMethod
          }
        : undefined
    )
  }, [hasBuiltinCfd])

  const showIdle = useCallback(() => {
    // If a showPayment was called very recently (e.g. next view mounting), don't clobber it
    if (Date.now() - lastShowPaymentAtRef.current < 150) return
    loyaltyFlowRequestIdRef.current += 1
    frozenTotalsRef.current = null
    setActiveScreenState(null)
    setActivePaymentMethod(null)
    setBaseAmountOverride(null)
    setCurrentTip({ amount: 0, percentage: null })
    controllerRef.current?.showIdle()
    // Eagerly clear loyalty fields from the builtin store so a snapshot
    // push (e.g., WebView re-ready) can't repaint a stale loyalty
    // screen between this call and the BUILTIN sync effect catching up.
    // Without this, the operator sees a brief "flash back" of the
    // loyalty screen after pressing Start New Order.
    const builtin = useCFDBuiltinStore.getState()
    if (
      builtin.screenState === 'loyalty_prompt' ||
      builtin.screenState === 'loyalty_confirmation' ||
      builtin.loyaltyResult ||
      builtin.loyaltyPrompt
    ) {
      builtin.update({
        screenState: 'idle',
        loyaltyResult: null,
        loyaltyPrompt: null
      })
    }
  }, [])

  const finishLoyaltyFlow = useCallback(
    (source: string) => {
      const currentPathname = pathnameRef.current
      const currentlyOrderProcessingIdle = isOrderProcessingIdleRef.current

      merchantClosedDuringLoyaltyRef.current = false
      // Latch so the order-sync effect doesn't repaint `ordering` while the
      // operator's payment sheet is still open behind the approved screen.
      saleCompletedAwaitingCloseRef.current = true
      frozenTotalsRef.current = null
      activeScreenStateRef.current = null
      setActiveScreenState(null)
      setActivePaymentMethod(null)
      setBaseAmountOverride(null)
      setCurrentTip({ amount: 0, percentage: null })

      logLoyaltyTrace(`${source}:finish`, {
        to: 'idle',
        pathname: currentPathname,
        hasActiveOrder: !!activeOrderRef.current,
        isOrderProcessingIdle: currentlyOrderProcessingIdle
      })

      // Always return to idle/branding once the sale is done, regardless of
      // whether the operator still has a live order open on the sales screen.
      showIdle()
    },
    [showIdle]
  )

  const clearLoyaltyTimer = useCallback(() => {
    if (!loyaltyTimerRef.current) return
    clearTimeout(loyaltyTimerRef.current)
    loyaltyTimerRef.current = null
  }, [])

  // ==================== POST-CAPTURE TIP-ADJUST RUNNER ====================
  //
  // Lives on CFDProvider (always mounted) instead of CardPaymentView (often
  // unmounted between Castles sale and the customer picking a tip on the
  // CFD WebView). Reads the captured payment from `useTipAdjustStore` so
  // the bottom sheet collapsing doesn't strand the customer's tip.
  //
  // Triggers on every `tipResponse` arrival. Dedups via the store's
  // atomic startInFlight() so a duplicate setTipResponse can't double-run.
  const runPostCaptureTipAdjust = useCallback(
    async (response: CFDTipResponse) => {
      const captured = useTipAdjustStore.getState().captured
      if (!captured) {
        console.warn(
          '[CFD tip-adjust] tipResponse arrived but no captured payment — ignoring'
        )
        setTipResponse(null)
        return
      }
      // ATOM uses TIP-BEFORE-SALE — the tip is baked into the single
      // immediate-capture /authorize, so there is no post-capture adjust.
      // Guard-off here so a stale ATOM `captured` row (e.g. mid-upgrade) can
      // never fall through to another terminal's branch below.
      if (captured.terminalType === 'atom') {
        console.log('[CFD tip-adjust] ATOM is tip-before-sale — no post-capture adjust')
        useTipAdjustStore.getState().clear()
        setTipResponse(null)
        return
      }
      if (!useTipAdjustStore.getState().startInFlight()) {
        console.log('[CFD tip-adjust] already in flight, ignoring duplicate')
        return
      }

      const customerTipCents = response.tipAmount
      const customerTip = customerTipCents / 100
      const posTip = captured.tipAmount

      console.log('[CFD tip-adjust] start', {
        customerTip,
        posTip,
        terminalType: captured.terminalType,
        rrn: captured.rrn,
        dbPaymentId: captured.dbPaymentId
      })

      updateTip(customerTip, response.tipPercentage)
      showProcessing('card', customerTip)
      setTipResponse(null)

      // Same-tip skip: nothing to adjust on terminal, just persist if needed.
      if (Math.abs(customerTip - posTip) < 0.01) {
        console.log('[CFD tip-adjust] same tip — skipping terminal adjust')
        showApproved()
        useTipAdjustStore.getState().finishInFlight()
        return
      }

      const terminal =
        useStoreSettingsStore.getState().selectedStation?.payment_terminal
      if (!terminal) {
        console.error('[CFD tip-adjust] no terminal configured')
        showApproved()
        useTipAdjustStore.getState().finishInFlight()
        return
      }

      // Settle delay: the terminal needs ~1.5s after the original sale
      // completes before it can accept another command. Without this
      // buffer, instant back-to-back sale + tipAdjust crashes Castles
      // C20Pro / Landi units (terminal is still in "Approved"
      // post-display when we hit it). The host previously got this for
      // free via React render scheduling between the sale-completion
      // effect and the tip-adjust effect; routing through CFDProvider
      // removes that natural gap so we add it explicitly.
      console.log('[CFD tip-adjust] settling 1.5s before terminal command')
      await new Promise<void>(resolve => setTimeout(resolve, 1500))

      let terminalTipAdjustSucceeded = false
      try {
        if (captured.terminalType === 'castles') {
          const service = getSharedCastlesService()
          const isUsb = terminal.connection_type === 'usb'
          const host = isUsb ? undefined : terminal.ip_address
          if (!isUsb && !host) throw new Error('Castles terminal has no IP')
          const port = isUsb ? undefined : (terminal.port ?? CASTLES_DEFAULT_PORT)
          await service.connect({
            connectionType: isUsb ? 'usb' : 'local_socket',
            host,
            port,
            timeout: 120_000,
            terminalId: terminal.id
          })
          await service.resetTerminalState()

          const counter = getOrCreateCounter({
            terminalId: terminal.id,
            supabaseClient: supabase
          })
          if (!counter.isInitialized) await counter.initialize()
          const adjustRefId = counter.next()

          if (!captured.rrn) {
            console.warn(
              '[CFD tip-adjust] cannot tip adjust — missing RRN from original sale'
            )
            toastService.show({
              type: 'warning',
              title: 'Tip Adjust Skipped',
              message:
                'Missing RRN from original sale — tip adjust requires manual entry on terminal.'
            })
          } else {
            const result = await service.tipAdjust({
              tipAmount: customerTip,
              rrn: captured.rrn,
              referenceId: adjustRefId
            })
            if (!result.success) {
              console.error(
                '[CFD tip-adjust] Castles tip adjust failed:',
                result.error
              )
              toastService.show({
                type: 'error',
                title: 'Tip Adjust Failed',
                message: result.error || 'Terminal rejected tip adjustment.'
              })
            } else {
              terminalTipAdjustSucceeded = true
              console.log('[CFD tip-adjust] Castles tip adjust ok')
            }
          }
        } else if (captured.terminalType === 'valor') {
          const service = getSharedValorService()
          const isUsb = terminal.connection_type === 'usb'
          const host = isUsb ? undefined : terminal.ip_address
          if (!isUsb && !host) throw new Error('Valor terminal has no IP')
          const port = isUsb ? undefined : (terminal.port ?? VALOR_DEFAULT_PORT)
          await service.connect({
            connectionType: isUsb ? 'usb' : 'local_socket',
            host,
            port,
            cancelPort: terminal.cancel_port,
            epi: terminal.epi,
            timeout: 120_000,
            terminalId: terminal.id
          })

          const counter = getOrCreateValorCounter({
            terminalId: terminal.id,
            supabaseClient: supabase
          })
          if (!counter.isInitialized) await counter.initialize()
          const adjustRefId = counter.next()

          // Valor tip-adjust references the original by TRAN_NO (or CARD_NO
          // last-4) — NOT rrn/stan. Amount is integer cents.
          const tranNo = captured.tranNo
          const cardNo = captured.last4
          if (!tranNo && !cardNo) {
            console.warn(
              '[CFD tip-adjust] cannot tip adjust — missing TRAN_NO/card from original sale'
            )
            toastService.show({
              type: 'warning',
              title: 'Tip Adjust Skipped',
              message:
                'Missing transaction reference — tip adjust requires manual entry on terminal.'
            })
          } else {
            const result = await service.tipAdjust({
              tipAmount: Math.round((customerTip + Number.EPSILON) * 100),
              tranNo,
              cardNo,
              referenceId: adjustRefId
            })
            if (!result.success) {
              console.error(
                '[CFD tip-adjust] Valor tip adjust failed:',
                result.error
              )
              toastService.show({
                type: 'error',
                title: 'Tip Adjust Failed',
                message: result.error || 'Terminal rejected tip adjustment.'
              })
            } else {
              terminalTipAdjustSucceeded = true
              console.log('[CFD tip-adjust] Valor tip adjust ok')
            }
          }
        } else {
          const api = new DejavooSpinAPI(supabase)
          await api.loadTerminal(terminal.id || '', terminal)
          const result = await api
            .tipAdjust()
            .amount(captured.amount)
            .tipAmount(customerTip)
            .referenceId(captured.referenceId)
            .execute()
          if (!result.success) {
            console.error(
              '[CFD tip-adjust] Dejavoo tip adjust failed:',
              result.error
            )
          } else {
            terminalTipAdjustSucceeded = true
            console.log('[CFD tip-adjust] Dejavoo tip adjust ok')
          }
        }

        // Terminal didn't accept the tip — skip DB write, optimistic patch,
        // and totals update so the system doesn't show a tip that was never
        // actually adjusted on the terminal. `finally` still runs to show
        // the approved screen and clear the in-flight flag.
        if (!terminalTipAdjustSucceeded) {
          console.warn(
            '[CFD tip-adjust] terminal adjust did not succeed — skipping persist/patch'
          )
          return
        }

        // ─── Resolve target order from the captured snapshot ───
        // Use the ids snapshotted at sale-completion time (CardPaymentView
        // setCaptured). Falling back to live lookup only if the snapshot
        // missed db_order_id (offline-first creation race).
        const targetDbOrderId =
          captured.dbOrderId ??
          (captured.localOrderId
            ? useOrderStore.getState().ordersById[captured.localOrderId]
                ?.db_order_id
            : undefined)
        const targetLocalOrderId = captured.localOrderId ?? targetDbOrderId

        // ─── Resolve db_payment_id from the live order ───
        //
        // `addPaymentToOrder` returns boolean, NOT the dbPaymentId, so
        // `captured.dbPaymentId` from CardPaymentView is always
        // undefined. The real id lives on the order's last payment
        // once `syncPaymentToBackend` finishes. The 1.5s settle delay
        // before this point usually covers that, but we poll briefly
        // (up to ~3s additional) in case the backend round-trip is slow
        // — better than silently dropping the DB write.
        const findLatestPayment = (): {
          payment: any
          paymentIndex: number
          orderKey: string | undefined
        } => {
          const orderState = useOrderStore.getState()
          const localKey =
            (targetDbOrderId
              ? orderState.dbOrderIdIndex[targetDbOrderId]
              : undefined) ??
            targetLocalOrderId ??
            undefined
          const activeOrder = localKey
            ? orderState.ordersById[localKey]
            : undefined
          const prevOrder = targetLocalOrderId
            ? usePreviousOrdersStore.getState().getOrderById(targetLocalOrderId)
            : targetDbOrderId
            ? usePreviousOrdersStore.getState().getOrderById(targetDbOrderId)
            : undefined
          const payments: any[] =
            activeOrder?.payments ?? prevOrder?.payments ?? []
          // The post-capture sale appended its payment last; that's
          // the one to adjust. Skip voided entries from the tail.
          let idx = payments.length - 1
          while (idx >= 0 && payments[idx]?.isVoided) idx -= 1
          return {
            payment: idx >= 0 ? payments[idx] : null,
            paymentIndex: idx,
            orderKey: localKey
          }
        }

        let resolvedDbPaymentId: string | undefined
        let latest = findLatestPayment()
        for (let attempt = 0; attempt < 6; attempt += 1) {
          if (latest.payment?.db_payment_id) {
            resolvedDbPaymentId = latest.payment.db_payment_id
            break
          }
          await new Promise(r => setTimeout(r, 500))
          latest = findLatestPayment()
        }
        if (!resolvedDbPaymentId) {
          console.warn(
            '[CFD tip-adjust] db_payment_id still null after polling — ' +
              'payment sync slow or offline. Will optimistic-patch and skip DB write.'
          )
        }

        // ─── Persist to DB with safe fallback ───
        // Mirrors hooks/orders/useTipAdjustMutation.ts:170-192. Any
        // failure (network, RPC, or simply missing ids during
        // offline-first sync) is queued via the existing
        // tip_adjust_db offline-op handler so it retries when ids
        // resolve / connectivity returns.
        const { loggedInEmployee } = useEmployeeStore.getState()
        const dbAdjustments: TipAdjustment[] = resolvedDbPaymentId
          ? [
              {
                payment_id: resolvedDbPaymentId,
                new_tip_amount: customerTip
              }
            ]
          : []

        let dbPersistFailed = false
        if (targetDbOrderId && dbAdjustments.length > 0) {
          console.log('[CFD tip-adjust] DB write attempt', {
            dbOrderId: targetDbOrderId,
            dbPaymentId: resolvedDbPaymentId,
            newTip: customerTip,
            staffId: loggedInEmployee?.profileId
          })
          try {
            await adjustTips(
              supabase,
              targetDbOrderId,
              dbAdjustments,
              loggedInEmployee?.profileId
            )
            console.log('[CFD tip-adjust] DB write ok')
          } catch (dbErr) {
            console.warn(
              '[CFD tip-adjust] DB write failed — queuing for retry:',
              dbErr
            )
            dbPersistFailed = true
            try {
              await queueFailedOperation(
                'tip_adjust_db',
                {
                  dbOrderId: targetDbOrderId,
                  dbAdjustments,
                  staffId: loggedInEmployee?.profileId
                },
                targetLocalOrderId ?? targetDbOrderId
              )
            } catch (queueErr) {
              console.error(
                '[CFD tip-adjust] queueFailedOperation also failed:',
                queueErr
              )
            }
          }
        } else {
          console.warn('[CFD tip-adjust] DB write SKIPPED — missing ids', {
            targetDbOrderId,
            resolvedDbPaymentId,
            capturedLocalOrderId: captured.localOrderId,
            capturedDbOrderId: captured.dbOrderId,
            paymentsOnOrder: latest.paymentIndex >= 0
          })
          // Best-effort: even without dbPaymentId now, retry handler may
          // resolve it later when sync settles. Only queue if we at
          // least have an order id.
          if (targetDbOrderId && resolvedDbPaymentId) {
            try {
              await queueFailedOperation(
                'tip_adjust_db',
                {
                  dbOrderId: targetDbOrderId,
                  dbAdjustments: [
                    {
                      payment_id: resolvedDbPaymentId,
                      new_tip_amount: customerTip
                    }
                  ],
                  staffId: loggedInEmployee?.profileId
                },
                targetLocalOrderId ?? 'unknown'
              )
              dbPersistFailed = true
            } catch (queueErr) {
              console.error(
                '[CFD tip-adjust] queueFailedOperation failed:',
                queueErr
              )
            }
          }
        }

        // ─── Optimistic patch into local order stores ───
        // Same shape as useTipAdjustMutation's patch. We match the
        // payment by INDEX (last non-voided), not by db_payment_id —
        // because if the payment hasn't synced yet, db_payment_id is
        // null on every entry and equality matches everything. The
        // post-capture sale always appended its payment last, so the
        // tail is the right target.
        if (targetLocalOrderId && latest.paymentIndex >= 0) {
          try {
            const orderState = useOrderStore.getState()
            const localKey =
              orderState.dbOrderIdIndex[targetDbOrderId ?? ''] ??
              targetLocalOrderId
            const activeOrder = orderState.ordersById[localKey]
            const prevOrder =
              usePreviousOrdersStore
                .getState()
                .getOrderById(targetLocalOrderId) ??
              (targetDbOrderId
                ? usePreviousOrdersStore
                    .getState()
                    .getOrderById(targetDbOrderId)
                : undefined)

            const currentPayments =
              activeOrder?.payments || prevOrder?.payments || []
            const patchedPayments = currentPayments.map((p: any, idx) => {
              if (idx !== latest.paymentIndex) return p
              return {
                ...p,
                tip_amount: customerTip,
                total_collected: (p.amount ?? 0) + customerTip,
                original_tip_amount: p.original_tip_amount ?? p.tip_amount ?? 0,
                tip_adjusted_at: new Date().toISOString(),
                tip_adjusted_by: loggedInEmployee?.profileId ?? undefined
              }
            })

            applyOptimisticPatch(
              targetLocalOrderId,
              targetDbOrderId,
              { payments: patchedPayments },
              { payments: patchedPayments }
            )
            console.log('[CFD tip-adjust] optimistic patch applied', {
              paymentIndex: latest.paymentIndex,
              dbPaymentId: resolvedDbPaymentId ?? null
            })
          } catch (patchErr) {
            console.warn('[CFD tip-adjust] optimistic patch failed:', patchErr)
            // Non-fatal — the queued retry + background sync will reconcile.
          }
        }

        usePaymentStore.setState(state => {
          if (state.completedPaymentInfo) {
            return {
              completedPaymentInfo: {
                ...state.completedPaymentInfo,
                totalTips: customerTip
              }
            }
          }
          return state
        })

        console.log(
          `[CFD tip-adjust] complete: $${posTip} → $${customerTip}` +
            (dbPersistFailed ? ' (DB queued for retry)' : '')
        )
      } catch (err) {
        console.error('[CFD tip-adjust] runner error:', err)
      } finally {
        showApproved()
        useTipAdjustStore.getState().finishInFlight()
      }
    },
    [showApproved, showProcessing, supabase, updateTip]
  )

  // Effect: dispatch the runner whenever a tip arrives. Runs even if
  // CardPaymentView has unmounted, since this provider is mounted at the
  // app root.
  useEffect(() => {
    if (!tipResponse) return
    void runPostCaptureTipAdjust(tipResponse)
  }, [tipResponse, runPostCaptureTipAdjust])

  const clearResultAutoIdleTimer = useCallback(() => {
    if (!resultAutoIdleTimerRef.current) return
    clearTimeout(resultAutoIdleTimerRef.current)
    resultAutoIdleTimerRef.current = null
  }, [])

  // When the operator navigates AWAY from a sales screen while a result-state
  // auto-idle timer is in flight (4s for `approved`, 3s for `declined`, 6s
  // for `loyalty_confirmation`), cancel the timer immediately and clear
  // `activeScreenState` so the builtin sync effect transitions to idle on
  // the next tick. Without this, the CFD would keep showing the previous
  // screen for up to ~4s after the operator's already moved on.
  useEffect(() => {
    if (isCFDSalesPathname(pathname)) return
    const stuck = activeScreenStateRef.current
    if (
      stuck === 'approved' ||
      stuck === 'declined' ||
      stuck === 'loyalty_confirmation'
    ) {
      clearResultAutoIdleTimer()
      clearLoyaltyTimer()
      frozenTotalsRef.current = null
      setActiveScreenState(null)
    }
  }, [pathname, clearResultAutoIdleTimer, clearLoyaltyTimer])

  // Loyalty screens (prompt + confirmation) are now MANUAL-ONLY: no auto-idle
  // timer. The customer must press Skip / submit a phone, or the operator
  // must move on (next sale, navigate away) — the screen stays visible until
  // then. Removes the previous 6s countdown that would dismiss the screen
  // mid-input or before the customer finished reading the rewards summary.
  //
  // The function is kept (rather than removing all callers) so existing
  // call sites remain valid; it just clears any stale timer and exits.
  const scheduleLoyaltyReturnToIdle = useCallback(
    (requestId: number, traceStage: string, timeoutMs = 3000) => {
      clearLoyaltyTimer()
      loyaltyTimerRef.current = setTimeout(() => {
        if (requestId !== loyaltyFlowRequestIdRef.current) return
        loyaltyTimerRef.current = null
        logLoyaltyTrace(`${traceStage}:auto-idle`)
        finishLoyaltyFlow(traceStage)
      }, timeoutMs)
    },
    [clearLoyaltyTimer, finishLoyaltyFlow]
  )

  const earnLoyaltyWithReadiness = useCallback(
    async ({
      dbOrderId,
      requestId,
      traceStage,
      maxAttempts = 8
    }: {
      dbOrderId: string
      requestId?: number
      traceStage: string
      maxAttempts?: number
    }): Promise<LoyaltyEarnResult[]> => {
      let results: LoyaltyEarnResult[] = []

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (
          requestId !== undefined &&
          requestId !== loyaltyFlowRequestIdRef.current
        ) {
          return []
        }

        const { data: orderRow, error: orderRowError } = await supabase
          .from('orders')
          .select('status, customer_id, completed_at')
          .eq('id', dbOrderId)
          .maybeSingle()

        if (orderRowError) {
          logLoyaltyTrace(`${traceStage}:order-read-error`, {
            requestId: requestId ?? null,
            attempt: attempt + 1,
            message: orderRowError.message
          })
        }

        const row = (orderRow as any) ?? null
        const isCompleted = row?.status === 'completed' || !!row?.completed_at
        const hasCustomerId = !!row?.customer_id

        logLoyaltyTrace(`${traceStage}:order-readiness`, {
          requestId: requestId ?? null,
          attempt: attempt + 1,
          status: row?.status ?? null,
          hasCustomerId,
          hasCompletedAt: !!row?.completed_at,
          isCompleted
        })

        if (!isCompleted || !hasCustomerId) {
          if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 900))
            continue
          }
        }

        try {
          results = await earnLoyaltyForOrder(dbOrderId, supabase)
          logLoyaltyTrace(`${traceStage}:earn-attempt`, {
            requestId: requestId ?? null,
            attempt: attempt + 1,
            resultCount: results.length
          })
        } catch (earnErr) {
          const message =
            earnErr instanceof Error ? earnErr.message : String(earnErr)
          logLoyaltyTrace(`${traceStage}:earn-error`, {
            requestId: requestId ?? null,
            attempt: attempt + 1,
            message
          })
          if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 900))
            continue
          }
          return []
        }

        if (results.length > 0) return results
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 900))
        }
      }

      return results
    },
    [supabase]
  )

  const queueDeferredLoyaltyEarn = useCallback(
    async ({
      order,
      frozen,
      fallbackCustomerName,
      fallbackCustomerPhone,
      fallbackCustomerId
    }: {
      order: any
      frozen: any
      fallbackCustomerName?: string
      fallbackCustomerPhone?: string
      fallbackCustomerId?: string
    }) => {
      const localOrderId =
        order?.id ?? activeOrderIdRef.current ?? frozen?.localOrderId ?? null
      const dbOrderId = order?.db_order_id ?? frozen?.dbOrderId ?? null

      if (!localOrderId && !dbOrderId) {
        logLoyaltyTrace('deferred-earn:skip-no-order-identity')
        return
      }

      const dedupeKey = localOrderId || dbOrderId
      if (dedupeKey && queuedLoyaltyOrderIdsRef.current.has(dedupeKey)) {
        logLoyaltyTrace('deferred-earn:skip-already-queued', { dedupeKey })
        return
      }

      const customerName =
        fallbackCustomerName ??
        order?.customer_name ??
        frozen?.customerName ??
        null
      const customerPhone =
        fallbackCustomerPhone ??
        order?.customer_phone ??
        frozen?.customerPhone ??
        null
      const customerId =
        fallbackCustomerId ?? order?.customer_id ?? frozen?.customerId ?? null

      const queuedId = await queueOperation({
        type: 'earn_loyalty',
        params: {
          local_order_id: localOrderId,
          db_order_id: dbOrderId,
          customer_id: customerId,
          customer_phone: customerPhone,
          customer_name: customerName,
          merchant_id: selectedStore?.merchant_id ?? null
        },
        localOrderId: localOrderId || dbOrderId,
        contextSnapshot: {
          source: 'cfd_loyalty_fallback',
          customer_id: customerId,
          customer_phone: customerPhone,
          customer_name: customerName
        }
      })

      if (dedupeKey) queuedLoyaltyOrderIdsRef.current.add(dedupeKey)
      logLoyaltyTrace('deferred-earn:queued', {
        queuedId,
        localOrderId,
        dbOrderId,
        hasCustomerId: !!customerId,
        hasCustomerPhone: !!customerPhone
      })
    },
    [selectedStore?.merchant_id]
  )

  const showLoyaltyPrompt = useCallback(() => {
    // Kill switch — bail to idle so no caller can drag the CFD into
    // the loyalty path while it's being stabilized.
    if (cfdLoyaltyDisabled) {
      console.log('[CFD] showLoyaltyPrompt skipped — loyalty disabled flag')
      clearResultAutoIdleTimer()
      controllerRef.current?.showIdle()
      setActiveScreenState(null)
      return
    }
    clearResultAutoIdleTimer()
    const currentScreenState = activeScreenStateRef.current
    if (
      currentScreenState === 'loyalty_prompt' ||
      currentScreenState === 'loyalty_confirmation'
    ) {
      return
    }

    const requestId = ++loyaltyFlowRequestIdRef.current
    const order = activeOrderRef.current
    const frozen = frozenTotalsRef.current
    const dbOrderId = order?.db_order_id ?? frozen?.dbOrderId ?? null
    const candidateCustomerId = order?.customer_id ?? frozen?.customerId ?? ''
    const candidatePhone =
      order?.customer_phone?.replace(/\D/g, '') ??
      frozen?.customerPhone?.replace(/\D/g, '') ??
      ''
    const candidateCustomerName =
      order?.customer_name ?? frozen?.customerName ?? undefined
    const hasKnownCustomerContext =
      !!candidateCustomerName ||
      isValidUUID(candidateCustomerId) ||
      candidatePhone.length >= 10
    const merchantId = selectedStore?.merchant_id
    const shouldAttemptSilentAuto = !!dbOrderId
    let hasShownPhonePrompt = false
    logLoyaltyTrace('show-loyalty-prompt:start', {
      requestId,
      currentScreenState,
      dbOrderId,
      shouldAttemptSilentAuto,
      hasOrderCustomerId: !!order?.customer_id,
      hasOrderPhone: !!order?.customer_phone,
      hasFrozenCustomerId: !!frozen?.customerId,
      hasFrozenPhone: !!frozen?.customerPhone
    })

    if (!dbOrderId && hasKnownCustomerContext) {
      void queueDeferredLoyaltyEarn({
        order,
        frozen,
        fallbackCustomerName: candidateCustomerName,
        fallbackCustomerPhone: candidatePhone,
        fallbackCustomerId: candidateCustomerId
      })
      logLoyaltyTrace(
        'show-loyalty-prompt:no-db-order-id-fallback-confirmation',
        {
          requestId,
          candidateCustomerName: candidateCustomerName ?? null,
          hasCandidateCustomerId: isValidUUID(candidateCustomerId),
          hasCandidatePhone: candidatePhone.length >= 10
        }
      )

      useCFDBuiltinStore.getState().update({
        screenState: 'loyalty_confirmation',
        loyaltyResult: {
          customerName: candidateCustomerName,
          programs: []
        }
      })
      setActiveScreenState('loyalty_confirmation')
      controllerRef.current?.showLoyaltyConfirmation([], candidateCustomerName)

      scheduleLoyaltyReturnToIdle(requestId, 'show-loyalty-prompt:fallback')

      return
    }

    const showPhonePrompt = (reason: string) => {
      if (hasShownPhonePrompt) return
      // Customer already has a phone number on the order — skip the prompt
      // entirely and go straight to the confirmation screen. The customer
      // entered their phone at order time; asking again is confusing.
      if (candidatePhone.length >= 10) {
        logLoyaltyTrace('show-loyalty-prompt:skipping-prompt-has-phone', {
          requestId,
          reason
        })
        void queueDeferredLoyaltyEarn({
          order,
          frozen,
          fallbackCustomerName: candidateCustomerName,
          fallbackCustomerPhone: candidatePhone,
          fallbackCustomerId: candidateCustomerId
        })
        useCFDBuiltinStore.getState().update({
          screenState: 'loyalty_confirmation',
          loyaltyResult: {
            customerName: candidateCustomerName,
            programs: []
          }
        })
        setActiveScreenState('loyalty_confirmation')
        controllerRef.current?.showLoyaltyConfirmation(
          [],
          candidateCustomerName
        )
        scheduleLoyaltyReturnToIdle(
          requestId,
          'show-loyalty-prompt:has-phone-skip'
        )
        return
      }
      hasShownPhonePrompt = true
      logLoyaltyTrace('show-loyalty-prompt:show-phone-prompt', {
        requestId,
        reason
      })
      setActiveScreenState('loyalty_prompt')
      controllerRef.current?.showLoyaltyPrompt(selectedStore?.name ?? '')
      useCFDBuiltinStore
        .getState()
        .update({ screenState: 'loyalty_prompt', loyaltyResult: null })
      // No auto-dismiss timer here. The customer must explicitly tap Skip
      // (onLoyaltySkip) or submit a phone number (onPhoneSubmitted) — either
      // path advances state. Letting the prompt time out would close the
      // customer's input mid-typing.
      clearLoyaltyTimer()
    }

    // Only show manual prompt immediately when we have no customer context.
    // If phone/customer is already on the order, try auto-loyalty first.
    if (!shouldAttemptSilentAuto) {
      showPhonePrompt('no-db-order-id-before-auto-attempt')
    }

    void (async () => {
      try {
        // No order means no way to auto-earn; fall back to manual phone prompt.
        if (!dbOrderId) {
          showPhonePrompt('missing-db-order-id')
          return
        }

        if (requestId !== loyaltyFlowRequestIdRef.current) return

        const orderCustomerId = order?.customer_id ?? frozen?.customerId ?? ''
        let effectiveCustomerId =
          orderCustomerId && isValidUUID(orderCustomerId)
            ? orderCustomerId
            : null
        let effectiveCustomerName = order?.customer_name ?? undefined
        let effectivePhone =
          order?.customer_phone?.replace(/\D/g, '') ??
          frozen?.customerPhone?.replace(/\D/g, '') ??
          ''

        const needsBackendLookup = !effectiveCustomerId || !effectivePhone
        if (needsBackendLookup) {
          if (requestId !== loyaltyFlowRequestIdRef.current) return
          const { data: backendOrder, error: backendOrderError } =
            await supabase
              .from('orders')
              .select('customer_id, customer_name, customer_phone')
              .eq('id', dbOrderId)
              .maybeSingle()

          if (backendOrderError) {
            console.warn(
              '[CFD Loyalty] Failed to fetch latest order customer fields:',
              backendOrderError
            )
          } else if (backendOrder) {
            const backendCustomerId = backendOrder.customer_id ?? ''
            effectiveCustomerId =
              backendCustomerId && isValidUUID(backendCustomerId)
                ? backendCustomerId
                : effectiveCustomerId
            effectiveCustomerName =
              backendOrder.customer_name ?? effectiveCustomerName
            const backendPhone =
              backendOrder.customer_phone?.replace(/\D/g, '') ?? ''
            effectivePhone = backendPhone || effectivePhone
            logLoyaltyTrace('show-loyalty-prompt:backend-order-loaded', {
              requestId,
              hasBackendCustomerId:
                !!backendOrder.customer_id &&
                isValidUUID(backendOrder.customer_id),
              hasBackendPhone: backendPhone.length >= 10
            })
          }
        }

        // If we have a valid customer_id but no phone yet, hydrate phone from customers.
        if (requestId !== loyaltyFlowRequestIdRef.current) return
        if (effectiveCustomerId && !effectivePhone) {
          const { data: customerRow, error: customerRowError } = await supabase
            .from('customers')
            .select('phone, name')
            .eq('id', effectiveCustomerId)
            .maybeSingle()

          if (customerRowError) {
            console.warn(
              '[CFD Loyalty] Failed to fetch customer phone from customers table:',
              customerRowError
            )
          } else if (customerRow) {
            const customerPhone = customerRow.phone?.replace(/\D/g, '') ?? ''
            effectivePhone = customerPhone || effectivePhone
            effectiveCustomerName = customerRow.name ?? effectiveCustomerName
            logLoyaltyTrace('show-loyalty-prompt:customer-row-loaded', {
              requestId,
              hasCustomerPhone: customerPhone.length >= 10,
              customerName: customerRow.name ?? null
            })
          }
        }

        if (requestId !== loyaltyFlowRequestIdRef.current) return

        if (!effectiveCustomerId && !(merchantId && effectivePhone)) {
          logLoyaltyTrace('show-loyalty-prompt:missing-customer-context', {
            requestId,
            hasEffectiveCustomerId: !!effectiveCustomerId,
            hasMerchantIdAndPhone: !!merchantId && !!effectivePhone
          })
          showPhonePrompt('missing-customer-id-and-phone')
          return
        }

        if (!effectiveCustomerId && merchantId && effectivePhone) {
          if (requestId !== loyaltyFlowRequestIdRef.current) return
          const { id: customerId, name } = await findOrCreateCustomerByPhone(
            effectivePhone,
            merchantId,
            supabase
          )
          logLoyaltyTrace('show-loyalty-prompt:find-or-create-customer', {
            requestId,
            customerId,
            customerName: name ?? null
          })
          effectiveCustomerId = customerId
          effectiveCustomerName = name ?? effectiveCustomerName
          await supabase
            .from('orders')
            .update({ customer_id: customerId })
            .eq('id', dbOrderId)
        }

        if (effectiveCustomerId) {
          if (requestId !== loyaltyFlowRequestIdRef.current) return
          const { error: ensureCustomerError } = await supabase
            .from('orders')
            .update({ customer_id: effectiveCustomerId })
            .eq('id', dbOrderId)

          if (ensureCustomerError) {
            console.warn(
              '[CFD Loyalty] Failed to persist order customer_id before loyalty earn:',
              ensureCustomerError
            )
          }
        }

        const results = await earnLoyaltyWithReadiness({
          dbOrderId,
          requestId,
          traceStage: 'show-loyalty-prompt',
          maxAttempts: 8
        })

        if (requestId !== loyaltyFlowRequestIdRef.current) return
        if (results.length === 0) {
          console.warn(
            '[CFD Loyalty] Auto loyalty returned no program data; showing confirmation fallback'
          )
          void queueDeferredLoyaltyEarn({
            order,
            frozen,
            fallbackCustomerName: effectiveCustomerName,
            fallbackCustomerPhone: effectivePhone,
            fallbackCustomerId: effectiveCustomerId ?? undefined
          })
        }

        const loyaltyResult = {
          customerName: effectiveCustomerName,
          programs: results.map(r => ({
            name: r.program_name,
            type: r.program_type,
            earned: r.earned,
            newBalance: r.new_balance,
            rewardUnlocked: r.reward_unlocked,
            progressPercent:
              (r as any).progress_percent ?? (r as any).progressPercent ?? null,
            remainingToReward:
              (r as any).remaining_to_reward ??
              (r as any).remainingToReward ??
              null,
            rewardThreshold:
              (r as any).reward_threshold ?? (r as any).rewardThreshold ?? null,
            rewardLabel:
              (r as any).reward_label ?? (r as any).rewardLabel ?? null,
            canRedeemNow:
              (r as any).can_redeem_now ?? (r as any).canRedeemNow ?? null
          }))
        }

        useCFDBuiltinStore.getState().update({
          screenState: 'loyalty_confirmation',
          loyaltyResult
        })
        setActiveScreenState('loyalty_confirmation')
        logLoyaltyTrace('show-loyalty-prompt:show-confirmation', {
          requestId,
          customerName: effectiveCustomerName ?? null,
          programCount: results.length
        })
        controllerRef.current?.showLoyaltyConfirmation(
          results,
          effectiveCustomerName
        )

        scheduleLoyaltyReturnToIdle(requestId, 'show-loyalty-prompt')
      } catch (err) {
        logLoyaltyTrace('show-loyalty-prompt:auto-failed', {
          requestId,
          dbOrderId,
          message: err instanceof Error ? err.message : String(err)
        })
        console.error('[CFD Loyalty] Auto loyalty failed, showing prompt:', err)
        if (requestId !== loyaltyFlowRequestIdRef.current) return
        showPhonePrompt('auto-flow-error')
      }
    })()
  }, [
    clearResultAutoIdleTimer,
    clearLoyaltyTimer,
    earnLoyaltyWithReadiness,
    queueDeferredLoyaltyEarn,
    scheduleLoyaltyReturnToIdle,
    selectedStore?.merchant_id,
    selectedStore?.name,
    supabase
  ])

  const handleBuiltinPhoneSubmit = useCallback(
    async (phone: string) => {
      const ctrl = controllerRef.current
      if (!ctrl || !selectedStore?.id) return

      const requestId = ++loyaltyFlowRequestIdRef.current

      clearLoyaltyTimer()

      const order = activeOrderRef.current
      const frozen = frozenTotalsRef.current
      const dbOrderId = order?.db_order_id ?? frozen?.dbOrderId
      logLoyaltyTrace('builtin-phone-submitted:start', {
        requestId,
        phoneDigits: phone.replace(/\D/g, '').length,
        dbOrderId,
        hasOrder: !!order,
        hasFrozen: !!frozen,
        activeScreenState: activeScreenStateRef.current
      })
      if (!dbOrderId) {
        const fallbackCustomerName =
          order?.customer_name ?? frozen?.customerName ?? undefined
        void queueDeferredLoyaltyEarn({
          order,
          frozen,
          fallbackCustomerName,
          fallbackCustomerPhone: phone
        })
        logLoyaltyTrace(
          'builtin-phone-submitted:missing-db-order-id-fallback-confirmation',
          {
            fallbackCustomerName: fallbackCustomerName ?? null
          }
        )
        useCFDBuiltinStore.getState().update({
          screenState: 'loyalty_confirmation',
          loyaltyResult: {
            customerName: fallbackCustomerName,
            programs: []
          }
        })
        setActiveScreenState('loyalty_confirmation')
        ctrl.showLoyaltyConfirmation([], fallbackCustomerName)
        scheduleLoyaltyReturnToIdle(
          requestId,
          'builtin-phone-submitted:fallback'
        )
        return
      }

      const merchantId = selectedStore.merchant_id

      try {
        const { id: customerId, name } = await findOrCreateCustomerByPhone(
          phone,
          merchantId,
          supabase
        )
        logLoyaltyTrace('builtin-phone-submitted:customer-resolved', {
          customerId,
          customerName: name ?? null
        })
        await supabase
          .from('orders')
          .update({ customer_id: customerId })
          .eq('id', dbOrderId)

        if (requestId !== loyaltyFlowRequestIdRef.current) return

        const results = await earnLoyaltyWithReadiness({
          dbOrderId,
          requestId,
          traceStage: 'builtin-phone-submitted',
          maxAttempts: 8
        })

        if (requestId !== loyaltyFlowRequestIdRef.current) return

        if (results.length === 0) {
          console.warn(
            '[CFD Loyalty] No loyalty program data returned after phone submit; showing confirmation fallback'
          )
          void queueDeferredLoyaltyEarn({
            order,
            frozen,
            fallbackCustomerName: name ?? undefined,
            fallbackCustomerPhone: phone,
            fallbackCustomerId: customerId
          })
        }

        const loyaltyResult = {
          customerName: name ?? undefined,
          programs: results.map(r => ({
            name: r.program_name,
            type: r.program_type,
            earned: r.earned,
            newBalance: r.new_balance,
            rewardUnlocked: r.reward_unlocked,
            progressPercent:
              (r as any).progress_percent ?? (r as any).progressPercent ?? null,
            remainingToReward:
              (r as any).remaining_to_reward ??
              (r as any).remainingToReward ??
              null,
            rewardThreshold:
              (r as any).reward_threshold ?? (r as any).rewardThreshold ?? null,
            rewardLabel:
              (r as any).reward_label ?? (r as any).rewardLabel ?? null,
            canRedeemNow:
              (r as any).can_redeem_now ?? (r as any).canRedeemNow ?? null
          }))
        }

        useCFDBuiltinStore.getState().update({
          screenState: 'loyalty_confirmation',
          loyaltyResult
        })
        setActiveScreenState('loyalty_confirmation')
        logLoyaltyTrace('builtin-phone-submitted:show-confirmation', {
          requestId,
          customerName: name ?? null,
          programCount: results.length
        })
        ctrl.showLoyaltyConfirmation(results, name ?? undefined)

        scheduleLoyaltyReturnToIdle(requestId, 'builtin-phone-submitted')
      } catch (err) {
        logLoyaltyTrace('builtin-phone-submitted:error', {
          requestId,
          dbOrderId,
          message: err instanceof Error ? err.message : String(err)
        })
        console.error('[CFD Loyalty] Error processing loyalty:', err)
        const fallbackCustomerName =
          order?.customer_name ?? frozen?.customerName ?? undefined
        void queueDeferredLoyaltyEarn({
          order,
          frozen,
          fallbackCustomerName,
          fallbackCustomerPhone: phone
        })

        useCFDBuiltinStore.getState().update({
          screenState: 'loyalty_confirmation',
          loyaltyResult: {
            customerName: fallbackCustomerName,
            programs: []
          }
        })
        setActiveScreenState('loyalty_confirmation')
        ctrl.showLoyaltyConfirmation([], fallbackCustomerName)
        scheduleLoyaltyReturnToIdle(
          requestId,
          'builtin-phone-submitted:error-fallback'
        )
      }
    },
    [
      clearLoyaltyTimer,
      earnLoyaltyWithReadiness,
      scheduleLoyaltyReturnToIdle,
      queueDeferredLoyaltyEarn,
      selectedStore?.id,
      selectedStore?.merchant_id,
      supabase
    ]
  )

  const handleBuiltinLoyaltySkip = useCallback(() => {
    loyaltyFlowRequestIdRef.current += 1
    const ctrl = controllerRef.current
    if (!ctrl) return
    clearLoyaltyTimer()
    finishLoyaltyFlow('builtin-loyalty-skip')
  }, [clearLoyaltyTimer, finishLoyaltyFlow])

  useEffect(() => {
    setCFDLoyaltyHandlers({
      onJoin: showLoyaltyPrompt,
      onPhoneSubmit: phone => {
        void handleBuiltinPhoneSubmit(phone)
      },
      onSkip: handleBuiltinLoyaltySkip
    })
    return () => {
      setCFDLoyaltyHandlers({
        onJoin: null,
        onPhoneSubmit: null,
        onSkip: null
      })
    }
  }, [showLoyaltyPrompt, handleBuiltinPhoneSubmit, handleBuiltinLoyaltySkip])

  const showLoyaltyConfirmation = useCallback(
    (result: LoyaltyEarnResult[], customerName?: string) => {
      if (cfdLoyaltyDisabled) {
        console.log(
          '[CFD] showLoyaltyConfirmation skipped — loyalty disabled flag'
        )
        controllerRef.current?.showIdle()
        setActiveScreenState(null)
        return
      }
      setActiveScreenState('loyalty_confirmation')
      controllerRef.current?.showLoyaltyConfirmation(result, customerName)
      useCFDBuiltinStore.getState().update({
        screenState: 'loyalty_confirmation',
        loyaltyResult: {
          customerName,
          programs: result.map(r => ({
            name: r.program_name,
            type: r.program_type,
            earned: r.earned,
            newBalance: r.new_balance,
            rewardUnlocked: r.reward_unlocked
          }))
        }
      })
    },
    []
  )

  // Clear the CFD loyalty screen when the operator visibly transitions
  // away from the just-completed sale. Two trigger conditions:
  //   1. activeOrderId switches (operator started a new ticket).
  //   2. completedPaymentInfo goes from non-null to null (operator
  //      dismissed the success view).
  // Without this, the loyalty screen sticks on the CFD because we
  // intentionally removed the 6s auto-idle (manual-only flow) — and
  // the next sale's payload churn can cause a stale-snapshot flash
  // back to the loyalty prompt.
  const completedPaymentInfo = usePaymentStore(s => s.completedPaymentInfo)
  const prevActiveOrderIdForLoyaltyRef = useRef(activeOrderId)
  const prevCompletedPaymentInfoRef = useRef(completedPaymentInfo)
  useEffect(() => {
    const prevOrderId = prevActiveOrderIdForLoyaltyRef.current
    const orderChanged = prevOrderId !== activeOrderId
    prevActiveOrderIdForLoyaltyRef.current = activeOrderId

    const prevCompleted = prevCompletedPaymentInfoRef.current
    const successDismissed = !!prevCompleted && !completedPaymentInfo
    prevCompletedPaymentInfoRef.current = completedPaymentInfo

    const onLoyaltyScreen =
      activeScreenStateRef.current === 'loyalty_prompt' ||
      activeScreenStateRef.current === 'loyalty_confirmation'
    if (!onLoyaltyScreen) return
    if (!orderChanged && !successDismissed) return

    merchantClosedDuringLoyaltyRef.current = true
    console.log('[CFD] merchant moved on while customer is in loyalty', {
      orderChanged,
      successDismissed,
      from: activeScreenStateRef.current
    })
  }, [activeOrderId, completedPaymentInfo])

  // Auto-return to idle after payment result display.
  //
  // Approved is now MANUAL-ONLY: the customer presses Skip / Join, or
  // the operator transitions away (Start New Order, navigate, etc.).
  // The previous 6s / 1.5s timers were dismissing the receipt before
  // the customer could read it, especially with loyalty offered.
  //
  // Declined still flashes briefly — there's no customer action to
  // wait for, and a stuck "Declined" screen would block the operator
  // from retrying.
  useEffect(() => {
    clearResultAutoIdleTimer()

    if (activeScreenState === 'approved') {
      resultAutoIdleTimerRef.current = setTimeout(
        () => finishLoyaltyFlow('approved-timeout'),
        8000
      )
    } else if (activeScreenState === 'declined') {
      resultAutoIdleTimerRef.current = setTimeout(() => showIdle(), 1500)
    }

    return () => {
      clearResultAutoIdleTimer()
    }
  }, [activeScreenState, clearResultAutoIdleTimer, finishLoyaltyFlow, showIdle])

  const disconnectClient = useCallback((clientId: string) => {
    controllerRef.current?.unpairClient(clientId)
    setConnectedClientIds(prev => {
      const updated = prev.filter(id => id !== clientId)
      setClientCount(updated.length)
      setIsConnected(updated.length > 0)
      return updated
    })
  }, [])

  const value = {
    serverStatus,
    isServerReady: serverStatus === 'ready' || serverStatus === 'connected',
    isConnected,
    clientCount,
    connectedClientIds,
    serverError,
    pairingData,
    serverInfo: controllerRef.current?.getServerInfo() ?? null,
    tipResponse,
    clearTipResponse,
    showTipSelection,
    updateTip,
    setBaseAmount,
    setScreenState,
    showPayment,
    showProcessing,
    showApproved,
    showDeclined,
    showIdle,
    showLoyaltyPrompt,
    showLoyaltyConfirmation,
    disconnectClient,
    refreshCarouselImages: fetchCarouselImages,
    refreshOrderingPanelImages: fetchOrderingPanelImages,
    markOrderProcessingActivity,
    // Exposed so payment views can defer their own auto-idle timers when the
    // loyalty flow takes over the CFD (otherwise their setTimeout(showIdle)
    // races and dismisses the prompt while the customer is mid-input).
    activeScreenState
  }

  return (
    <CFDOrderProcessingActivityContext.Provider value={markOrderProcessingActivity}>
      <CFDContext.Provider value={value}>{children}</CFDContext.Provider>
    </CFDOrderProcessingActivityContext.Provider>
  )
}

export function useCFD () {
  const context = useContext(CFDContext)
  if (!context) {
    throw new Error('useCFD must be used within a CFDProvider')
  }
  return context
}

export function useCFDOrderProcessingActivity () {
  return useContext(CFDOrderProcessingActivityContext)
}
