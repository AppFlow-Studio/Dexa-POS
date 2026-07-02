import { TABLE_SHAPES } from '@/lib/table-shapes'
import { ensureOrderPrefetched } from '@/services/tableOrderPrefetch'
import React, { useCallback } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import TableCardContent, { PulsingBorder } from './TableCardContent'
import { DraggableTableProps } from './types'
import { useTableCardData } from './useTableCardData'

/**
 * View-mode card for real tables. Position is fixed (no drag), so it renders with
 * a plain View and an inline transform read straight from the table props —
 * **zero useSharedValue / useAnimatedStyle**. This is the common path on
 * `/tables` (one mount per table per visit) and is what eliminates the per-visit
 * native shared-value churn that was leaking memory.
 *
 * Non-table objects (walls, doors, etc.) never reach this component — they render
 * through ReadonlyStructure, which holds zero store subscriptions.
 */
const ReadonlyTable: React.FC<
  DraggableTableProps & {
    isTableType: boolean
    isWall: boolean
    shapeDef: (typeof TABLE_SHAPES)[keyof typeof TABLE_SHAPES] | undefined
  }
> = ({
  table,
  isTableType,
  isWall,
  shapeDef,
  isSelected,
  onPress,
  onLongPress,
  disableLongPress,
  sectionColor
}) => {
  const data = useTableCardData(table, isTableType, isWall, undefined, shapeDef)
  const { effectiveWidth, effectiveHeight, newAttention, liveSession } = data

  const handlePress = useCallback(() => {
    const orderId = liveSession?.order_id
    if (orderId) {
      ensureOrderPrefetched(orderId).catch(() => {})
    }
    onPress?.(table)
  }, [liveSession?.order_id, onPress, table])
  const handleLongPress = useCallback(
    () => onLongPress?.(table),
    [onLongPress, table]
  )

  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .enabled(!disableLongPress && isTableType)
    .onStart(() => {
      if (onLongPress) runOnJS(handleLongPress)()
    })

  const tapGesture = Gesture.Tap()
    .enabled(isTableType)
    .onEnd(() => {
      if (onPress) runOnJS(handlePress)()
    })

  const composedGesture = disableLongPress
    ? tapGesture
    : Gesture.Race(longPressGesture, tapGesture)

  return (
    <GestureDetector gesture={composedGesture}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: [
            { translateX: table.x },
            { translateY: table.y },
            { rotate: `${table.rotation || 0}deg` }
          ]
        }}
      >
        <View style={{ width: effectiveWidth, height: effectiveHeight }}>
          <TableCardContent
            table={table}
            data={data}
            isTableType={isTableType}
            isWall={isWall}
            isSelected={isSelected}
            isEditMode={false}
            isLocked={false}
            sectionColor={sectionColor}
          />
        </View>
        <PulsingBorder
          active={newAttention}
          width={effectiveWidth}
          height={effectiveHeight}
        />
      </View>
    </GestureDetector>
  )
}

export default ReadonlyTable
