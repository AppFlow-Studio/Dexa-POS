import ServerSectionManager from '@/components/floor-plan/ServerSectionManager'
import { GuestCountModal } from '@/components/tables/GuestCountModal'
import MergeActionBar from '@/components/tables/MergeActionBar'
import ServerSelectSheet from '@/components/tables/ServerSelectSheet'
import Sidebar from '@/components/tables/Sidebar'
import TableContextSheet from '@/components/tables/TableContextSheet'
import TableLayoutSkeleton from '@/components/tables/TableLayoutSkeleton'
import TableLayoutView from '@/components/tables/TableLayoutView'
import TableOrderOverlay from '@/components/tables/TableOrderOverlay'
import { useLoading } from '@/contexts/LoadingContext'
import { useLocationRealtime } from '@/contexts/LocationRealtimeProvider'
import { useToast } from '@/contexts/ToastContext'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { pauseTimerTick, resumeTimerTick } from '@/hooks/useTableTimerTick'
import { getDeviceId } from '@/lib/deviceId'
import { startInteraction } from '@/lib/perf'
import { colors, TABLE_STATUS_COLORS } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'
import { useUiScale } from '@/lib/uiScale'
import { transferTableServer } from '@/services/serverAssignmentService'
import { ensureOrderPrefetched } from '@/services/tableOrderPrefetch'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import {
  registerPendingOrderCreation,
  useOrderStore
} from '@/stores/useOrderStore'
import { usePendingTableOverlay } from '@/stores/usePendingTableOverlay'
import {
  setReservationSupabaseClient,
  useReservationStore
} from '@/stores/useReservationStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import { setWaitlistSupabaseClient } from '@/stores/useWaitlistStore'
import { FloorPlanObject, Reservation } from '@/types/db-floor-plan-types'
import { Href, useFocusEffect, useRouter } from 'expo-router'
import {
  GitMerge,
  HelpCircle,
  Pencil,
  Search,
  Users,
  X
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  InteractionManager,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { useShallow } from 'zustand/react/shallow'

const canSeatFromSidebar = (status?: string | null) => {
  const normalized = status?.toLowerCase()
  return !normalized || normalized === 'available' || normalized === 'reserved'
}

const getSelectedTablesCapacity = (
  tablesById: Record<string, FloorPlanObject>,
  tableIds: string[]
) => {
  let totalCapacity = 0
  let hasKnownCapacity = false

  for (const tableId of tableIds) {
    const capacity = tablesById[tableId]?.capacity
    if (typeof capacity === 'number' && capacity > 0) {
      totalCapacity += capacity
      hasKnownCapacity = true
    }
  }

  return { totalCapacity, hasKnownCapacity }
}

const TablesScreen = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const { colorScheme } = useColorScheme()
  const router = useRouter()
  // Subscribe to tables directly to ensure real-time updates
  const tables = useFloorPlanStore(useShallow(s => s.tables))
  const floorPlans = useFloorPlanStore(s => s.floorPlans)
  const activeFloorPlanId = useFloorPlanStore(s => s.activeFloorPlanId)
  const floorPlanLoading = useFloorPlanStore(s => s.isLoading)
  const sections = useFloorPlanStore(s => s.sections)
  const sectionsById = useFloorPlanStore(s => s.sectionsById)

  // DON'T sync sessions into floor plan store tables.
  // DraggableTable reads liveSession directly from useTableSessionStore (line 65),
  // which is the single source of truth. The floor plan store's table.session field
  // is only for persistence, not runtime rendering.

  // Selection state — separate (changes on every tap in merge mode)
  const selectedTableIds = useFloorPlanStore(s => s.selectedTableIds)

  // Actions — stable refs, separate is fine
  const setActiveFloorPlan = useFloorPlanStore(s => s.setActiveFloorPlan)
  const toggleTableSelection = useFloorPlanStore(s => s.toggleTableSelection)
  const clearSelection = useFloorPlanStore(s => s.clearSelection)
  const mergeTable = useTableSessionStore(s => s.mergeTable)
  const unmergeTable = useTableSessionStore(s => s.unmergeTable)
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const device_id = getDeviceId()
  const startNewOrder = useOrderStore(s => s.startNewOrder)
  const setActiveOrder = useOrderStore(s => s.setActiveOrder)
  const getOrderByDbId = useOrderStore(s => s.getOrderByDbId)
  const getOrder = useOrderStore(s => s.getOrder)
  const openTable = usePendingTableOverlay(s => s.openTable)
  const { show } = useToast()
  const { showLoading, hideLoading } = useLoading()

  const supabaseClient = useSupabaseClient()
  const location_id = useStoreSettingsStore(s => s.selectedStore?.id || '')

  const [legendVisible, setLegendVisible] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchText, setSearchText] = useState('')
  const [isGuestModalOpen, setGuestModalOpen] = useState(false)
  const [seatingErrorMessage, setSeatingErrorMessage] = useState<string | null>(
    null
  )
  const [pendingReservation, setPendingReservation] =
    useState<Reservation | null>(null)
  const [isMergeMode, setMergeMode] = useState(false)
  const [contextTable, setContextTable] = useState<FloorPlanObject | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [isSectionManagerOpen, setSectionManagerOpen] = useState(false)
  const [transferServerTarget, setTransferServerTarget] = useState<{
    tableId: string
    sessionId: string
  } | null>(null)
  // overlayTableId removed in favor of router.push

  useEffect(() => {
    if (supabaseClient) {
      setWaitlistSupabaseClient(supabaseClient)
    }
  }, [supabaseClient])

  const fetchReservations = useReservationStore(s => s.fetchReservations)
  const fetchReservationsRef = useRef(fetchReservations)
  fetchReservationsRef.current = fetchReservations

  useEffect(() => {
    if (!supabaseClient || !location_id) return
    setReservationSupabaseClient(supabaseClient)
    let interval: ReturnType<typeof setInterval> | null = null
    let cancelled = false
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return
      fetchReservationsRef.current(location_id)
      interval = setInterval(
        () => fetchReservationsRef.current(location_id, undefined, { silent: true }),
        30000
      )
    })
    return () => {
      cancelled = true
      task.cancel()
      if (interval) clearInterval(interval)
    }
  }, [supabaseClient, location_id])

  // Consume pending table overlay from waitlist seating flow
  useFocusEffect(
    useCallback(() => {
      const pendingId = usePendingTableOverlay.getState().consume()
      if (pendingId) {
        openTable(pendingId)
      }
    }, [openTable])
  )

  // Pause background timer ticks when screen loses focus
  useFocusEffect(
    useCallback(() => {
      resumeTimerTick()
      return () => pauseTimerTick()
    }, [])
  )

  // DEV: log the live realtime subscriptions for the Tables screen — which
  // location channels are open and their current connection state. Re-logs
  // whenever a channel's state changes so you can watch (re)subscribes.
  const { floor, orders } = useLocationRealtime()
  useEffect(() => {
    if (!__DEV__) return
    console.log('[Tables] Active realtime subscriptions:', {
      floor: { topic: floor.status.topic, state: floor.status.state },
      orders: { topic: orders.status.topic, state: orders.status.state }
    })
  }, [floor.status.topic, floor.status.state, orders.status.topic, orders.status.state])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(searchInput), 200)
    return () => clearTimeout(timer)
  }, [searchInput])

  const isClockedIn = useTimeclockStore(s => {
    if (!s.activeEmployeeId) return false
    return s.sessions[s.activeEmployeeId]?.status === 'clockedIn'
  })
  const showClockInWall = useTimeclockStore(s => s.showClockInWall)
  const getEmployeeByStaffId = useEmployeeStore(s => s.getEmployeeByStaffId)

  useEffect(() => {
    if (!activeFloorPlanId && floorPlans.length > 0) {
      setActiveFloorPlan(floorPlans[0].id)
    }
    clearSelection()
  }, [activeFloorPlanId, floorPlans, setActiveFloorPlan, clearSelection])

  // activePlan logic is now handled by store loading 'tables' only for active plan.
  // tables = current active tables.

  // Filter tables by search (uses debounced searchText)
  const filteredTables = useMemo(() => {
    let result = tables
    if (searchText.trim()) {
      const query = searchText.toLowerCase()
      result = result.filter(t => t.name?.toLowerCase().includes(query))
    }
    if (activeSectionId) {
      result = result.filter(t => t.section_id === activeSectionId)
    }
    return result
  }, [tables, searchText, activeSectionId])

  const handleCloseGuestModal = useCallback(() => {
    setGuestModalOpen(false)
    setSeatingErrorMessage(null)
    clearSelection()
  }, [clearSelection])

  const handleTablePress = useCallback(
    (table: FloorPlanObject) => {
      if (!isClockedIn) {
        showClockInWall()
        return
      }

      // MERGE MODE: Multi-select behavior
      if (isMergeMode) {
        toggleTableSelection(table.id)
        return
      }

      // Eager prefetch: if table is occupied, start loading order now
      // so it's cached by the time the user taps "View Order" in the context sheet
      const liveSession = useTableSessionStore.getState().sessions[table.id]
      const activeSession = liveSession ?? table.session
      if (activeSession?.order_id && activeSession.status !== 'available') {
        const existing = useOrderStore
          .getState()
          .getOrder(activeSession.order_id)
        if (!existing) {
          ensureOrderPrefetched(activeSession.order_id).catch(() => {})
        }
      }

      // NORMAL MODE: Open context sheet regardless of session state
      setContextTable(table)
    },
    [
      isClockedIn,
      showClockInWall,
      isMergeMode,
      toggleTableSelection,
    ]
  )

  const handleSheetSeatGuests = useCallback(
    (table: FloorPlanObject) => {
      // Look up the fresh table data from store to get latest session
      const freshTable = useFloorPlanStore.getState().getTableById(table.id)
      if (!freshTable) return

      // Only allow seating on available tables — check live session store too (floor plan store can lag)
      const liveSession = useTableSessionStore.getState().sessions[table.id]
      const activeSession = liveSession ?? freshTable.session
      if (!canSeatFromSidebar(activeSession?.status)) {
        show({
          title: 'Table Occupied',
          message:
            'This table is already in use. View the existing order instead.',
          type: 'warning'
        })
        return
      }
      setContextTable(null)
      clearSelection()
      toggleTableSelection(table.id)
      setSeatingErrorMessage(null)
      setGuestModalOpen(true)
    },
    [clearSelection, toggleTableSelection, show]
  )

  const handleSeatReservation = useCallback(
    (table: FloorPlanObject, reservation: Reservation) => {
      const freshTable = useFloorPlanStore.getState().getTableById(table.id)
      if (!freshTable) return
      const liveSession = useTableSessionStore.getState().sessions[table.id]
      const activeSession = liveSession ?? freshTable.session
      if (!canSeatFromSidebar(activeSession?.status)) {
        show({
          title: 'Table Occupied',
          message: 'This table is already in use.',
          type: 'warning'
        })
        return
      }
      setContextTable(null)
      clearSelection()
      toggleTableSelection(table.id)
      setSeatingErrorMessage(null)
      setPendingReservation(reservation)
      setGuestModalOpen(true)
    },
    [clearSelection, toggleTableSelection, show]
  )

  const handleSheetNavigate = useCallback(
    (tableId: string) => {
      setContextTable(null)
      const table = tables.find(t => t.id === tableId)
      const orderId = table?.session?.order_id
      if (orderId) {
        const existingOrder = getOrder(orderId)
        if (existingOrder) {
          setActiveOrder(existingOrder.id)
        }
        const prefetch = ensureOrderPrefetched(orderId)
        openTable(tableId)
        // Background sync for fresh data if order wasn't cached
        if (!existingOrder) {
          prefetch
            .then(localOrderId => {
              if (localOrderId) setActiveOrder(localOrderId)
            })
            .catch(() => {})
        }
      } else {
        openTable(tableId)
      }
    },
    [tables, getOrder, openTable, setActiveOrder]
  )

  const handleTransferServer = useCallback(
    (tableId: string, sessionId: string) => {
      setContextTable(null)
      setTransferServerTarget({ tableId, sessionId })
    },
    []
  )

  const handleServerSelectedForTransfer = useCallback(
    (name: string) => {
      if (!transferServerTarget) return
      const { tableId, sessionId } = transferServerTarget
      setTransferServerTarget(null)

      const employee = useEmployeeStore
        .getState()
        .employees.find(e => e.fullName === name)
      const staffProfileId = employee?.profileId
      if (!staffProfileId) return

      // Optimistic update
      useTableSessionStore.getState().dispatch(tableId, {
        type: 'PATCH',
        updates: { server_staff_id: staffProfileId }
      })

      // Keep order-based UI in sync (sidebar/details that read order.server_name)
      const session = useTableSessionStore.getState().sessions[tableId]
      const sessionOrderId = session?.order_id
      if (sessionOrderId) {
        const localOrder =
          useOrderStore.getState().getOrderByDbId(sessionOrderId) ||
          useOrderStore.getState().getOrder(sessionOrderId)
        if (localOrder?.id) {
          useOrderStore
            .getState()
            .patchOrder(localOrder.id, { server_name: name })
        }
      }

      // Persist to DB
      if (supabaseClient) {
        transferTableServer(supabaseClient, sessionId, staffProfileId).catch(
          err =>
            console.warn(
              '[handleServerSelectedForTransfer] DB update failed:',
              err
            )
        )
      }
    },
    [transferServerTarget, supabaseClient]
  )

  const currentTransferServerName = useMemo(() => {
    if (!transferServerTarget) return null
    const session =
      useTableSessionStore.getState().sessions[transferServerTarget.tableId]
    const staffId = session?.server_staff_id
    if (!staffId) return null
    return getEmployeeByStaffId(staffId)?.fullName || null
  }, [transferServerTarget, getEmployeeByStaffId])

  const handleTableLongPress = useCallback(
    (table: FloorPlanObject) => {
      if (!isClockedIn) {
        showClockInWall()
        return
      }

      // If table is occupied, sync the order from DB (to get fresh items) then navigate
      const liveSessionLP = useTableSessionStore.getState().sessions[table.id]
      const activeSessionLP = liveSessionLP ?? table.session
      if (activeSessionLP && activeSessionLP.status !== 'available') {
        const orderId = activeSessionLP.order_id
        if (orderId) {
          // Set active order synchronously if already in store (avoids skeleton on destination screen)
          const existing = useOrderStore.getState().getOrder(orderId)
          if (existing) setActiveOrder(existing.id)

          // Show overlay immediately — no routing latency
          const prefetch = ensureOrderPrefetched(orderId)
          openTable(table.id)

          // Background sync for fresh data (no-op if order already current)
          prefetch
            .then(localOrderId => {
              if (localOrderId) setActiveOrder(localOrderId)
            })
            .catch(() => {})
        } else {
          openTable(table.id)
        }
        return
      }

      // For available tables, show guest count modal
      clearSelection()
      toggleTableSelection(table.id)
      setSeatingErrorMessage(null)
      setGuestModalOpen(true)
    },
    [
      isClockedIn,
      showClockInWall,
      clearSelection,
      toggleTableSelection,
      openTable,
      setActiveOrder
    ]
  )

  // OPTIMIZED: Use Set for O(1) membership tests instead of .includes() O(n)
  const selectedTableIdsSet = useMemo(
    () => new Set(selectedTableIds),
    [selectedTableIds]
  )

  // Wave 3.4: single-pass partition. Was three full-array filters per tap
  // (tables.filter → .filter → .filter); now one walk producing all three.
  const { selectedTables, availableSelectedTables, inUseSelectedTables } =
    useMemo(() => {
      const selected: FloorPlanObject[] = []
      const available: FloorPlanObject[] = []
      const inUse: FloorPlanObject[] = []
      for (const t of tables) {
        if (!selectedTableIdsSet.has(t.id)) continue
        selected.push(t)
        if (!t.session || t.session.status === 'available') {
          available.push(t)
        } else {
          inUse.push(t)
        }
      }
      return {
        selectedTables: selected,
        availableSelectedTables: available,
        inUseSelectedTables: inUse,
      }
    }, [tables, selectedTableIdsSet])

  // Determine which merge action is valid
  const canMergeAndSeat =
    availableSelectedTables.length >= 2 && inUseSelectedTables.length === 0
  const canAddToSession =
    inUseSelectedTables.length === 1 && availableSelectedTables.length >= 1
  const canUnmerge =
    selectedTables.length === 1 &&
    (selectedTables[0]?.session?.merged_tables?.length ?? 0) > 0

  // Check if unmerge is blocked due to pending items
  const checkUnmergeAllowed = (): boolean => {
    if (!canUnmerge) return false

    // If table is in "cleaning" status, always allow unmerge
    const tableStatus = selectedTables[0]?.session?.status?.toLowerCase()
    if (tableStatus === 'cleaning') return true

    const sessionOrderId = selectedTables[0]?.session?.order_id
    if (!sessionOrderId) return true

    // Find the order - OPTIMIZED: Use getState() to avoid subscription
    const currentOrdersById = useOrderStore.getState().ordersById
    let order =
      currentOrdersById[sessionOrderId] || getOrderByDbId(sessionOrderId)
    if (!order) return true

    // Check for pending items
    const hasPendingItems = order.items.some(
      item =>
        item.item_status !== 'ready' &&
        item.item_status !== 'served' &&
        item.item_status !== 'Ready' &&
        item.item_status !== 'Served'
    )
    return !hasPendingItems
  }

  const handleMergeAndSeat = useCallback(() => {
    if (availableSelectedTables.length < 2) {
      show({
        title: 'Select More Tables',
        message: 'Please select at least 2 tables to merge.',
        type: 'warning'
      })
      return
    }
    setSeatingErrorMessage(null)
    setGuestModalOpen(true)
  }, [availableSelectedTables.length, show])

  const handleAddToSession = useCallback(async () => {
    if (inUseSelectedTables.length !== 1 || availableSelectedTables.length < 1)
      return

    const targetSession = inUseSelectedTables[0].session
    if (!targetSession?.id) return

    try {
      for (const table of availableSelectedTables) {
        await mergeTable(targetSession.id, table.id)
      }
      show({
        title: 'Tables Merged',
        message: `Added ${availableSelectedTables.length} table(s) to the session.`,
        type: 'success'
      })
      clearSelection()
      setMergeMode(false)
    } catch (err) {
      console.error('Failed to merge tables:', err)
      show({
        title: 'Merge Failed',
        message: 'Could not merge tables. Please try again.',
        type: 'error'
      })
    }
  }, [
    inUseSelectedTables,
    availableSelectedTables,
    mergeTable,
    show,
    clearSelection
  ])

  const handleUnmerge = useCallback(async () => {
    if (!canUnmerge) return

    if (!checkUnmergeAllowed()) {
      show({
        title: 'Cannot Unmerge',
        message: 'This table has pending items. Complete them first.',
        type: 'error'
      })
      return
    }

    const table = selectedTables[0]
    if (!table.session?.id) return

    try {
      await unmergeTable(table.session.id, table.id)
      show({
        title: 'Table Unmerged',
        message: `${table.name} has been removed from the session.`,
        type: 'success'
      })
      clearSelection()
      setMergeMode(false)
    } catch (err) {
      console.error('Failed to unmerge table:', err)
      show({
        title: 'Unmerge Failed',
        message: 'Could not unmerge table. Please try again.',
        type: 'error'
      })
    }
  }, [
    canUnmerge,
    checkUnmergeAllowed,
    selectedTables,
    unmergeTable,
    show,
    clearSelection
  ])

  const handleCancelMerge = useCallback(() => {
    clearSelection()
    setMergeMode(false)
  }, [clearSelection])

  const handleGuestCountSubmit = async (guestCount: number) => {
    setSeatingErrorMessage(null)
    const primaryTableId = selectedTableIds[0]
    if (!primaryTableId) return
    const activeReservation = pendingReservation
    setPendingReservation(null)

    // Double-check table is still available
    const freshTable = useFloorPlanStore.getState().getTableById(primaryTableId)
    if (!canSeatFromSidebar(freshTable?.session?.status)) {
      setSeatingErrorMessage('This table is no longer available.')
      show({
        title: 'Table Occupied',
        message:
          'This table is no longer available. It was occupied by another station.',
        type: 'error'
      })
      setGuestModalOpen(false)
      clearSelection()
      return
    }

    // Auto-resolve server from section assignment
    const sectionId = freshTable?.section_id
    const assignedServerId = sectionId
      ? useFloorPlanStore.getState().sectionsById[sectionId]
          ?.assigned_staff_id ?? undefined
      : undefined

    const tableIdsToSeat = isMergeMode ? selectedTableIds : [primaryTableId]

    // 1. Create local order immediately (synchronous — ~0ms)
    const newOrder = startNewOrder({ tableId: primaryTableId, guestCount })
    setActiveOrder(newOrder.id)

    // 2. Register pending creation to prevent ensureOrderCreated from duplicating
    let resolveCreation: (dbOrderId: string | null) => void
    const creationPromise = new Promise<string | null>(resolve => {
      resolveCreation = resolve
    })
    registerPendingOrderCreation(newOrder.id, creationPromise)

    // 3. Navigate immediately — order is already in local store
    setGuestModalOpen(false)
    clearSelection()
    setMergeMode(false)
    openTable(primaryTableId)

    // 4. Seat guests in background
    try {
      const { orderId } = await useTableSessionStore.getState().seatGuests({
        tableIds: tableIdsToSeat,
        partySize: guestCount,
        createOrder: true,
        localOrderId: newOrder.id,
        selected_station: selectedStation?.id,
        device_id: device_id,
        serverId: assignedServerId,
        reservationId: activeReservation?.id
      })

      if (activeReservation?.id && orderId) {
        const sessionId =
          useTableSessionStore.getState().sessions[primaryTableId]?.id
        if (sessionId) {
          useReservationStore
            .getState()
            .registerReservationSession(sessionId, activeReservation.id)
        }
      }

      if (orderId && orderId !== newOrder.id) {
        resolveCreation!(orderId)
      } else {
        resolveCreation!(null)
      }

      // Mark reservation as seated
      if (activeReservation) {
        useReservationStore
          .getState()
          .updateStatus(activeReservation.id, 'seated')
          .catch(() => {})
      }
    } catch (err) {
      console.error('[GuestCountSubmit] seatGuests failed:', err)
      resolveCreation!(null)
    }
  }

  return (
    <View
      key={colorScheme}
      className='flex-1 px-2 py-1'
      style={{ backgroundColor: colors.screen }}
    >
      <View
        className='flex-1 flex-row rounded-lg'
        style={{
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderColor: colors.border
        }}
      >
        {/* NEW: Sidebar Component */}
        <Sidebar
          // layouts={layouts} REMOVED
          activeLayoutId={activeFloorPlanId}
          setActiveLayout={setActiveFloorPlan}
        />

        {/* Right Side: Floor Plan */}
        <View style={{ flex: 1, padding: s(12), gap: s(8) }}>
          {/* Top Bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            {/* Layout Tabs */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(8),
                padding: s(3)
              }}
            >
              {floorPlans.map(layout => (
                <TouchableOpacity
                  key={layout.id}
                  onPress={() => {
                    if (layout.id === activeFloorPlanId) return
                    // Perf T0: tap → switched-floor painted. `cached` tells us
                    // whether the instant cache path or the skeleton+RPC path ran.
                    const perf = startInteraction('pos.floor_switch', {
                      cached:
                        !!useFloorPlanStore.getState().floorPlanCache[layout.id]
                    })
                    setActiveFloorPlan(layout.id).finally(() =>
                      perf.endAfterPaint()
                    )
                  }}
                  style={[
                    {
                      paddingHorizontal: s(10),
                      paddingVertical: s(5),
                      borderRadius: s(6)
                    },
                    activeFloorPlanId === layout.id && {
                      backgroundColor: colors.screen
                    }
                  ]}
                >
                  <Text
                    style={{
                      fontSize: s(12),
                      fontWeight: '600',
                      color:
                        activeFloorPlanId === layout.id
                          ? colors.teal
                          : colors.label
                    }}
                  >
                    {layout.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search Bar */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(8),
                paddingHorizontal: s(8),
                paddingVertical: s(5),
                width: s(200)
              }}
            >
              <Search color={colors.muted} size={s(13)} />
              <TextInput
                placeholder='Search tables...'
                placeholderTextColor={colors.muted}
                value={searchInput}
                onChangeText={setSearchInput}
                style={{
                  marginLeft: s(6),
                  fontSize: s(12),
                  flex: 1,
                  color: colors.heading,
                  includeFontPadding: false,
                  padding: s(4)
                }}
              />
            </View>

            {/* Spacer */}
            <View style={{ flex: 1 }} />

            {/* Merge Tables Toggle */}
            <TouchableOpacity
              onPress={() => {
                if (isMergeMode) {
                  handleCancelMerge()
                } else {
                  clearSelection()
                  setMergeMode(true)
                }
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: s(10),
                paddingVertical: s(5),
                borderRadius: s(8),
                borderWidth: 1,
                backgroundColor: isMergeMode
                  ? colors.border + '30'
                  : colors.warning + '15',
                borderColor: isMergeMode ? colors.border : colors.warning + '50'
              }}
            >
              {isMergeMode ? (
                <X color={colors.label} size={s(13)} />
              ) : (
                <GitMerge color={colors.warning} size={s(13)} />
              )}
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: '600',
                  marginLeft: s(5),
                  color: isMergeMode ? colors.label : colors.warning
                }}
              >
                {isMergeMode ? 'Cancel' : 'Merge Tables'}
              </Text>
            </TouchableOpacity>

            {/* Servers Button */}
            {sections.length > 0 && (
              <TouchableOpacity
                onPress={() => setSectionManagerOpen(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: s(10),
                  paddingVertical: s(5),
                  borderRadius: s(8),
                  borderWidth: 1,
                  backgroundColor: colors.teal + '15',
                  borderColor: colors.teal + '40'
                }}
              >
                <Users color={colors.teal} size={s(13)} />
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: '600',
                    color: colors.teal,
                    marginLeft: s(5)
                  }}
                >
                  Servers
                </Text>
              </TouchableOpacity>
            )}

            {/* Edit Layout */}
            <TouchableOpacity
              onPress={() => router.push(`/tables/floor-plan` as Href)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: s(10),
                paddingVertical: s(5),
                borderRadius: s(8),
                borderWidth: 1,
                backgroundColor: colors.panel,
                borderColor: colors.border
              }}
            >
              <Pencil color={colors.label} size={s(13)} />
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: '600',
                  color: colors.label,
                  marginLeft: s(5)
                }}
              >
                Edit Layout
              </Text>
            </TouchableOpacity>
          </View>

          {/* Section Filter Pills */}
          {sections.length > 0 && (
            <View style={{ flexDirection: 'row', gap: s(6), flexWrap: 'wrap' }}>
              <TouchableOpacity
                onPress={() => setActiveSectionId(null)}
                style={{
                  paddingHorizontal: s(10),
                  paddingVertical: s(3),
                  borderRadius: s(20),
                  borderWidth: 1,
                  backgroundColor: !activeSectionId
                    ? colors.teal
                    : 'transparent',
                  borderColor: !activeSectionId ? colors.teal : colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: '600',
                    color: !activeSectionId ? colors.onSolid : colors.label
                  }}
                >
                  All
                </Text>
              </TouchableOpacity>
              {sections.map(section => (
                <TouchableOpacity
                  key={section.id}
                  onPress={() =>
                    setActiveSectionId(
                      activeSectionId === section.id ? null : section.id
                    )
                  }
                  style={{
                    paddingHorizontal: s(10),
                    paddingVertical: s(3),
                    borderRadius: s(20),
                    borderWidth: 1,
                    borderColor: section.color,
                    backgroundColor:
                      activeSectionId === section.id
                        ? section.color
                        : 'transparent'
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: '600',
                      color:
                        activeSectionId === section.id
                          ? colors.onSolid
                          : section.color
                    }}
                  >
                    {section.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Merge Mode Banner */}
          {isMergeMode && (
            <MergeActionBar
              selectedCount={selectedTableIds.length}
              canMergeAndSeat={canMergeAndSeat}
              canAddToSession={canAddToSession}
              canUnmerge={canUnmerge}
              onMerge={handleMergeAndSeat}
              onAdd={handleAddToSession}
              onUnmerge={handleUnmerge}
              onCancel={handleCancelMerge}
            />
          )}

          {/* Map Container */}
          <View
            style={{
              flex: 1,
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(12),
              overflow: 'hidden'
            }}
          >
            {floorPlanLoading ? (
              <TableLayoutSkeleton tableCount={10} showControls={true} />
            ) : (
              <TableLayoutView
                tables={filteredTables || []}
                isSelectionMode={true}
                onTableSelect={handleTablePress}
                showConnections={true}
                layoutId={activeFloorPlanId || ''}
                sectionsById={sectionsById}
                onTableLongPress={
                  isMergeMode ? undefined : handleTableLongPress
                }
                disableLongPress={isMergeMode}
                interactionMode={isMergeMode ? 'merge' : 'normal'}
              />
            )}

            {/* Legend toggle + panel */}
            {legendVisible && (
              <View
                style={{
                  position: 'absolute',
                  top: s(48),
                  right: s(10),
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(10),
                  paddingHorizontal: s(14),
                  paddingVertical: s(8),
                  borderRadius: s(12),
                  backgroundColor: colors.panel + 'F8',
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                {((
                  [
                    ['available', 'Available'],
                    ['seated', 'Seated'],
                    ['ordered', 'Ordered'],
                    ['served', 'Served'],
                    ['check_presented', 'Check'],
                    ['paid', 'Paid'],
                    ['cleaning', 'Cleaning'],
                    ['not_in_service', 'Blocked']
                  ] as const
                ).map(([status, label]) => (
                  <View
                    key={status}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s(4)
                    }}
                  >
                    <View
                      style={{
                        width: s(8),
                        height: s(8),
                        borderRadius: s(4),
                        backgroundColor: TABLE_STATUS_COLORS[status]
                      }}
                    />
                    <Text
                      style={{
                        fontSize: s(11),
                        fontWeight: '500',
                        color: colors.label
                      }}
                    >
                      {label}
                    </Text>
                  </View>
                )))}
              </View>
            )}
            <TouchableOpacity
              onPress={() => setLegendVisible(v => !v)}
              style={{
                position: 'absolute',
                top: s(10),
                right: s(10),
                width: s(32),
                height: s(32),
                borderRadius: s(16),
                backgroundColor: legendVisible
                  ? colors.teal + '20'
                  : colors.card,
                borderWidth: 1,
                borderColor: legendVisible ? colors.teal + '60' : colors.border,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <HelpCircle
                size={s(16)}
                color={legendVisible ? colors.teal : colors.muted}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <TableContextSheet
        table={contextTable}
        onClose={() => setContextTable(null)}
        onSeatGuests={handleSheetSeatGuests}
        onSeatReservation={handleSeatReservation}
        onNavigate={handleSheetNavigate}
        onTransferServer={handleTransferServer}
      />
      <GuestCountModal
        isOpen={isGuestModalOpen}
        onClose={handleCloseGuestModal}
        onSubmit={handleGuestCountSubmit}
        defaultCount={pendingReservation?.party_size}
        errorMessage={seatingErrorMessage}
        onClearError={() => setSeatingErrorMessage(null)}
      />

      {/* Server Section Manager */}
      <ServerSectionManager
        isOpen={isSectionManagerOpen}
        onClose={() => setSectionManagerOpen(false)}
      />

      {/* Transfer Server Sheet */}
      <ServerSelectSheet
        isOpen={transferServerTarget !== null}
        onClose={() => setTransferServerTarget(null)}
        onSelect={handleServerSelectedForTransfer}
        currentServer={currentTransferServerName}
      />

      {/* Table order overlay — mounts TableOrderView on top of the floor plan
          instead of routing, so the floor never unmounts (instant close). */}
      <TableOrderOverlay />
    </View>
  )
}

export default TablesScreen