import TableListItem from '@/components/tables/TableListItem'
import { colors } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import React, { useCallback, useMemo, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, { Easing, Layout } from 'react-native-reanimated'

interface SectionProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({
  title,
  isOpen,
  onToggle,
  children
}) => (
  <Animated.View
    layout={Layout.easing(Easing.inOut(Easing.ease)).duration(200)}
    style={{ flex: 1 }}
  >
    <TouchableOpacity
      onPress={onToggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 8
      }}
    >
      {isOpen ? (
        <ChevronDown size={14} color={colors.muted} />
      ) : (
        <ChevronRight size={14} color={colors.muted} />
      )}
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginLeft: 6
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
    {isOpen && (
      <Animated.View
        layout={Layout.easing(Easing.inOut(Easing.ease)).duration(200)}
        style={{ flex: 1, paddingLeft: 4 }}
      >
        {children}
      </Animated.View>
    )}
  </Animated.View>
)

interface InlineSelectProps<T extends string> {
  label: string
  value: T | null
  options: { value: T; label: string }[]
  onSelect: (value: T | null) => void
  nullable?: boolean
}

function InlineSelect<T extends string> ({
  label,
  value,
  options,
  onSelect,
  nullable = true
}: InlineSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const selectedLabel = value
    ? options.find(o => o.value === value)?.label ?? value
    : null

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity
        onPress={() => setOpen(o => !o)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
          borderWidth: 1,
          backgroundColor: value ? colors.teal + '15' : colors.card,
          borderColor: value ? colors.teal + '40' : colors.border
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: value ? colors.teal : colors.muted,
            flex: 1
          }}
          numberOfLines={1}
        >
          {selectedLabel ?? label}
        </Text>
        <ChevronDown
          size={12}
          color={value ? colors.teal : colors.muted}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {open && (
        <View
          style={{
            position: 'absolute',
            top: 34,
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            overflow: 'hidden'
          }}
        >
          {nullable && (
            <TouchableOpacity
              onPress={() => {
                onSelect(null)
                setOpen(false)
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: !value ? colors.teal + '15' : 'transparent',
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: !value ? colors.teal : colors.label
                }}
              >
                All
              </Text>
            </TouchableOpacity>
          )}
          {options.map(opt => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => {
                onSelect(opt.value)
                setOpen(false)
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor:
                  value === opt.value ? colors.teal + '15' : 'transparent'
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: value === opt.value ? colors.teal : colors.label
                }}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

const TablesPanel: React.FC = () => {
  const floorPlans = useFloorPlanStore(s => s.floorPlans)
  const tables = useFloorPlanStore(s => s.tables)
  const activeFloorPlanId = useFloorPlanStore(s => s.activeFloorPlanId)
  const liveSessions = useTableSessionStore(s => s.sessions)
  const [sections, setSections] = useState<{ [key: string]: boolean }>({})
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [expandedTableIds, setExpandedTableIds] = useState<
    Record<string, boolean>
  >({})
  type SortMode = 'name' | 'status' | 'duration'
  const [sortMode, setSortMode] = useState<SortMode>('status')

  const activePlanName = useMemo(() => {
    return (
      floorPlans.find(p => p.id === activeFloorPlanId)?.name || 'Dining Area'
    )
  }, [floorPlans, activeFloorPlanId])

  useMemo(() => {
    if (activeFloorPlanId && sections[activeFloorPlanId] === undefined) {
      setSections(prev => ({ ...prev, [activeFloorPlanId]: true }))
    }
  }, [activeFloorPlanId])

  const activeTables = tables
  const isSeatable = (t: FloorPlanObject) =>
    t.category === 'table' || t.category === 'booth'
  const getEmployeeByStaffId = useEmployeeStore(s => s.getEmployeeByStaffId)

  const STATUS_ORDER: Record<string, number> = {
    ordered: 0,
    seated: 1,
    served: 2,
    check_presented: 3,
    paid: 4,
    cleaning: 5,
    available: 6
  }

  const ACTIVE_STATUSES = new Set(['seated', 'ordered', 'served', 'check_presented', 'paid'])

  const { uniqueServers, serverNames, displayTables, occupiedCount, capacityPercentage } = useMemo(() => {
    const serverSet = new Set<string>()
    const nameMap: Record<string, string> = {}
    const seenSessionIds = new Set<string>()
    const filtered: typeof activeTables = []
    let occupied = 0

    for (const table of activeTables) {
      const session = liveSessions[table.id] ?? table.session

      // Collect server info in same pass
      if (session?.server_staff_id) {
        const staffId = session.server_staff_id
        serverSet.add(staffId)
        if (!nameMap[staffId]) {
          const employee = getEmployeeByStaffId(staffId)
          nameMap[staffId] = employee?.fullName || staffId.substring(0, 8)
        }
      }

      // Filter: must be seatable and dedupe merged sessions
      if (!isSeatable(table)) continue
      if (session?.merged_tables?.length) {
        const sid = session.id
        if (seenSessionIds.has(sid)) continue
        seenSessionIds.add(sid)
      }

      // Filter by selected server
      if (selectedServerId && session?.server_staff_id !== selectedServerId) continue

      filtered.push(table)
      if (ACTIVE_STATUSES.has(session?.status?.toLowerCase() || '')) occupied++
    }

    filtered.sort((a, b) => {
      const sessionA = liveSessions[a.id] ?? a.session
      const sessionB = liveSessions[b.id] ?? b.session
      if (sortMode === 'name') return a.name.localeCompare(b.name)
      if (sortMode === 'status') {
        const sa = STATUS_ORDER[sessionA?.status?.toLowerCase() ?? ''] ?? 99
        const sb = STATUS_ORDER[sessionB?.status?.toLowerCase() ?? ''] ?? 99
        return sa - sb
      }
      if (sortMode === 'duration') {
        const ta = sessionA?.seated_at ? new Date(sessionA.seated_at).getTime() : Infinity
        const tb = sessionB?.seated_at ? new Date(sessionB.seated_at).getTime() : Infinity
        return ta - tb
      }
      return 0
    })

    return {
      uniqueServers: Array.from(serverSet),
      serverNames: nameMap,
      displayTables: filtered,
      occupiedCount: occupied,
      capacityPercentage: filtered.length > 0 ? Math.floor((occupied / filtered.length) * 100) : 0,
    }
  }, [activeTables, getEmployeeByStaffId, liveSessions, selectedServerId, sortMode])

  const totalTables = displayTables.length

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const locationId = useStoreSettingsStore.getState().selectedStore?.id
      await useFloorPlanStore.getState().loadFloorPlanStatus()
      if (locationId)
        await useOrderStore.getState().initializeOrders(locationId, true)
    } catch (error) {
      console.error('Failed to refresh sidebar:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const isSectionOpen = activeFloorPlanId
    ? sections[activeFloorPlanId] ?? true
    : true
  const handleToggleSection = useCallback(() => {
    if (activeFloorPlanId)
      setSections(s => ({ ...s, [activeFloorPlanId]: !s[activeFloorPlanId] }))
  }, [activeFloorPlanId])

  const noopFn = useCallback(() => {}, [])
  const toggleTableExpand = useCallback((tableId: string) => {
    setExpandedTableIds(prev => ({ ...prev, [tableId]: !prev[tableId] }))
  }, [])
  const renderTableItem = useCallback(
    ({ item }: { item: FloorPlanObject }) => (
      <TableListItem
        key={item.id}
        table={item}
        isExpanded={expandedTableIds[item.id] || false}
        onToggleExpand={() => toggleTableExpand(item.id)}
        onNavigateToOrder={noopFn}
        handleTablePress={noopFn}
      />
    ),
    [expandedTableIds, noopFn, toggleTableExpand]
  )
  const keyExtractor = useCallback((item: FloorPlanObject) => item.id, [])

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'column',
        backgroundColor: colors.screen
      }}
    >
      {/* Capacity bar */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 6
          }}
        >
          <Text style={{ fontSize: 11, color: colors.muted }}>
            {occupiedCount}/{totalTables} tables
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>
            {capacityPercentage}% capacity
          </Text>
        </View>
        <View
          style={{
            height: 4,
            backgroundColor: colors.card,
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              width: `${capacityPercentage}%`,
              height: '100%',
              backgroundColor: colors.teal,
              borderRadius: 2
            }}
          />
        </View>
      </View>

      {/* Filters + Sort */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: 6,
          zIndex: 10
        }}
      >
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <InlineSelect
            label='Server'
            value={selectedServerId}
            options={uniqueServers.map(id => ({
              value: id,
              label: serverNames[id] || id.substring(0, 8)
            }))}
            onSelect={setSelectedServerId}
          />
          <InlineSelect
            label='Sort'
            value={sortMode}
            options={[
              { value: 'name', label: 'Name' },
              { value: 'status', label: 'Status' },
              { value: 'duration', label: 'Duration' }
            ]}
            onSelect={v => v && setSortMode(v)}
            nullable={false}
          />
        </View>
      </View>

      {/* Table list */}
      <View style={{ flex: 1, padding: 8 }}>
        <Section
          title={activePlanName}
          isOpen={isSectionOpen}
          onToggle={handleToggleSection}
        >
          {isSectionOpen && (
            <FlatList
              data={displayTables}
              keyExtractor={keyExtractor}
              renderItem={renderTableItem}
              ListEmptyComponent={
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.muted,
                    padding: 8,
                    fontStyle: 'italic'
                  }}
                >
                  No tables assigned
                </Text>
              }
              initialNumToRender={8}
              maxToRenderPerBatch={5}
              windowSize={3}
              removeClippedSubviews={true}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.teal}
                />
              }
            />
          )}
        </Section>
      </View>
    </View>
  )
}

export default TablesPanel
