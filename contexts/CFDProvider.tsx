import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { isValidUUID } from '@/lib/offlineIdRegistry'
import { detectNativeHardware } from '@/native/HardwareDetection'
import {
  dismissSecondaryDisplay,
  showSecondaryDisplay
} from '@/native/SecondaryDisplay'
import { CFDController } from '@/services/cfd/CFDController'
import { getCachedCapabilities } from '@/services/hardware/deviceDetection'
import {
  checkMerchantHasLoyalty,
  earnLoyaltyForOrder,
  findOrCreateCustomerByPhone,
  type LoyaltyEarnResult
} from '@/services/loyalty/loyaltyService'
import { queueOperation } from '@/services/offlineSyncService'
import { useActiveOrderTotals } from '@/stores/selectors/orderSelectors'
import { useCFDBuiltinStore } from '@/stores/useCFDBuiltinStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useLoyaltyStore } from '@/stores/useLoyaltyStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { useSeatingStore } from '@/stores/useSeatingStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
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
let loyaltyJoinTrigger: (() => void) | null = null
let loyaltyPhoneSubmitTrigger: ((phone: string) => void) | null = null
let loyaltySkipTrigger: (() => void) | null = null

export function triggerCFDLoyaltyJoin () {
  loyaltyJoinTrigger?.()
}

export function triggerCFDPhoneSubmit (phone: string) {
  loyaltyPhoneSubmitTrigger?.(phone)
}

export function triggerCFDLoyaltySkip () {
  loyaltySkipTrigger?.()
}

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
}

const CFDContext = createContext<CFDContextType | null>(null)

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
  refreshOrderingPanelImages: async () => {}
}

export function CFDProvider ({ children }: { children: React.ReactNode }) {
  const isCFDMode = useStoreSettingsStore(s => s.isCFDMode)

  // In CFD client mode, this device is a display client — don't start server
  if (isCFDMode) {
    return (
      <CFDContext.Provider value={noopCFDValue}>{children}</CFDContext.Provider>
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
  const loyaltyFlowRequestIdRef = useRef(0)
  const queuedLoyaltyOrderIdsRef = useRef<Set<string>>(new Set())
  const debouncedUpdateRef = useRef(
    debounce((ctrl: CFDController, params: any) => {
      const hash = JSON.stringify(params)
      if (hash === lastPayloadHashRef.current) return
      lastPayloadHashRef.current = hash
      ctrl.updateOrder(params)
    }, 150)
  )
  const debouncedBuiltinUpdateRef = useRef(
    debounce((data: Record<string, unknown>) => {
      useCFDBuiltinStore.getState().update(data as any)
    }, 100)
  )

  // Store settings
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const organizationLogoUrl = useStoreSettingsStore(s => s.organizationLogoUrl)
  const showCFDOrderingRightPanel = useStoreSettingsStore(
    s => s.showCFDOrderingRightPanel
  )
  const cfdOrderingRightPanelMode = useStoreSettingsStore(
    s => s.cfdOrderingRightPanelMode
  )
  const tipsConfig = useLocationConfigStore(s => s.config.tips)
  const tipPresetPercentages = tipsConfig.presetPercentages

  // Loyalty
  const merchantHasLoyalty = useLoyaltyStore(s => s.merchantHasLoyalty)

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
  const activeOrderSubtotal = useOrderStore(s => s.activeOrderSubtotal)
  const activeOrderTax = useOrderStore(s => s.activeOrderTax)
  const activeOrderTotal = useOrderStore(s => s.activeOrderTotal)
  const activeOrderDiscount = useOrderStore(s => s.activeOrderDiscount)
  const activeOrderOutstandingTotal = useOrderStore(
    s => s.activeOrderOutstandingTotal
  )

  // Content-based fingerprint so cfdItems transform only runs when actual item
  // data changes, not when the items array reference changes due to unrelated
  // order mutations (e.g. status changes, payment updates).
  const itemsFingerprint = useMemo(() => {
    if (!activeOrder?.items) return ''
    return activeOrder.items
      .map(
        i =>
          `${i.id}:${i.quantity}:${i.unitPrice}:${i.cashPrice}:${i.is_voided}:${i.seatNumber}:${i.courseNumber}:${i.name}:${i.open_item_name ?? ''}`
      )
      .join('|')
  }, [activeOrder?.items])

  // Transform cart items to CFD format with dual pricing.
  // Wrapped in try-catch: an unhandled throw here propagates to the secondary
  // display's React surface, which has no Sentry wrapper — the native layer
  // surfaces it as a brief Android system crash dialog on Landi devices.
  const cfdItems: CFDCartItem[] = useMemo(() => {
    try {
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
  }, [itemsFingerprint, activeOrderSeating, pathname])

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
            frozenTotalsRef.current = null
            setActiveScreenState(null)
            setBaseAmountOverride(null)
            setCurrentTip({ amount: 0, percentage: null })
            ctrl.showIdle()
          },
          onLoyaltyJoin: () => {
            if (controllerRef.current !== ctrl) return
            showLoyaltyPrompt()
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
        console.log('[CFD] Updating carousel images:', imageUrls.length)
        controllerRef.current.updateCarouselImages(imageUrls)
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

      controllerRef.current.updateOrderingPanelImages(orderingPanelImages)
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
    // If we're on a dashboard or settings, the customer shouldn't see order details.
    const isSalesScreen =
      pathname.includes('order-processing') ||
      pathname.includes('tables') ||
      pathname.includes('floor-plan')

    // We show order data IF:
    // 1. We are in an active transaction state (Tip Selection, Payment, etc.)
    // 2. We are on the Sales screen and have an active order.
    const shouldShowOrderData =
      !!activeScreenState || (isSalesScreen && !!activeOrder)

    const frozen = frozenTotalsRef.current
    const displayItems = frozen?.items ?? cfdItems
    const displayCustomerName =
      frozen?.customerName ?? activeOrder?.customer_name ?? null
    const displayOrderNumber =
      frozen?.orderNumber ??
      activeOrder?.display_number ??
      activeOrder?.order_number ??
      null
    const displayOrderType =
      frozen?.orderType ?? activeOrder?.order_type ?? null
    const liveTableName = activeOrder?.order_type
      ?.toLowerCase()
      .includes('dine')
      ? activeOrder?.service_location_id ?? null
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
    const liveCardTotal = Math.round(
      (activeOrderTotal + currentTip.amount) * 100
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
      : Math.round((activeOrderOutstandingTotal + currentTip.amount) * 100)
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
          : null
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
      const hash = JSON.stringify(params)
      if (hash !== lastPayloadHashRef.current) {
        lastPayloadHashRef.current = hash
        controller.updateOrder(params)
      }
    } else {
      debouncedUpdateRef.current(controller, params)
    }

    return () => {
      debouncedUpdateRef.current.cancel()
    }
  }, [
    isConnected,
    activeOrder,
    cfdItems,
    activeOrderSubtotal,
    activeOrderDiscount,
    activeOrderTax,
    activeOrderTotal,
    activeOrderOutstandingTotal,
    orderTotals,
    currentTip,
    activeScreenState,
    activePaymentMethod,
    baseAmountOverride,
    pathname, // Essential for responding to screen changes
    showCFDOrderingRightPanel,
    cfdOrderingRightPanelMode,
    paymentActiveSplit
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

      const isSalesScreen =
        pathname.includes('order-processing') ||
        pathname.includes('tables') ||
        pathname.includes('floor-plan')
      const shouldShowOrderData =
        !!activeScreenState || (isSalesScreen && !!activeOrder)

      if (!shouldShowOrderData) {
        // Debounce idle transition to prevent flicker during screen navigation
        if (!builtinIdleTimerRef.current) {
          builtinIdleTimerRef.current = setTimeout(() => {
            try {
              const s = activeScreenStateRef.current
              const storeState = useCFDBuiltinStore.getState().screenState
              if (
                s === 'loyalty_prompt' ||
                s === 'loyalty_confirmation' ||
                storeState === 'loyalty_prompt' ||
                storeState === 'loyalty_confirmation'
              ) {
                builtinIdleTimerRef.current = null
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
              builtinIdleTimerRef.current = null
            } catch (err) {
              console.error('[CFD] Builtin idle transition error:', err)
              builtinIdleTimerRef.current = null
            }
          }, 500)
        }
        return () => {
          if (builtinIdleTimerRef.current) {
            clearTimeout(builtinIdleTimerRef.current)
            builtinIdleTimerRef.current = null
          }
        }
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
      const liveCardTotal = Math.round(
        (activeOrderTotal + currentTip.amount) * 100
      )
      const liveCashTotal = Math.round(
        ((orderTotals?.cashTotal ?? activeOrderTotal) + currentTip.amount) * 100
      )

      let cardTotal = liveCardTotal
      let cashTotal = liveCashTotal
      let savingsAmount = Math.max(0, liveCardTotal - liveCashTotal)
      const displayTipAmount = Math.round(currentTip.amount * 100)
      let displayOutstandingTotal = Math.round(
        (activeOrderOutstandingTotal + currentTip.amount) * 100
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

      // For dine-in orders, get table ID
      const builtinTableName = activeOrder?.order_type
        ?.toLowerCase()
        .includes('dine')
        ? activeOrder?.service_location_id ?? null
        : null

      const updatePayload = {
        screenState,
        serverName: null,
        customerName: activeOrder?.customer_name ?? null,
        customerPhone: activeOrder?.customer_phone ?? null,
        orderNumber:
          activeOrder?.display_number ?? activeOrder?.order_number ?? null,
        orderType: activeOrder?.order_type ?? null,
        tableName: builtinTableName,
        guestCount: activeOrder?.guest_count ?? null,
        items: cfdItems,
        subtotal: cardSubtotal,
        subtotalCash: cashSubtotal,
        subtotalCard: cardSubtotal,
        discountAmount: displayDiscountAmount,
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
        paymentMethod: (
          paymentView === 'cash'
            ? 'cash'
            : paymentView === 'card' || paymentView === 'manual'
            ? 'card'
            : null
        ) as 'cash' | 'card' | 'manual' | null,
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

      if (isPaymentState) {
        debouncedBuiltinUpdateRef.current.cancel()
        useCFDBuiltinStore.getState().update(updatePayload)
      } else {
        debouncedBuiltinUpdateRef.current(updatePayload)
      }
    } catch (err) {
      console.error('[CFD] Builtin display sync effect error:', err)
    }
  }, [
    hasBuiltinCfd,
    activeOrder,
    cfdItems,
    activeOrderSubtotal,
    activeOrderDiscount,
    activeOrderTax,
    activeOrderTotal,
    activeOrderOutstandingTotal,
    orderTotals,
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
    paymentActiveSplit
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
        : Math.round(activeOrderOutstandingTotal * 100)
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
        orderType: activeOrder?.order_type ?? null,
        tableName: activeOrder?.order_type?.toLowerCase().includes('dine')
          ? activeOrder?.service_location_id ?? null
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
  }, [])

  const clearLoyaltyTimer = useCallback(() => {
    if (!loyaltyTimerRef.current) return
    clearTimeout(loyaltyTimerRef.current)
    loyaltyTimerRef.current = null
  }, [])

  const clearResultAutoIdleTimer = useCallback(() => {
    if (!resultAutoIdleTimerRef.current) return
    clearTimeout(resultAutoIdleTimerRef.current)
    resultAutoIdleTimerRef.current = null
  }, [])

  const scheduleLoyaltyReturnToIdle = useCallback(
    (requestId: number, traceStage: string, timeoutMs = 6000) => {
      clearLoyaltyTimer()
      loyaltyTimerRef.current = setTimeout(() => {
        if (requestId !== loyaltyFlowRequestIdRef.current) return
        logLoyaltyTrace(`${traceStage}:confirmation-timeout`, { requestId })
        frozenTotalsRef.current = null
        setActiveScreenState(null)
        setBaseAmountOverride(null)
        setCurrentTip({ amount: 0, percentage: null })
        controllerRef.current?.showIdle()
        useCFDBuiltinStore
          .getState()
          .update({ screenState: 'idle', loyaltyResult: null })
        loyaltyTimerRef.current = null
      }, timeoutMs)
    },
    [clearLoyaltyTimer]
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
      clearLoyaltyTimer()
      loyaltyTimerRef.current = setTimeout(() => {
        logLoyaltyTrace('show-loyalty-prompt:prompt-timeout', { requestId })
        frozenTotalsRef.current = null
        setActiveScreenState(null)
        setBaseAmountOverride(null)
        setCurrentTip({ amount: 0, percentage: null })
        controllerRef.current?.showIdle()
        loyaltyTimerRef.current = null
      }, 20_000)
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
    frozenTotalsRef.current = null
    setActiveScreenState(null)
    setBaseAmountOverride(null)
    setCurrentTip({ amount: 0, percentage: null })
    ctrl.showIdle()
  }, [clearLoyaltyTimer])

  useEffect(() => {
    loyaltyJoinTrigger = showLoyaltyPrompt
    loyaltyPhoneSubmitTrigger = phone => {
      void handleBuiltinPhoneSubmit(phone)
    }
    loyaltySkipTrigger = handleBuiltinLoyaltySkip
    return () => {
      if (loyaltyJoinTrigger === showLoyaltyPrompt) {
        loyaltyJoinTrigger = null
      }
      loyaltyPhoneSubmitTrigger = null
      loyaltySkipTrigger = null
    }
  }, [showLoyaltyPrompt, handleBuiltinPhoneSubmit, handleBuiltinLoyaltySkip])

  const showLoyaltyConfirmation = useCallback(
    (result: LoyaltyEarnResult[], customerName?: string) => {
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

  // Auto-return to idle after payment result display
  useEffect(() => {
    clearResultAutoIdleTimer()

    if (activeScreenState === 'approved') {
      resultAutoIdleTimerRef.current = setTimeout(() => {
        showIdle()
      }, 4000)
    } else if (activeScreenState === 'declined') {
      resultAutoIdleTimerRef.current = setTimeout(() => showIdle(), 3000)
    }

    return () => {
      clearResultAutoIdleTimer()
    }
  }, [activeScreenState, clearResultAutoIdleTimer, showIdle])

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
    refreshOrderingPanelImages: fetchOrderingPanelImages
  }

  return <CFDContext.Provider value={value}>{children}</CFDContext.Provider>
}

export function useCFD () {
  const context = useContext(CFDContext)
  if (!context) {
    throw new Error('useCFD must be used within a CFDProvider')
  }
  return context
}
