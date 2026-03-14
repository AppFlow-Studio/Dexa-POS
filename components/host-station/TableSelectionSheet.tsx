import { colors } from '@/lib/theme'
import { FloorPlanObject, WaitlistEntry } from '@/types/db-floor-plan-types'
import { Check, Users, X } from 'lucide-react-native'
import React, { useMemo } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

interface TableSelectionSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelectTable: (tableIds: string[]) => void
  entry: WaitlistEntry | null
  tables: FloorPlanObject[]
}

export const TableSelectionSheet: React.FC<TableSelectionSheetProps> = ({
  isOpen,
  onClose,
  onSelectTable,
  entry,
  tables
}) => {
  const availableTables = useMemo(
    () =>
      tables.filter(
        t =>
          (t.session?.status || 'available') === 'available' &&
          (t.category === 'table' || t.category === 'booth')
      ),
    [tables]
  )

  const sortedTables = useMemo(() => {
    if (!entry) return availableTables

    return [...availableTables].sort((a, b) => {
      const aCapacity = a.capacity || 0
      const bCapacity = b.capacity || 0

      const aIsIdeal =
        aCapacity >= entry.party_size && aCapacity <= entry.party_size + 2
      const bIsIdeal =
        bCapacity >= entry.party_size && bCapacity <= entry.party_size + 2

      if (aIsIdeal && !bIsIdeal) return -1
      if (!aIsIdeal && bIsIdeal) return 1

      return aCapacity - bCapacity
    })
  }, [availableTables, entry])

  const renderTableItem = ({ item }: { item: FloorPlanObject }) => {
    const isIdeal =
      entry &&
      item.capacity &&
      item.capacity >= entry.party_size &&
      item.capacity <= entry.party_size + 2

    return (
      <Pressable
        onPress={() => onSelectTable([item.id])}
        className='mx-3 mb-3 p-3 rounded-lg border border-border bg-card overflow-hidden'
      >
        <View className='flex-row items-center justify-between'>
          <View className='flex-1'>
            <Text className='text-white font-semibold text-base'>
              {item.name}
              {item.category === 'booth' ? ' (Booth)' : ''}
            </Text>
            <View className='flex-row items-center gap-2 mt-2'>
              <Users size={14} color={colors.label} />
              <Text className='text-label text-sm'>
                Capacity: {item.capacity || 'N/A'}
              </Text>
              {isIdeal && (
                <View className='ml-auto px-2 py-1 rounded bg-teal/20 border border-teal'>
                  <Text className='text-teal text-xs font-semibold'>Ideal</Text>
                </View>
              )}
            </View>
          </View>
          <View className='ml-2'>
            <Check size={20} color={colors.teal} />
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType='slide'
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={e => e.stopPropagation()} style={{ maxHeight: '55%', backgroundColor: colors.panel, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
          <SafeAreaView style={{ backgroundColor: colors.panel, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            {/* Header */}
            <View className='px-4 pt-2 pb-4 border-b border-border flex-row items-start justify-between'>
              <View>
                <Text className='text-white text-lg font-bold'>
                  Select Table for {entry?.party_name}
                </Text>
                <Text className='text-muted text-sm mt-1'>
                  {entry?.party_size} guest{entry && entry.party_size !== 1 ? 's' : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} className='p-1'>
                <X size={20} color={colors.label} />
              </TouchableOpacity>
            </View>

            {availableTables.length === 0 ? (
              <View className='items-center justify-center px-4 py-12'>
                <Text className='text-muted text-center text-base'>
                  No available tables
                </Text>
                <Text className='text-label text-center text-sm mt-2'>
                  All tables are currently occupied
                </Text>
              </View>
            ) : (
              <FlatList
                data={sortedTables}
                renderItem={renderTableItem}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingTop: 12, paddingBottom: 20 }}
              />
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default TableSelectionSheet
