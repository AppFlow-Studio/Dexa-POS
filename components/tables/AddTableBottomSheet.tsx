import { useDragToAddContext } from '@/contexts/DragToAddContext'
import { SHAPE_OPTIONS, TABLE_SHAPES } from '@/lib/table-shapes'
import { bottomSheetTheme, colors } from '@/lib/theme'
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet'
import React, { useMemo, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated'
import { DraggableShape } from './DraggableShape'

interface AddTableBottomSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet>
  onClose: () => void
}

const TABS = [
  { id: 'table', label: 'Tables' },
  { id: 'booth', label: 'Booths' },
  { id: 'structure', label: 'Structure' },
  { id: 'decor', label: 'Decor' },
  { id: 'functional', label: 'Functional' },
  { id: 'zone', label: 'Zones' },
]

export const AddTableBottomSheet: React.FC<AddTableBottomSheetProps> = ({ bottomSheetRef, onClose }) => {
  const snapPoints = useMemo(() => ['35%', '60%'], [])
  const [activeTab, setActiveTab] = useState('table')
  const { isDraggingNewObject } = useDragToAddContext()

  const closeSheet = () => bottomSheetRef.current?.close()

  const filteredShapes = useMemo(
    () => SHAPE_OPTIONS.filter(shape => shape.category === activeTab),
    [activeTab]
  )

  useAnimatedReaction(
    () => isDraggingNewObject.value,
    (isDragging, wasDragging) => {
      if (isDragging && !wasDragging) runOnJS(closeSheet)()
    },
    [isDraggingNewObject]
  )

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      {...bottomSheetTheme}
      backdropComponent={props => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
      )}
    >
      <BottomSheetView style={{ flex: 1, backgroundColor: colors.card }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.heading, fontSize: 13, fontWeight: '700' }}>Add to Floor Plan</Text>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Long-press an object and drag it onto the canvas</Text>
        </View>

        {/* Tab Bar */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10 }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: active ? colors.teal : 'transparent', marginRight: 2 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? colors.teal : colors.muted }}>{tab.label}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* Shape Grid */}
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {filteredShapes.map(({ id, label, component: ShapeComponent }) => (
              <View key={id} style={{ width: '48%' }}>
                <DraggableShape shapeId={id as keyof typeof TABLE_SHAPES}>
                  <View style={{ padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', height: 100, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <ShapeComponent color={colors.label} height={48} />
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, marginTop: 6 }} numberOfLines={1}>{label}</Text>
                  </View>
                </DraggableShape>
              </View>
            ))}
          </View>
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  )
}
