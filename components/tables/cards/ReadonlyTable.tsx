import { TABLE_SHAPES } from '@/lib/table-shapes'
import { ensureOrderPrefetched } from '@/services/tableOrderPrefetch'
import { useQrGuestAlertsStore } from '@/stores/useQrGuestAlertsStore'
import { Bell } from 'lucide-react-native'
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

  // QR guest "call server" indicator — pure overlay chrome keyed by the
  // table's label matching an open alert. Never touches session state
  // (QR orders must not seize dining state). Brand blue, never teal.
  const tableLabel =
    (table as { label_override?: string }).label_override?.trim() || table.name
  const hasQrAlert = useQrGuestAlertsStore(
    s =>
      isTableType &&
      !!tableLabel &&
      s.alerts.some(a => a.tableLabel === tableLabel)
  )

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
          // Pulse while the guest's call-server alert is open too — visual
          // chrome only; we never write session.needs_attention for QR
          // (QR must not touch dining state). Clears when resolved.
          active={newAttention || hasQrAlert}
          width={effectiveWidth}
          height={effectiveHeight}
        />
        {hasQrAlert ? (
          <View
            pointerEvents='none'
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: '#0C4FD1',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: '#fff'
            }}
          >
            <Bell size={12} color='#fff' />
          </View>
        ) : null}
      </View>
    </GestureDetector>
  )
}

export default ReadonlyTable
