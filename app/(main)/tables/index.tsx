import ServerSectionManager from '@/components/floor-plan/ServerSectionManager'
import HostStationScreenEnhanced from '@/components/host-station/HostStationScreenEnhanced'
import { GuestCountModal } from '@/components/tables/GuestCountModal'
import MergeActionBar from '@/components/tables/MergeActionBar'
import Sidebar from '@/components/tables/Sidebar'
import TableContextSheet from '@/components/tables/TableContextSheet'
import TableLayoutSkeleton from '@/components/tables/TableLayoutSkeleton'
import TableLayoutView from '@/components/tables/TableLayoutView'
import { useLoading } from '@/contexts/LoadingContext'
import { useLocationRealtime } from '@/contexts/LocationRealtimeProvider'
import { useToast } from '@/contexts/ToastContext'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { pauseTimerTick, resumeTimerTick } from '@/hooks/useTableTimerTick'
import { getDeviceId } from '@/lib/deviceId'
import { colors, TABLE_STATUS_COLORS } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import {
  registerPendingOrderCreation,
  useOrderStore
} from '@/stores/useOrderStore'
import { usePendingTableOverlay } from '@/stores/usePendingTableOverlay'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import {
  setReservationSupabaseClient,
  useReservationStore
} from '@/stores/useReservationStore'
import { setWaitlistSupabaseClient } from '@/stores/useWaitlistStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import { Href, useFocusEffect, useRouter } from 'expo-router'
import {
  GitMerge,
  HelpCircle,
  Pencil,
  Search,
  Users,
  UtensilsCrossed,
  X
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

const TablesScreen = () => {
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
  const syncOrderFromDatabase = useOrderStore(s => s.syncOrderFromDatabase)
  const { show } = useToast()
  const { showLoading, hideLoading } = useLoading()

  const supabaseClient = useSupabaseClient()
  const location_id = useStoreSettingsStore(s => s.selectedStore?.id || '')

  const [legendVisible, setLegendVisible] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchText, setSearchText] = useState('')
  const [isGuestModalOpen, setGuestModalOpen] = useState(false)
  const [isMergeMode, setMergeMode] = useState(false)
  const [contextTable, setContextTable] = useState<FloorPlanObject | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [isHostStationOpen, setHostStationOpen] = useState(false)
  const [isSectionManagerOpen, setSectionManagerOpen] = useState(false)
  // overlayTableId removed in favor of router.push

  useEffect(() => {
    if (supabaseClient) {
      setWaitlistSupabaseClient(supabaseClient)
    }
  }, [supabaseClient])

  const fetchReservations = useReservationStore(s => s.fetchReservations)

  useEffect(() => {
    if (!supabaseClient || !location_id) return
    setReservationSupabaseClient(supabaseClient)
    fetchReservations(location_id)
    const interval = setInterval(
      () => fetchReservations(location_id, undefined, { silent: true }),
      30000
    )
    return () => clearInterval(interval)
  }, [supabaseClient, location_id, fetchReservations])

  // Consume pending table overlay from waitlist seating flow
  useFocusEffect(
    useCallback(() => {
      const pendingId = usePendingTableOverlay.getState().consume()
      if (pendingId) {
        router.push(('/tables/' + pendingId) as Href)
      }
    }, [])
  )

  // Pause background timer ticks when screen loses focus
  useFocusEffect(
    useCallback(() => {
      resumeTimerTick()
      return () => pauseTimerTick()
    }, [])
  )

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(searchInput), 200)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { activeEmployeeId, getSession, showClockInWall } = useTimeclockStore()
  const { loggedInEmployee } = useEmployeeStore()

  // Subscribe to realtime floor updates to trigger visual refresh
  // This ensures the floor plan immediately reflects changes from other stations
  const { floor } = useLocationRealtime()

  useEffect(() => {
    if (!activeFloorPlanId && floorPlans.length > 0) {
      setActiveFloorPlan(floorPlans[0].id)
    }
    clearSelection()
  }, [activeFloorPlanId, floorPlans, setActiveFloorPlan, clearSelection])

  // activePlan logic is now handled by store loading 'tables' only for active plan.
  // tables = current active tables.

  const isClockedIn = useMemo(() => {
    if (!activeEmployeeId) return false
    const session = getSession(activeEmployeeId)
    return session?.status === 'clockedIn'
  }, [activeEmployeeId, getSession])

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

      // NORMAL MODE: Open context sheet regardless of session state
      setContextTable(table)
    },
    [isClockedIn, showClockInWall, isMergeMode, toggleTableSelection]
  )

  const handleSheetSeatGuests = useCallback(
    (table: FloorPlanObject) => {
      // Look up the fresh table data from store to get latest session
      const freshTable = useFloorPlanStore.getState().getTableById(table.id)
      if (!freshTable) return

      // Only allow seating on available tables — check live session store too (floor plan store can lag)
      const liveSession = useTableSessionStore.getState().sessions[table.id]
      const activeSession = liveSession ?? freshTable.session
      if (activeSession && activeSession.status !== 'available') {
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
      setGuestModalOpen(true)
    },
    [clearSelection, toggleTableSelection, show]
  )

  const handleSheetNavigate = useCallback(
    (tableId: string) => {
      setContextTable(null)
      const table = tables.find(t => t.id === tableId)
      if (table?.session?.order_id) {
        const existingOrder = getOrder(table.session.order_id)
        if (existingOrder) {
          setActiveOrder(existingOrder.id)
        }
      }
      router.push(('/tables/' + tableId) as Href)
    },
    [tables, getOrder, setActiveOrder]
  )

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
          router.push(('/tables/' + table.id) as Href)

          // Background sync for fresh data (no-op if order already current)
          syncOrderFromDatabase(orderId)
            .then(localOrderId => {
              if (localOrderId) setActiveOrder(localOrderId)
            })
            .catch(() => {})
        } else {
          router.push(('/tables/' + table.id) as Href)
        }
        return
      }

      // For available tables, show guest count modal
      clearSelection()
      toggleTableSelection(table.id)
      setGuestModalOpen(true)
    },
    [
      isClockedIn,
      showClockInWall,
      clearSelection,
      toggleTableSelection,
      syncOrderFromDatabase,
      setActiveOrder
    ]
  )

  // OPTIMIZED: Use Set for O(1) membership tests instead of .includes() O(n)
  const selectedTableIdsSet = useMemo(
    () => new Set(selectedTableIds),
    [selectedTableIds]
  )

  // Analyze selected tables for merge actions
  const selectedTables = useMemo(
    () => tables.filter(t => selectedTableIdsSet.has(t.id)), // O(1) per check
    [tables, selectedTableIdsSet]
  )
  const availableSelectedTables = useMemo(
    () =>
      selectedTables.filter(
        t => !t.session || t.session.status === 'available'
      ),
    [selectedTables]
  )
  const inUseSelectedTables = useMemo(
    () =>
      selectedTables.filter(t => t.session && t.session.status !== 'available'),
    [selectedTables]
  )

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
    const primaryTableId = selectedTableIds[0]
    if (!primaryTableId) return

    // Double-check table is still available
    const freshTable = useFloorPlanStore.getState().getTableById(primaryTableId)
    if (freshTable?.session && freshTable.session.status !== 'available') {
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

    // 2. Navigate immediately — no loading spinner
    setGuestModalOpen(false)
    clearSelection()
    setMergeMode(false)
    router.push(('/tables/' + primaryTableId) as Href)

    // 3. Register pending creation to prevent ensureOrderCreated from duplicating
    let resolveCreation: (dbOrderId: string | null) => void
    const creationPromise = new Promise<string | null>(resolve => {
      resolveCreation = resolve
    })
    registerPendingOrderCreation(newOrder.id, creationPromise)

    // 4. Fire seatGuests in background — don't block navigation
    try {
      const { orderId } = await useTableSessionStore.getState().seatGuests({
        tableIds: tableIdsToSeat,
        partySize: guestCount,
        createOrder: true,
        localOrderId: newOrder.id,
        selected_station: selectedStation?.id,
        device_id: device_id,
        serverId: assignedServerId
      })

      if (orderId && orderId !== newOrder.id) {
        // seatGuests already called updateOrderDbId — resolve the pending promise
        // hydrateOrderFromSeat already patched order_number/display_number from the RPC response
        resolveCreation!(orderId)
      } else {
        resolveCreation!(null)
      }
    } catch (err) {
      console.error('[GuestCountSubmit] Background seatGuests failed:', err)
      resolveCreation!(null)
      // Order still works locally — ensureOrderCreated will create backend order when first item is added
    }
  }

  return (
    <View className='flex-1 bg-screen px-2 py-1'>
      <View className='flex-1 flex-row bg-screen rounded-lg border border-border'>
        {/* NEW: Sidebar Component */}
        <Sidebar
          // layouts={layouts} REMOVED
          activeLayoutId={activeFloorPlanId}
          setActiveLayout={setActiveFloorPlan}
        />

        {/* Right Side: Floor Plan */}
        <View style={{ flex: 1, padding: 12, gap: 8 }}>
          {/* Top Bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Layout Tabs */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 3
              }}
            >
              {floorPlans.map(layout => (
                <TouchableOpacity
                  key={layout.id}
                  onPress={() => setActiveFloorPlan(layout.id)}
                  style={[
                    {
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 6
                    },
                    activeFloorPlanId === layout.id && {
                      backgroundColor: colors.screen
                    }
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
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
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 5,
                width: 200
              }}
            >
              <Search color={colors.muted} size={13} />
              <TextInput
                placeholder='Search tables...'
                placeholderTextColor={colors.muted}
                value={searchInput}
                onChangeText={setSearchInput}
                style={{
                  marginLeft: 6,
                  fontSize: 12,
                  flex: 1,
                  color: colors.heading,
                  includeFontPadding: false,
                  padding: 4
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
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: isMergeMode
                  ? colors.border + '30'
                  : colors.warning + '15',
                borderColor: isMergeMode ? colors.border : colors.warning + '50'
              }}
            >
              {isMergeMode ? (
                <X color={colors.label} size={13} />
              ) : (
                <GitMerge color={colors.warning} size={13} />
              )}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  marginLeft: 5,
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
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  borderWidth: 1,
                  backgroundColor: colors.teal + '15',
                  borderColor: colors.teal + '40'
                }}
              >
                <Users color={colors.teal} size={13} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.teal,
                    marginLeft: 5
                  }}
                >
                  Servers
                </Text>
              </TouchableOpacity>
            )}

            {/* Host Station */}
            <TouchableOpacity
              onPress={() => setHostStationOpen(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: colors.info + '15',
                borderColor: colors.info + '40'
              }}
            >
              <UtensilsCrossed color={colors.info} size={13} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.info,
                  marginLeft: 5
                }}
              >
                Host Station
              </Text>
            </TouchableOpacity>

            {/* Edit Layout */}
            <TouchableOpacity
              onPress={() => router.push(`/tables/floor-plan` as Href)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: colors.panel,
                borderColor: colors.border
              }}
            >
              <Pencil color={colors.label} size={13} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.label,
                  marginLeft: 5
                }}
              >
                Edit Layout
              </Text>
            </TouchableOpacity>
          </View>

          {/* Section Filter Pills */}
          {sections.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <TouchableOpacity
                onPress={() => setActiveSectionId(null)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 20,
                  borderWidth: 1,
                  backgroundColor: !activeSectionId
                    ? colors.teal
                    : 'transparent',
                  borderColor: !activeSectionId ? colors.teal : colors.border
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
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
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    borderRadius: 20,
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
                      fontSize: 11,
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
              borderRadius: 12,
              overflow: 'hidden'
            }}
          >
            {floorPlanLoading && tables.length === 0 ? (
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
                  top: 48,
                  right: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: colors.panel + 'F8',
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                {(
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
                      gap: 4
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: TABLE_STATUS_COLORS[status]
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '500',
                        color: colors.label
                      }}
                    >
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity
              onPress={() => setLegendVisible(v => !v)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                width: 32,
                height: 32,
                borderRadius: 16,
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
                size={16}
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
        onNavigate={handleSheetNavigate}
      />
      <GuestCountModal
        isOpen={isGuestModalOpen}
        onClose={handleCloseGuestModal}
        onSubmit={handleGuestCountSubmit}
      />

      {/* Server Section Manager */}
      <ServerSectionManager
        isOpen={isSectionManagerOpen}
        onClose={() => setSectionManagerOpen(false)}
      />

      {/* Host Station Modal */}
      <Modal
        visible={isHostStationOpen}
        animationType='fade'
        transparent
        onRequestClose={() => setHostStationOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          onPress={() => setHostStationOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: 480,
              height: '85%',
              backgroundColor: colors.screen,
              borderRadius: 16,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            {location_id ? (
              <HostStationScreenEnhanced location_id={location_id} />
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Please select a location
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

export default TablesScreen
