import { colors } from '@/lib/theme'
import { FloorPlanObject, WaitlistEntry } from '@/types/db-floor-plan-types'
import { ArrowRight, Users, X } from 'lucide-react-native'
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
      const aC = a.capacity || 0
      const bC = b.capacity || 0
      const aIdeal = aC >= entry.party_size && aC <= entry.party_size + 2
      const bIdeal = bC >= entry.party_size && bC <= entry.party_size + 2
      if (aIdeal && !bIdeal) return -1
      if (!aIdeal && bIdeal) return 1
      return aC - bC
    })
  }, [availableTables, entry])

  const renderTableItem = ({ item, index }: { item: FloorPlanObject; index: number }) => {
    const capacity = item.capacity || 0
    const isIdeal = !!(entry && capacity >= entry.party_size && capacity <= entry.party_size + 2)
    const isOver = !!(entry && capacity < entry.party_size)
    const isBooth = item.category === 'booth'

    return (
      <Pressable
        onPress={() => onSelectTable([item.id])}
        style={({ pressed }) => ({
          marginHorizontal: 14,
          marginBottom: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: isIdeal ? colors.teal + '60' : colors.border,
          backgroundColor: pressed ? colors.screen : isIdeal ? colors.teal + '0A' : colors.card,
          overflow: 'hidden',
        })}
      >
        {/* Ideal accent bar */}
        {isIdeal && <View style={{ height: 2, backgroundColor: colors.teal, marginBottom: 0 }} />}

        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
          {/* Position number */}
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isIdeal ? colors.teal + '18' : colors.screen, borderWidth: 1, borderColor: isIdeal ? colors.teal + '40' : colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: isIdeal ? colors.teal : colors.muted, fontSize: 12, fontWeight: '700' }}>{index + 1}</Text>
          </View>

          {/* Info */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: colors.heading, fontWeight: '700', fontSize: 14 }}>{item.name}</Text>
              {isBooth && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.info + '18', borderWidth: 1, borderColor: colors.info + '40' }}>
                  <Text style={{ color: colors.info, fontSize: 9, fontWeight: '700' }}>BOOTH</Text>
                </View>
              )}
              {isIdeal && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.teal + '18', borderWidth: 1, borderColor: colors.teal + '50' }}>
                  <Text style={{ color: colors.teal, fontSize: 9, fontWeight: '700' }}>BEST FIT</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Users size={11} color={isOver ? colors.warning : colors.muted} />
              <Text style={{ color: isOver ? colors.warning : colors.label, fontSize: 12 }}>
                Seats {capacity || 'unknown'}
              </Text>
              {entry && capacity > 0 && (
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  · {capacity - entry.party_size > 0 ? `+${capacity - entry.party_size} extra` : capacity < entry.party_size ? `${entry.party_size - capacity} short` : 'perfect fit'}
                </Text>
              )}
            </View>
          </View>

          {/* Action indicator */}
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isIdeal ? colors.teal + '18' : colors.screen, borderWidth: 1, borderColor: isIdeal ? colors.teal + '40' : colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowRight size={14} color={isIdeal ? colors.teal : colors.muted} />
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <Modal visible={isOpen} transparent animationType='fade' onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={{ width: 460, maxHeight: '75%', backgroundColor: colors.screen, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
            <View>
              <Text style={{ color: colors.heading, fontSize: 14, fontWeight: '700' }}>Seat Party</Text>
              {entry && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Users size={11} color={colors.muted} />
                    <Text style={{ color: colors.muted, fontSize: 11 }}>{entry.party_size} guest{entry.party_size !== 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={{ color: colors.border, fontSize: 11 }}>·</Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{entry.party_name}</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {availableTables.length > 0 && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.success + '18', borderWidth: 1, borderColor: colors.success + '40' }}>
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>{availableTables.length} available</Text>
                </View>
              )}
              <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 8, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}>
                <X size={14} color={colors.label} />
              </TouchableOpacity>
            </View>
          </View>

          {availableTables.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Users size={22} color={colors.muted} />
              </View>
              <Text style={{ color: colors.label, fontSize: 14, fontWeight: '600' }}>No tables available</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>All tables are currently occupied</Text>
            </View>
          ) : (
            <FlatList
              data={sortedTables}
              renderItem={renderTableItem}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default TableSelectionSheet
