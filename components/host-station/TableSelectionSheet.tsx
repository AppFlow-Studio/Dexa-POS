import { colors } from '@/lib/theme'
import { FloorPlanObject, WaitlistEntry } from '@/types/db-floor-plan-types'
import { Check, Users, X } from 'lucide-react-native'
import React, { useMemo } from 'react'
import { FlatList, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native'

interface TableSelectionSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelectTable: (tableIds: string[]) => void
  entry: WaitlistEntry | null
  tables: FloorPlanObject[]
}

export const TableSelectionSheet: React.FC<TableSelectionSheetProps> = ({ isOpen, onClose, onSelectTable, entry, tables }) => {
  const availableTables = useMemo(
    () => tables.filter(t => (t.session?.status || 'available') === 'available' && (t.category === 'table' || t.category === 'booth')),
    [tables]
  )

  const sortedTables = useMemo(() => {
    if (!entry) return availableTables
    return [...availableTables].sort((a, b) => {
      const aCapacity = a.capacity || 0
      const bCapacity = b.capacity || 0
      const aIsIdeal = aCapacity >= entry.party_size && aCapacity <= entry.party_size + 2
      const bIsIdeal = bCapacity >= entry.party_size && bCapacity <= entry.party_size + 2
      if (aIsIdeal && !bIsIdeal) return -1
      if (!aIsIdeal && bIsIdeal) return 1
      return aCapacity - bCapacity
    })
  }, [availableTables, entry])

  const renderTableItem = ({ item }: { item: FloorPlanObject }) => {
    const isIdeal = entry && item.capacity && item.capacity >= entry.party_size && item.capacity <= entry.party_size + 2
    return (
      <Pressable
        onPress={() => onSelectTable([item.id])}
        style={{ marginHorizontal: 12, marginBottom: 6, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: isIdeal ? colors.teal + '50' : colors.border, backgroundColor: isIdeal ? colors.teal + '08' : colors.card }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.heading, fontWeight: '600', fontSize: 13 }}>
              {item.name}{item.category === 'booth' ? ' (Booth)' : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Users size={12} color={colors.muted} />
              <Text style={{ color: colors.label, fontSize: 11 }}>Capacity: {item.capacity || 'N/A'}</Text>
              {isIdeal && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: colors.teal + '18', borderWidth: 1, borderColor: colors.teal + '50' }}>
                  <Text style={{ color: colors.teal, fontSize: 10, fontWeight: '600' }}>Ideal</Text>
                </View>
              )}
            </View>
          </View>
          <Check size={16} color={colors.teal} />
        </View>
      </Pressable>
    )
  }

  return (
    <Modal visible={isOpen} transparent animationType='fade' onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={{ width: 380, maxHeight: '70%', backgroundColor: colors.screen, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View>
              <Text style={{ color: colors.heading, fontSize: 13, fontWeight: '700' }}>Select Table</Text>
              {entry && (
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                  {entry.party_name} · {entry.party_size} guest{entry.party_size !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <X size={14} color={colors.label} />
            </TouchableOpacity>
          </View>

          {availableTables.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 32 }}>
              <Text style={{ color: colors.label, fontSize: 13, fontWeight: '600' }}>No available tables</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>All tables are currently occupied</Text>
            </View>
          ) : (
            <FlatList
              data={sortedTables}
              renderItem={renderTableItem}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingTop: 10, paddingBottom: 16 }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default TableSelectionSheet
