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
import { FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import Animated, { Easing, Layout } from 'react-native-reanimated'

interface SectionProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({ title, isOpen, onToggle, children }) => (
  <Animated.View layout={Layout.easing(Easing.inOut(Easing.ease)).duration(200)} style={{ flex: 1 }}>
    <TouchableOpacity
      onPress={onToggle}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
      }}
    >
      {isOpen
        ? <ChevronDown size={14} color={colors.muted} />
        : <ChevronRight size={14} color={colors.muted} />}
      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 6 }}>
        {title}
      </Text>
    </TouchableOpacity>
    {isOpen && (
      <Animated.View layout={Layout.easing(Easing.inOut(Easing.ease)).duration(200)} style={{ flex: 1, paddingLeft: 4 }}>
        {children}
      </Animated.View>
    )}
  </Animated.View>
)

const FilterPill: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({ label, active, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
      borderWidth: 1,
      backgroundColor: active ? colors.teal + '20' : colors.screen,
      borderColor: active ? colors.teal + '50' : colors.border,
      marginRight: 6,
    }}
  >
    <Text style={{ fontSize: 11, fontWeight: '600', color: active ? colors.teal : colors.label }}>
      {label}
    </Text>
  </TouchableOpacity>
)

const TablesPanel: React.FC = () => {
  const floorPlans = useFloorPlanStore(s => s.floorPlans)
  const tables = useFloorPlanStore(s => s.tables)
  const activeFloorPlanId = useFloorPlanStore(s => s.activeFloorPlanId)
  const sectionsById = useFloorPlanStore(s => s.sectionsById)
  const liveSessions = useTableSessionStore(s => s.sessions)
  const [sections, setSections] = useState<{ [key: string]: boolean }>({})
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)

  const activePlanName = useMemo(() => {
    return floorPlans.find(p => p.id === activeFloorPlanId)?.name || 'Dining Area'
  }, [floorPlans, activeFloorPlanId])

  useMemo(() => {
    if (activeFloorPlanId && sections[activeFloorPlanId] === undefined) {
      setSections(prev => ({ ...prev, [activeFloorPlanId]: true }))
    }
  }, [activeFloorPlanId])

  const activeTables = tables
  const isSeatable = (t: FloorPlanObject) => t.category === 'table' || t.category === 'booth'
  const getEmployeeByStaffId = useEmployeeStore(s => s.getEmployeeByStaffId)

  const { uniqueSections, uniqueServers, serverNames } = useMemo(() => {
    const sectionSet = new Set<string>()
    const serverSet = new Set<string>()
    const nameMap: Record<string, string> = {}
    activeTables.forEach(table => {
      if (table.section_id) sectionSet.add(table.section_id)
      const session = liveSessions[table.id] ?? table.session
      if (session?.server_staff_id) {
        const staffId = session.server_staff_id
        serverSet.add(staffId)
        if (!nameMap[staffId]) {
          const employee = getEmployeeByStaffId(staffId)
          nameMap[staffId] = employee?.fullName || staffId.substring(0, 8)
        }
      }
    })
    return { uniqueSections: Array.from(sectionSet), uniqueServers: Array.from(serverSet), serverNames: nameMap }
  }, [activeTables, getEmployeeByStaffId, liveSessions])

  const displayTables = useMemo(() => {
    const seenSessionIds = new Set<string>()
    let filtered = activeTables.filter(table => {
      if (!isSeatable(table)) return false
      const session = liveSessions[table.id] ?? table.session
      if (!session?.merged_tables?.length) return true
      const sid = session.id
      if (seenSessionIds.has(sid)) return false
      seenSessionIds.add(sid)
      return true
    })
    if (selectedSectionId) filtered = filtered.filter(t => t.section_id === selectedSectionId)
    if (selectedServerId) {
      filtered = filtered.filter(table => {
        const session = liveSessions[table.id] ?? table.session
        return session?.server_staff_id === selectedServerId
      })
    }
    return filtered
  }, [activeTables, selectedSectionId, selectedServerId, liveSessions])

  const occupiedTables = useMemo(() => {
    const activeStatuses = ['seated', 'ordered', 'served', 'check_presented', 'paid']
    return displayTables.filter(table => {
      const session = liveSessions[table.id] ?? table.session
      return activeStatuses.includes(session?.status?.toLowerCase() || '')
    })
  }, [displayTables, liveSessions])

  const totalTables = displayTables.length
  const capacityPercentage = useMemo(
    () => totalTables > 0 ? Math.floor((occupiedTables.length / totalTables) * 100) : 0,
    [occupiedTables.length, totalTables]
  )

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const locationId = useStoreSettingsStore.getState().selectedStore?.id
      await useFloorPlanStore.getState().loadFloorPlanStatus()
      if (locationId) await useOrderStore.getState().initializeOrders(locationId, true)
    } catch (error) {
      console.error('Failed to refresh sidebar:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const isSectionOpen = activeFloorPlanId ? sections[activeFloorPlanId] ?? true : true
  const handleToggleSection = useCallback(() => {
    if (activeFloorPlanId) setSections(s => ({ ...s, [activeFloorPlanId]: !s[activeFloorPlanId] }))
  }, [activeFloorPlanId])

  const noopFn = useCallback(() => {}, [])
  const renderTableItem = useCallback(
    ({ item }: { item: FloorPlanObject }) => (
      <TableListItem key={item.id} table={item} isExpanded={false} onToggleExpand={noopFn} onNavigateToOrder={noopFn} handleTablePress={noopFn} />
    ), [noopFn]
  )
  const keyExtractor = useCallback((item: FloorPlanObject) => item.id, [])

  return (
    <View style={{ flex: 1, flexDirection: 'column', backgroundColor: colors.screen }}>
      {/* Capacity bar */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>{occupiedTables.length}/{totalTables} tables</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>{capacityPercentage}% capacity</Text>
        </View>
        <View style={{ height: 4, backgroundColor: colors.card, borderRadius: 2, overflow: 'hidden' }}>
          <View style={{ width: `${capacityPercentage}%`, height: '100%', backgroundColor: colors.teal, borderRadius: 2 }} />
        </View>
      </View>

      {/* Filters */}
      {(uniqueSections.length > 0 || uniqueServers.length > 0) && (
        <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 }}>
          {uniqueSections.length > 0 && (
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Section
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <FilterPill label="All" active={selectedSectionId === null} onPress={() => setSelectedSectionId(null)} />
                {uniqueSections.map(sectionId => (
                  <FilterPill
                    key={sectionId}
                    label={sectionsById[sectionId]?.name || sectionId.substring(0, 6)}
                    active={selectedSectionId === sectionId}
                    onPress={() => setSelectedSectionId(sectionId)}
                  />
                ))}
              </ScrollView>
            </View>
          )}
          {uniqueServers.length > 0 && (
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Server
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <FilterPill label="All" active={selectedServerId === null} onPress={() => setSelectedServerId(null)} />
                {uniqueServers.map(serverId => (
                  <FilterPill
                    key={serverId}
                    label={serverNames[serverId] || serverId.substring(0, 8)}
                    active={selectedServerId === serverId}
                    onPress={() => setSelectedServerId(serverId)}
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* Table list */}
      <View style={{ flex: 1, padding: 8 }}>
        <Section title={activePlanName} isOpen={isSectionOpen} onToggle={handleToggleSection}>
          {isSectionOpen && (
            <FlatList
              data={displayTables}
              keyExtractor={keyExtractor}
              renderItem={renderTableItem}
              ListEmptyComponent={<Text style={{ fontSize: 12, color: colors.muted, padding: 8, fontStyle: 'italic' }}>No tables assigned</Text>}
              initialNumToRender={8}
              maxToRenderPerBatch={5}
              windowSize={3}
              removeClippedSubviews={true}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.teal} />
              }
            />
          )}
        </Section>
      </View>
    </View>
  )
}

export default TablesPanel
