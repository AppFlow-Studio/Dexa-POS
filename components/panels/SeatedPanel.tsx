import TableListItem from '@/components/tables/TableListItem'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import { colors } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import type { OrderProfile } from '@/lib/types'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import React, { useCallback, useMemo, useState } from 'react'
import { FlatList, Text, TouchableOpacity, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

type SortOption = 'time' | 'name' | 'guests' | 'total'
type SortDirection = 'asc' | 'desc'

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

const SeatedPanel: React.FC = () => {
  const tables = useFloorPlanStore(useShallow(s => s.tables))
  const liveSessions = useTableSessionStore(useShallow(s => s.sessions))
  const { activeEmployeeId } = useTimeclockStore()
  const { employees } = useEmployeeStore()

  const [activeFilter, setActiveFilter] = useState<
    'all' | 'my_tables' | 'by_server'
  >('all')
  const [expandedServers, setExpandedServers] = useState<
    Record<string, boolean>
  >({})
  const [sortOption, setSortOption] = useState<SortOption>('time')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [expandedTableIds, setExpandedTableIds] = useState<
    Record<string, boolean>
  >({})
  const toggleTableExpand = useCallback((tableId: string) => {
    setExpandedTableIds(prev => ({ ...prev, [tableId]: !prev[tableId] }))
  }, [])

  // Build the per-location order map inside a useShallow store read instead of
  // subscribing to the whole ordersById map. This re-renders SeatedPanel only
  // when a *kept* (seated, non-void) order's reference changes (immer keeps
  // untouched orders referentially stable) or the location→order set changes —
  // not on every mutation to any unrelated order. Iterating orderIds avoids the
  // Object.values allocation on each store change. Predicate is unchanged.
  const ordersByLocationId = useOrderStore(
    useShallow(s => {
      const map: Record<string, OrderProfile> = {}
      for (let i = 0; i < s.orderIds.length; i++) {
        const order = s.ordersById[s.orderIds[i]]
        if (order && order.service_location_id && order.order_status !== 'void') {
          map[order.service_location_id] = order
        }
      }
      return map
    })
  )

  const getTableOrderData = useCallback(
    (table: FloorPlanObject) => {
      const session = liveSessions[table.id] ?? table.session
      const order = ordersByLocationId[table.id]
      const seatedAt = session?.seated_at ?? order?.opened_at ?? null
      const seatedTime = seatedAt ? new Date(seatedAt).getTime() : 0
      const guestCount = session?.party_size ?? order?.guest_count ?? 0
      const fallbackTotal =
        order?.items.reduce((sum, item) => {
          if (item.is_voided) return sum
          return sum + item.price * item.quantity
        }, 0) ?? 0
      const total = order?.total_amount ?? order?.amount_due ?? fallbackTotal

      return {
        order,
        seatedTime,
        guestCount,
        total
      }
    },
    [liveSessions, ordersByLocationId]
  )

  const sortedSeatedTables = useMemo(() => {
    const activeStates = [
      'seated',
      'ordered',
      'served',
      'in use',
      'check_presented',
      'paid'
    ]
    const seatedTables = tables.filter(table => {
      if (table.category !== 'table' && table.category !== 'booth') return false
      const session = liveSessions[table.id] ?? table.session
      return activeStates.includes(
        (session?.status || 'available').toLowerCase()
      )
    })
    return seatedTables.sort((a, b) => {
      const aData = getTableOrderData(a)
      const bData = getTableOrderData(b)
      let compare = 0
      switch (sortOption) {
        case 'time':
          compare = aData.seatedTime - bData.seatedTime
          break
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'guests':
          compare = aData.guestCount - bData.guestCount
          break
        case 'total':
          compare = aData.total - bData.total
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [tables, getTableOrderData, sortOption, sortDirection, liveSessions])

  const serversWithTables = useMemo(() => {
    const serverTableMap: Record<string, FloorPlanObject[]> = {}
    sortedSeatedTables.forEach(table => {
      const order = ordersByLocationId[table.id]
      const serverName = order?.server_name || 'Unassigned'
      if (!serverTableMap[serverName]) serverTableMap[serverName] = []
      serverTableMap[serverName].push(table)
    })
    return serverTableMap
  }, [sortedSeatedTables, ordersByLocationId])

  const filteredSeatedTables = useMemo(() => {
    if (activeFilter === 'all') return sortedSeatedTables
    if (activeFilter === 'my_tables') {
      const currentUser = employees.find(e => e.id === activeEmployeeId)
      if (!currentUser) return []
      return sortedSeatedTables.filter(
        t => ordersByLocationId[t.id]?.server_name === currentUser.fullName
      )
    }
    return []
  }, [
    activeFilter,
    sortedSeatedTables,
    ordersByLocationId,
    activeEmployeeId,
    employees
  ])

  const toggleServerSection = (serverName: string) => {
    setExpandedServers(prev => ({ ...prev, [serverName]: !prev[serverName] }))
  }

  const renderContent = () => {
    if (activeFilter === 'by_server') {
      return (
        <FlatList
          data={Object.entries(serversWithTables)}
          keyExtractor={([serverName]) => serverName}
          renderItem={({ item: [serverName, serverTables] }) => (
            <Collapsible
              key={serverName}
              open={expandedServers[serverName] ?? true}
              onOpenChange={() => toggleServerSection(serverName)}
              style={{ marginBottom: 8 }}
            >
              <CollapsibleTrigger
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: colors.card
                }}
              >
                {expandedServers[serverName] ?? true ? (
                  <ChevronDown size={13} color={colors.muted} />
                ) : (
                  <ChevronRight size={13} color={colors.muted} />
                )}
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.label,
                    marginLeft: 6
                  }}
                >
                  {serverName}
                </Text>
              </CollapsibleTrigger>
              <CollapsibleContent style={{ paddingLeft: 4, paddingTop: 4 }}>
                {serverTables.map(table => (
                  <View key={table.id} style={{ marginBottom: 4 }}>
                    <TableListItem
                      table={table}
                      isExpanded={expandedTableIds[table.id] || false}
                      onToggleExpand={() => toggleTableExpand(table.id)}
                      onNavigateToOrder={() => {}}
                      handleTablePress={() => toggleTableExpand(table.id)}
                    />
                  </View>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
          contentContainerStyle={{ padding: 8 }}
          ListEmptyComponent={() => (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: colors.muted,
                  textAlign: 'center'
                }}
              >
                No seated tables for this filter.
              </Text>
            </View>
          )}
        />
      )
    }

    return (
      <FlatList
        data={filteredSeatedTables}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 4 }}>
            <TableListItem
              table={item}
              isExpanded={expandedTableIds[item.id] || false}
              onToggleExpand={() => toggleTableExpand(item.id)}
              onNavigateToOrder={() => {}}
              handleTablePress={() => toggleTableExpand(item.id)}
            />
          </View>
        )}
        contentContainerStyle={{ padding: 8 }}
        ListEmptyComponent={() => (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24
            }}
          >
            <Text
              style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}
            >
              No seated tables for this filter.
            </Text>
          </View>
        )}
      />
    )
  }

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'column',
        backgroundColor: colors.screen
      }}
    >
      {/* Filters + Sort */}
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: 6,
          zIndex: 10
        }}
      >
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <InlineSelect
            label='Filter'
            value={activeFilter === 'all' ? null : activeFilter}
            options={[
              { value: 'my_tables', label: 'My Tables' },
              { value: 'by_server', label: 'By Server' }
            ]}
            onSelect={v => setActiveFilter(v ?? 'all')}
          />
          <InlineSelect
            label='Sort'
            value={sortOption}
            options={[
              { value: 'time', label: 'Time' },
              { value: 'name', label: 'Name' },
              { value: 'guests', label: 'Guests' },
              { value: 'total', label: 'Total' }
            ]}
            onSelect={v => v && setSortOption(v)}
            nullable={false}
          />
          <InlineSelect
            label='Order'
            value={sortDirection}
            options={[
              { value: 'asc', label: 'Asc' },
              { value: 'desc', label: 'Desc' }
            ]}
            onSelect={v => v && setSortDirection(v)}
            nullable={false}
          />
        </View>
      </View>

      {renderContent()}
    </View>
  )
}

export default SeatedPanel
