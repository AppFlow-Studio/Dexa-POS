import HostStationScreenEnhanced from '@/components/host-station/HostStationScreenEnhanced'
import { GuestCountModal } from '@/components/tables/GuestCountModal'
import TableOrderView from '@/components/tables/TableOrderView'
import MergeActionBar from '@/components/tables/MergeActionBar'
import Sidebar from '@/components/tables/Sidebar'
import TableContextSheet from '@/components/tables/TableContextSheet'
import TableLayoutSkeleton from '@/components/tables/TableLayoutSkeleton'
import TableLayoutView from '@/components/tables/TableLayoutView'
import { useLoading } from '@/contexts/LoadingContext'
import { useLocationRealtime } from '@/contexts/LocationRealtimeProvider'
import { useToast } from '@/contexts/ToastContext'
import { getDeviceId } from '@/lib/deviceId'
import { colors, TABLE_STATUS_COLORS } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import {
  registerPendingOrderCreation,
  useOrderStore
} from '@/stores/useOrderStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import { setWaitlistSupabaseClient } from '@/stores/useWaitlistStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import { Href, useRouter } from 'expo-router'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { GitMerge, Pencil, Search, UtensilsCrossed, X } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

const TablesScreen = () => {
  const router = useRouter()
  // Subscribe to tables directly to ensure real-time updates
  const tables = useFloorPlanStore(s => s.tables)
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

  const [searchInput, setSearchInput] = useState('')
  const [searchText, setSearchText] = useState('')
  const [isGuestModalOpen, setGuestModalOpen] = useState(false)
  const [isMergeMode, setMergeMode] = useState(false)
  const [contextTable, setContextTable] = useState<FloorPlanObject | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [isHostStationOpen, setHostStationOpen] = useState(false)
  const [overlayTableId, setOverlayTableId] = useState<string | null>(null)

  useEffect(() => {
    if (supabaseClient) {
      setWaitlistSupabaseClient(supabaseClient)
    }
  }, [supabaseClient])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(searchInput), 200)
    return () => clearTimeout(timer)
  }, [searchInput])

  // DEFERRED RENDERING: Wait for navigation transition to complete
  const [isReady, setIsReady] = useState(false)
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsReady(true)
    })
    return () => handle.cancel()
  }, [])

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
      setOverlayTableId(tableId)
    },
    [tables, getOrder, setActiveOrder, router]
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
          setOverlayTableId(table.id)

          // Background sync for fresh data (no-op if order already current)
          syncOrderFromDatabase(orderId)
            .then(localOrderId => {
              if (localOrderId) setActiveOrder(localOrderId)
            })
            .catch(() => {})
        } else {
          setOverlayTableId(table.id)
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
      setActiveOrder,
      router
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

    const tableIdsToSeat = isMergeMode ? selectedTableIds : [primaryTableId]

    // 1. Create local order immediately (synchronous — ~0ms)
    const newOrder = startNewOrder({ tableId: primaryTableId, guestCount })
    setActiveOrder(newOrder.id)

    // 2. Navigate immediately — no loading spinner
    setGuestModalOpen(false)
    clearSelection()
    setMergeMode(false)
    router.replace({
      pathname: '/tables/[tableId]',
      params: { tableId: primaryTableId }
    })

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
        device_id: device_id
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
        <View className='flex-1 p-4'>
          <View className='flex-row items-center mb-3 gap-3'>
            {/* Layout Tabs */}
            <View className='flex-row items-center bg-panel border border-border p-1 rounded-xl ml-2'>
              {floorPlans.map(layout => (
                <TouchableOpacity
                  key={layout.id}
                  onPress={() => setActiveFloorPlan(layout.id)}
                  className={`py-2 px-4 rounded-lg ${
                    activeFloorPlanId === layout.id ? 'bg-screen' : ''
                  }`}
                >
                  <Text
                    className={`text-lg font-semibold ${
                      activeFloorPlanId === layout.id
                        ? 'text-teal'
                        : 'text-label'
                    }`}
                  >
                    {layout.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search Bar */}
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              className='flex-1 flex-row items-center bg-panel border border-border rounded-lg px-3 max-w-sm'
            >
              <Search color={colors.label} size={20} />
              <TextInput
                placeholder='Search table name...'
                placeholderTextColor={colors.label}
                value={searchInput}
                onChangeText={setSearchInput}
                className='ml-2 text-lg h-12 flex-1 text-white'
              />
            </KeyboardAvoidingView>

            {/* Merge Tables Toggle Button */}
            <TouchableOpacity
              onPress={() => {
                if (isMergeMode) {
                  handleCancelMerge()
                } else {
                  clearSelection()
                  setMergeMode(true)
                }
              }}
              className={`py-2 px-4 flex-row items-center justify-center rounded-lg border ${
                isMergeMode
                  ? 'bg-gray-600 border-gray-500'
                  : 'bg-amber-600 border-amber-500'
              }`}
            >
              {isMergeMode ? (
                <X color='white' size={20} />
              ) : (
                <GitMerge color='white' size={20} />
              )}
              <Text className='text-lg font-bold text-white ml-2'>
                {isMergeMode ? 'Cancel' : 'Merge Tables'}
              </Text>
            </TouchableOpacity>

            {/* Host Station Button */}
            <TouchableOpacity
              onPress={() => setHostStationOpen(true)}
              className='py-2 px-4 flex-row items-center justify-center rounded-lg bg-purple-600 border border-purple-500'
            >
              <UtensilsCrossed color='white' size={18} />
              <Text className='text-lg font-bold text-white ml-2'>
                Host Station
              </Text>
            </TouchableOpacity>

            {/* Edit Layout Button */}
            <TouchableOpacity
              onPress={() => router.push(`/tables/floor-plan` as Href)}
              className='py-2 px-4 flex-row items-center justify-center rounded-lg bg-blue-600 border border-blue-500'
            >
              <Pencil color='white' size={18} />
              <Text className='text-lg font-bold text-white ml-2'>
                Edit Layout
              </Text>
            </TouchableOpacity>
          </View>

          {/* Section Filter Pills */}
          {sections.length > 0 && (
            <View
              className='flex-row gap-2 px-4 py-3 overflow-x-auto'
              style={{ marginHorizontal: -8 }}
            >
              <TouchableOpacity
                onPress={() => setActiveSectionId(null)}
                className={`px-3 py-1.5 rounded-full border ${
                  !activeSectionId
                    ? 'bg-teal border-teal'
                    : 'border-border bg-transparent'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    !activeSectionId ? 'text-black' : 'text-label'
                  }`}
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
                  className='px-3 py-1.5 rounded-full border'
                  style={{
                    borderColor: section.color,
                    backgroundColor:
                      activeSectionId === section.id
                        ? section.color
                        : 'transparent'
                  }}
                >
                  <Text
                    className='text-sm font-semibold text-white'
                    style={{
                      color:
                        activeSectionId === section.id ? '#000' : section.color
                    }}
                  >
                    {section.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Map Container */}
          <View className='bg-screen border border-border rounded-xl flex-1 relative'>
            {!isReady || (floorPlanLoading && tables.length === 0) ? (
              <TableLayoutSkeleton tableCount={10} showControls={true} />
            ) : (
              <TableLayoutView
                tables={filteredTables || []}
                isSelectionMode={true}
                onTableSelect={handleTablePress}
                showConnections={true}
                layoutId={activeFloorPlanId || ''}
                sectionsById={sectionsById}
                onTableLongPress={handleTableLongPress}
              />
            )}

            {/* Merge Mode Action Bar */}
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

            {/* Status Indicators (Bottom Center) */}
            <View className='absolute bottom-3 left-0 right-0 flex-row justify-center'>
              <View className='flex-row items-center gap-4 p-3 rounded-full bg-screen/90 border border-border flex-wrap'>
                {/* Available */}
                <View className='flex-row items-center gap-2'>
                  <View
                    className='w-3 h-3 rounded-full'
                    style={{ backgroundColor: TABLE_STATUS_COLORS.available }}
                  />
                  <Text className='text-sm font-semibold text-label'>
                    Available
                  </Text>
                </View>
                {/* Seated */}
                <View className='flex-row items-center gap-2'>
                  <View
                    className='w-3 h-3 rounded-full'
                    style={{ backgroundColor: TABLE_STATUS_COLORS.seated }}
                  />
                  <Text className='text-sm font-semibold text-label'>
                    Seated
                  </Text>
                </View>
                {/* Ordered */}
                <View className='flex-row items-center gap-2'>
                  <View
                    className='w-3 h-3 rounded-full'
                    style={{ backgroundColor: TABLE_STATUS_COLORS.ordered }}
                  />
                  <Text className='text-sm font-semibold text-label'>
                    Ordered
                  </Text>
                </View>
                {/* Served */}
                <View className='flex-row items-center gap-2'>
                  <View
                    className='w-3 h-3 rounded-full'
                    style={{ backgroundColor: TABLE_STATUS_COLORS.served }}
                  />
                  <Text className='text-sm font-semibold text-label'>
                    Served
                  </Text>
                </View>
                {/* Check Presented */}
                <View className='flex-row items-center gap-2'>
                  <View
                    className='w-3 h-3 rounded-full'
                    style={{
                      backgroundColor: TABLE_STATUS_COLORS.check_presented
                    }}
                  />
                  <Text className='text-sm font-semibold text-label'>
                    Check
                  </Text>
                </View>
                {/* Paid */}
                <View className='flex-row items-center gap-2'>
                  <View
                    className='w-3 h-3 rounded-full'
                    style={{ backgroundColor: TABLE_STATUS_COLORS.paid }}
                  />
                  <Text className='text-sm font-semibold text-label'>Paid</Text>
                </View>
                {/* Cleaning */}
                <View className='flex-row items-center gap-2'>
                  <View
                    className='w-3 h-3 rounded-full'
                    style={{ backgroundColor: TABLE_STATUS_COLORS.cleaning }}
                  />
                  <Text className='text-sm font-semibold text-label'>
                    Cleaning
                  </Text>
                </View>
                {/* Not in Service */}
                <View className='flex-row items-center gap-2'>
                  <View
                    className='w-3 h-3 rounded-full'
                    style={{
                      backgroundColor: TABLE_STATUS_COLORS.not_in_service
                    }}
                  />
                  <Text className='text-sm font-semibold text-label'>
                    Blocked
                  </Text>
                </View>
              </View>
            </View>
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

      {overlayTableId && (
        <TableOrderView
          tableId={overlayTableId}
          onClose={() => setOverlayTableId(null)}
        />
      )}

      {/* Host Station Modal */}
      <Modal
        visible={isHostStationOpen}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={() => setHostStationOpen(false)}
      >
        <SafeAreaView className='flex-1 bg-screen'>
          <View className='flex-row items-center justify-between px-4 py-3 border-b border-border'>
            <Text className='text-xl font-bold text-white'>Host Station</Text>
            <TouchableOpacity onPress={() => setHostStationOpen(false)}>
              <X color={colors.label} size={24} />
            </TouchableOpacity>
          </View>
          <View className='flex-1'>
            {location_id ? (
              <HostStationScreenEnhanced location_id={location_id} />
            ) : (
              <View className='flex-1 items-center justify-center'>
                <Text className='text-label'>Please select a location</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

export default TablesScreen
