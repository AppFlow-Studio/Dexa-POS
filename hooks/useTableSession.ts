import { useLoading } from '@/contexts/LoadingContext'
import { useToast } from '@/contexts/ToastContext'
import { isLocalOnlyStatus } from '@/lib/tableStateMachine'
import { OrderProfile } from '@/lib/types'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { hasPendingOrderCreation, useOrderStore } from '@/stores/useOrderStore'
import { usePaymentStore } from '@/stores/usePaymentStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { TableStatus } from '@/types/db-floor-plan-types'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Module-level counter to detect when a newer useTableSession mount has claimed
// activeOrderId. The lazy useState initializer stamps a generation; the cleanup
// only clears activeOrderId if no newer generation has claimed it.
let _mountGeneration = 0

export type SessionPhase =
  | 'initializing' // Waiting for data
  | 'loading_session' // Syncing order from DB
  | 'creating_session' // Auto-creating for available table
  | 'ready' // Session + order available
  | 'payment_syncing' // Payment sheet closed, syncing
  | 'navigating_away' // Suppress all side-effects

interface UseTableSessionResult {
  phase: SessionPhase
  orderId: string | undefined
  activeOrder: OrderProfile | undefined
  tableStatus: TableStatus
  isReady: boolean
  markNavigatingAway: () => void
  markPaymentSyncing: () => void
  markPaymentSyncDone: () => void
}

/** Read phase ref without TS narrowing */
function getPhase (ref: React.MutableRefObject<SessionPhase>): SessionPhase {
  return ref.current
}

export function useTableSession (
  tableId: string,
  source?: string,
  onClose?: () => void
): UseTableSessionResult {
  const router = useRouter()
  const navigateAway = useCallback(() => {
    if (onClose) {
      onClose()
    } else if (source) {
      router.replace(source as any)
    } else {
      router.replace('/tables')
    }
  }, [onClose, source, router])
  const { show } = useToast()
  const { showLoading, hideLoading } = useLoading()

  // Incremented each time a new mount claims activeOrderId synchronously.
  // The cleanup uses this to skip clearing when a newer instance already owns it.
  const mountGenRef = useRef(0)

  const [phase, setPhase] = useState<SessionPhase>(() => {
    const t = useFloorPlanStore.getState().getTableById(tableId)
    if (!t) return 'initializing'

    const session = useTableSessionStore.getState().sessions[tableId]
    const tableSession = t.session

    // No session → available table, auto-create will run, start ready
    // If floor plan already marks this table as occupied, wait for session hydration
    // instead of rendering an empty order view.
    if (!session) {
      if (tableSession && tableSession.status !== 'available')
        return 'initializing'
      return 'ready'
    }

    if (session.status === 'available') {
      if (tableSession && tableSession.status !== 'available')
        return 'initializing'
      return 'ready'
    }

    // Session has an order — check if we already have it locally
    if (session.order_id) {
      const orderState = useOrderStore.getState()
      const found = orderState.getOrder(session.order_id)
      if (found) {
        // Synchronously claim activeOrderId before any effects run.
        // This prevents a re-key from briefly having a null activeOrderId
        // between the old mount's cleanup and the new mount's first effect.
        _mountGeneration++
        mountGenRef.current = _mountGeneration
        // NOTE: Do NOT call setActiveOrder here — it violates React's render invariant
        // and causes "Cannot update X while rendering Y" warnings when components
        // share store subscriptions. Defer this to useEffect below.
        return 'ready' // order in store, render immediately
      }
    }

    // Session exists but order not yet loaded
    return 'initializing'
  })
  const phaseRef = useRef<SessionPhase>(phase)
  const hasAutoCreatedRef = useRef(false)
  const lastSetOrderIdRef = useRef<string | null>(null)
  const cachedOrderRef = useRef<OrderProfile | null>(null)
  const syncInFlightRef = useRef<string | null>(null)
  // If we started ready (order was already in store at mount), skip the first
  // auto-session effect run — there is nothing to load.
  const initiallyReadyRef = useRef(phase === 'ready')

  const updatePhase = useCallback((newPhase: SessionPhase) => {
    phaseRef.current = newPhase
    setPhase(newPhase)
  }, [])

  // Store selectors
  const getTableById = useFloorPlanStore(s => s.getTableById)
  const table = getTableById(tableId)
  const session = useTableSessionStore(s => s.sessions[tableId])
  const tableStatus = (session?.status || 'available') as TableStatus
  const sessionOrderId = session?.order_id

  const setActiveOrder = useOrderStore(s => s.setActiveOrder)
  const syncOrderFromDatabase = useOrderStore(s => s.syncOrderFromDatabase)
  const syncOrderFromBackendComplete = useOrderStore(
    s => s.syncOrderFromBackendComplete
  )
  const activeOrderId = useOrderStore(s => s.activeOrderId)

  const setActiveTableId = usePaymentStore(s => s.setActiveTableId)
  const clearActiveTableId = usePaymentStore(s => s.clearActiveTableId)

  // Reactive order subscription — raw selector (inlined O(1) lookup for narrow subscription)
  const rawActiveOrder = useOrderStore(state => {
    // Priority 1: resolve via session's order_id (DB UUID → local key via index)
    if (sessionOrderId) {
      const localKey = state.dbOrderIdIndex[sessionOrderId] ?? sessionOrderId
      const found = state.ordersById[localKey]
      if (found) return found
    }
    // Priority 2: active order already set and belongs to this table
    if (state.activeOrderId) {
      const active = state.ordersById[state.activeOrderId]
      if (active?.service_location_id === tableId) return active
    }
    // Priority 3: scan ordersById for any active order for this table
    // (handles gaps where activeOrderId is transiently null but order still exists)
    const keys = Object.keys(state.ordersById)
    for (let i = 0; i < keys.length; i++) {
      const o = state.ordersById[keys[i]]
      if (
        o.service_location_id === tableId &&
        o.order_status !== 'completed' &&
        o.order_status !== 'void' &&
        o.order_status !== 'voided' &&
        o.order_status !== 'cancelled'
      ) {
        return o
      }
    }
    return undefined
  })

  // Cache last valid order; use as fallback during transitional gaps
  const activeOrder = useMemo(() => {
    if (rawActiveOrder) {
      cachedOrderRef.current = rawActiveOrder
      return rawActiveOrder
    }
    // Session expects an order but selector can't resolve it — return cached
    if (cachedOrderRef.current) {
      if (cachedOrderRef.current.service_location_id === tableId)
        return cachedOrderRef.current
      if (
        sessionOrderId &&
        cachedOrderRef.current.db_order_id === sessionOrderId
      )
        return cachedOrderRef.current
    }
    return undefined
  }, [rawActiveOrder, sessionOrderId, tableId])

  // Set active table ID for payment store
  useEffect(() => {
    if (tableId) {
      setActiveTableId(tableId)
    }
    return () => {
      clearActiveTableId()
    }
  }, [tableId])

  // Claim active order on mount if session has one
  // Must be separate from the render-phase initializer to avoid updating stores during render
  useEffect(() => {
    const myGen = mountGenRef.current
    if (myGen === 0) return // Not the current mount

    const session = useTableSessionStore.getState().sessions[tableId]
    if (session?.order_id) {
      const orderState = useOrderStore.getState()
      const found = orderState.getOrder(session.order_id)
      if (found && orderState.activeOrderId !== found.id) {
        setActiveOrder(found.id)
      }
    }
  }, [tableId, setActiveOrder])

  // Set active order when we have one (no cleanup on re-run)
  // Also re-claims if the store's activeOrderId was externally cleared while we still have the order
  useEffect(() => {
    if (!activeOrder?.id) return
    // Guard: only set activeOrderId if the order actually exists at that key.
    // During rekey, cachedOrderRef may hold a stale order with old tempId
    // that no longer exists in ordersById — setting activeOrderId to that
    // stale key causes ModifierScreen and addItemToActiveOrder to silently fail.
    const orderState = useOrderStore.getState()
    const resolvedId = orderState.ordersById[activeOrder.id]
      ? activeOrder.id
      : activeOrder.db_order_id
      ? orderState.dbOrderIdIndex[activeOrder.db_order_id] ??
        activeOrder.db_order_id
      : activeOrder.id
    if (!orderState.ordersById[resolvedId]) return // Order truly gone — don't set stale ID
    const storeActiveId = orderState.activeOrderId
    if (
      resolvedId !== lastSetOrderIdRef.current ||
      storeActiveId !== resolvedId
    ) {
      lastSetOrderIdRef.current = resolvedId
      setActiveOrder(resolvedId)
    }
  }, [activeOrder?.id, setActiveOrder])

  // Clear active order only on unmount / table change
  useEffect(() => {
    const myGen = mountGenRef.current
    return () => {
      lastSetOrderIdRef.current = null
      cachedOrderRef.current = null
      // Skip clearing if a newer useTableSession mount already claimed
      // activeOrderId (i.e., re-key: same table opened before this cleanup ran).
      if (_mountGeneration > myGen) return
      setActiveOrder(null)
    }
  }, [tableId, setActiveOrder])

  // Navigation guard: table cleaned remotely
  useEffect(() => {
    if (tableStatus === 'cleaning') {
      updatePhase('navigating_away')
      navigateAway()
      return
    }
    if (tableStatus === 'available' && hasAutoCreatedRef.current && !session) {
      console.log('[useTableSession] Table cleared, navigating away')
      updatePhase('navigating_away')
      navigateAway()
    }
  }, [tableStatus, session])

  // Mark initialization complete when data is ready
  useEffect(() => {
    if (
      getPhase(phaseRef) === 'initializing' &&
      table &&
      (activeOrder || tableStatus === 'available')
    ) {
      updatePhase('ready')
    }
  }, [table, activeOrder, tableStatus])

  // --- Auto-Session & Order Sync Logic ---
  useEffect(() => {
    // If the order was already in the store at mount, skip the first run entirely.
    if (initiallyReadyRef.current) {
      initiallyReadyRef.current = false
      return
    }

    const currentPhase = getPhase(phaseRef)
    if (currentPhase === 'navigating_away') return
    if (
      currentPhase === 'payment_syncing' ||
      currentPhase === 'loading_session' ||
      currentPhase === 'creating_session'
    )
      return

    const handleAutoCreateSession = async () => {
      try {
        // Batch getState() reads: single snapshot per synchronous block
        let orderSnap = useOrderStore.getState()
        let sessionSnap = useTableSessionStore.getState()

        // Skip if already ready with a valid order for this table
        if (getPhase(phaseRef) === 'ready') {
          const currentOid = orderSnap.activeOrderId
          if (currentOid) {
            const currentOrd = orderSnap.ordersById[currentOid]
            if (currentOrd?.service_location_id === tableId) {
              return // Already have the right order — don't re-enter loading states
            }
          }
        }

        // Check session store for existing session
        const currentSession = sessionSnap.getSession(tableId)
        const currentFloorPlanSession = useFloorPlanStore
          .getState()
          .getTableById(tableId)?.session
        const hasExistingSession =
          (currentSession?.status && currentSession.status !== 'available') ||
          (!!currentFloorPlanSession &&
            currentFloorPlanSession.status !== 'available')

        if (!hasExistingSession) {
          // Check if caller already created an order for this table (seatGuests in-flight)
          const activeOid = orderSnap.activeOrderId
          const activeOrd = activeOid
            ? orderSnap.ordersById[activeOid]
            : undefined
          if (activeOrd && activeOrd.service_location_id === tableId) {
            hasAutoCreatedRef.current = true
            updatePhase('ready')
            return
          }

          // Only fetch from DB when there's truly no local session at all (cold open / stale cache).
          // Skip when navigating from the floor plan — session is already in the store.
          if (!currentSession) {
            await useFloorPlanStore.getState().loadFloorPlanStatusIfStale(1000)
          }
        }

        // Re-snapshot after potential async work
        sessionSnap = useTableSessionStore.getState()
        const updatedSession = sessionSnap.getSession(tableId)
        const updatedFloorPlanSession = useFloorPlanStore
          .getState()
          .getTableById(tableId)?.session
        const updatedTableStatus = updatedSession?.status || 'available'

        console.log('[useTableSession] Auto-session check:', {
          tableId,
          status: updatedTableStatus,
          sessionId: updatedSession?.id,
          sessionOrderId: updatedSession?.order_id
        })

        if (!tableId) return

        // If floor plan indicates the table is occupied but session hydration hasn't
        // landed in useTableSessionStore yet, keep waiting instead of auto-creating.
        if (
          !updatedSession &&
          updatedFloorPlanSession &&
          updatedFloorPlanSession.status !== 'available'
        ) {
          updatePhase('initializing')
          return
        }

        // Case 1: Session exists with an order
        if (updatedSession?.order_id) {
          const sOrderId = updatedSession.order_id

          // Early guard: if getOrder resolves to active order, this is a local→DB UUID swap
          const earlyResolved = useOrderStore.getState().getOrder(sOrderId)
          if (
            earlyResolved &&
            earlyResolved.id === useOrderStore.getState().activeOrderId
          )
            return

          // Skip if already matched by db_order_id
          if (activeOrder?.db_order_id === sOrderId) return

          // Re-snapshot order state for Case 1 checks
          orderSnap = useOrderStore.getState()

          // Skip if getOrder resolves to the already-active order
          // (handles local ID → DB UUID transition where the underlying order is the same)
          const resolved = orderSnap.getOrder(sOrderId)
          if (resolved && resolved.id === orderSnap.activeOrderId) return

          // Lookup active order from fresh state for subsequent guards
          const activeOid = orderSnap.activeOrderId
          const activeOrd = activeOid
            ? orderSnap.ordersById[activeOid]
            : undefined

          // Check if active order's db_order_id already matches session's order_id
          // (hydrateOrderFromSeat already ran — no need to re-sync)
          if (
            activeOrd?.service_location_id === tableId &&
            activeOrd?.db_order_id === sOrderId
          ) {
            return
          }

          // Guard: If active order belongs to this table but hasn't received
          // its db_order_id yet, hydrateOrderFromSeat is still in-flight —
          // skip sync to prevent creating a duplicate order
          if (
            activeOrd?.service_location_id === tableId &&
            !activeOrd?.db_order_id
          ) {
            return
          }

          const foundOrder = resolved

          if (foundOrder) {
            if (activeOrderId !== foundOrder.id) {
              setActiveOrder(foundOrder.id)
            }
            updatePhase('ready')
          } else {
            if (
              getPhase(phaseRef) === 'navigating_away' ||
              updatedTableStatus === 'cleaning' ||
              updatedTableStatus === 'available'
            )
              return

            // Before blocking on a DB fetch, check if the background sync
            // (started from the long-press handler) already loaded the order.
            const alreadyInStore = useOrderStore.getState().getOrder(sOrderId)
            if (alreadyInStore) {
              setActiveOrder(alreadyInStore.id)
              updatePhase('ready')
              return
            }

            updatePhase('loading_session')
            console.log(
              '[useTableSession] Syncing order from database:',
              sOrderId
            )

            try {
              const localOrderId = await syncOrderFromDatabase(sOrderId)
              if (getPhase(phaseRef) === 'navigating_away') return

              if (localOrderId) {
                setActiveOrder(localOrderId)
                updatePhase('ready')
                // Background: full hydration for complete data fidelity (payments, coverage, etc.)
                // Skip if this order is being created right now (same-station seating race)
                if (!hasPendingOrderCreation(localOrderId)) {
                  syncOrderFromBackendComplete(localOrderId).catch(err =>
                    console.warn(
                      '[useTableSession] Background full sync failed:',
                      err
                    )
                  )
                }
              }
            } catch (error) {
              console.error('[useTableSession] Failed to sync order:', error)
              show({
                title: 'Error Loading Order',
                message: 'Failed to restore table session. Please try again.',
                type: 'error'
              })
              updatePhase('ready')
            }
          }
          return
        }

        // Case 2: No Session - Auto-create only once
        if (
          !updatedSession &&
          updatedTableStatus === 'available' &&
          (!updatedFloorPlanSession ||
            updatedFloorPlanSession.status === 'available') &&
          !hasAutoCreatedRef.current
        ) {
          hasAutoCreatedRef.current = true

          if (getPhase(phaseRef) === 'navigating_away') return

          // Re-snapshot for Case 2
          orderSnap = useOrderStore.getState()

          // Check if seatGuests is already in-flight from the caller (e.g. handleGuestCountSubmit)
          const activeOid3 = orderSnap.activeOrderId
          if (activeOid3 && hasPendingOrderCreation(activeOid3)) {
            updatePhase('ready')
            return
          }

          updatePhase('creating_session')
          showLoading('Creating session...')

          try {
            // O(1): Check if the active order is already for this table
            const activeOid2 = orderSnap.activeOrderId
            const activeOrd2 = activeOid2
              ? orderSnap.ordersById[activeOid2]
              : undefined
            const existingLocalOrder =
              activeOrd2?.service_location_id === tableId
                ? activeOrd2
                : undefined
            const partySize = existingLocalOrder?.guest_count || 1

            const { sessionId, orderId } = await useTableSessionStore
              .getState()
              .seatGuests({
                tableIds: [tableId],
                partySize,
                createOrder: true
              })

            console.log(
              '[useTableSession] Created session:',
              sessionId,
              'Order:',
              orderId
            )

            if (orderId && getPhase(phaseRef) !== 'navigating_away') {
              const orderExists = useOrderStore.getState().ordersById[orderId]

              if (!orderExists) {
                try {
                  await syncOrderFromDatabase(orderId)
                } catch (syncError) {
                  console.error(
                    '[useTableSession] Failed to sync new order:',
                    syncError
                  )
                  const locationId =
                    useStoreSettingsStore.getState().selectedStore?.id
                  if (locationId) {
                    await useOrderStore.getState().initializeOrders(locationId)
                  }
                }
              }

              setActiveOrder(orderId)
            } else if (!orderId && getPhase(phaseRef) !== 'navigating_away') {
              setActiveOrder(null)
            }

            updatePhase('ready')
          } catch (err) {
            console.error('[useTableSession] Failed to auto-seat:', err)
            updatePhase('ready')
          } finally {
            hideLoading()
          }
        }
      } catch (err) {
        console.error('[useTableSession] Unexpected error:', err)
      }
    }

    handleAutoCreateSession()
  }, [tableId, tableStatus, session?.order_id])

  // Recovery: re-sync if order vanishes while phase is "ready"
  useEffect(() => {
    if (
      phase === 'ready' &&
      sessionOrderId &&
      !activeOrder &&
      getPhase(phaseRef) !== 'navigating_away'
    ) {
      const timer = setTimeout(async () => {
        if (getPhase(phaseRef) !== 'ready' || !sessionOrderId) return

        // Double-check the order is truly missing (not just a render lag)
        const found = useOrderStore.getState().getOrder(sessionOrderId)
        if (found) {
          setActiveOrder(found.id)
          return
        }

        // Deduplicate: skip if we're already syncing this order
        if (syncInFlightRef.current === sessionOrderId) return
        syncInFlightRef.current = sessionOrderId

        updatePhase('loading_session')
        try {
          const localId = await syncOrderFromDatabase(sessionOrderId)
          if (localId && getPhase(phaseRef) !== 'navigating_away') {
            setActiveOrder(localId)
            // Background: full hydration for complete data fidelity
            // Skip if this order is being created right now (same-station seating race)
            if (!hasPendingOrderCreation(localId)) {
              syncOrderFromBackendComplete(localId).catch(err =>
                console.warn(
                  '[useTableSession] Recovery full sync failed:',
                  err
                )
              )
            }
          }
          updatePhase('ready')
        } catch (e) {
          console.error('[useTableSession] Recovery sync failed:', e)
          updatePhase('ready') // Allow retry on next dependency change
        } finally {
          syncInFlightRef.current = null
        }
      }, 300)

      return () => clearTimeout(timer)
    }
  }, [phase, sessionOrderId, activeOrder?.id])

  // Phase transition callbacks
  const markNavigatingAway = useCallback(() => {
    updatePhase('navigating_away')
  }, [])

  const markPaymentSyncing = useCallback(() => {
    updatePhase('payment_syncing')
    // Transition table to local-only "paying" status via dispatchAction
    const currentSession = useTableSessionStore.getState().getSession(tableId)
    if (currentSession && !isLocalOnlyStatus(currentSession.status)) {
      useTableSessionStore.getState().dispatchAction({
        type: 'BEGIN_PAYING',
        tableId
      })
    }
  }, [tableId])

  const markPaymentSyncDone = useCallback(() => {
    updatePhase('ready')
    const currentSession = useTableSessionStore.getState().getSession(tableId)
    if (!currentSession) return

    const currentOrder = useOrderStore
      .getState()
      .getOrder(currentSession.order_id || '')

    if (currentOrder?.paid_status === 'Paid') {
      // Dispatch FULL_PAYMENT regardless of current status — a realtime update
      // may have already overwritten "paying" back to "check_presented".
      // The state machine validates the transition internally.
      useTableSessionStore.getState().dispatchAction({
        type: 'FULL_PAYMENT',
        tableId
      })
    } else if (currentSession.status === 'paying') {
      // Not fully paid — revert local-only "paying" back to check_presented
      useTableSessionStore.getState().dispatchAction({
        type: 'CANCEL_INTERMEDIATE',
        tableId
      })
    }
  }, [tableId])

  return {
    phase,
    orderId: activeOrder?.id,
    activeOrder,
    tableStatus,
    isReady: phase === 'ready',
    markNavigatingAway,
    markPaymentSyncing,
    markPaymentSyncDone
  }
}
