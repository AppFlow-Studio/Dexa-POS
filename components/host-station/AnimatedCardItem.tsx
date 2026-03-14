import { DragCardState } from '@/hooks/useWaitlistDragState'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import React, { useCallback, useMemo } from 'react'
import { Gesture } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  withSpring
} from 'react-native-reanimated'
import WaitlistQueueCard from './WaitlistQueueCard'

interface AnimatedCardItemProps {
  item: WaitlistEntry
  index: number
  activeWaitlistLength: number
  cardDragStates: DragCardState[]
  dragIndex: SharedValue<number>
  dragStartY: SharedValue<number>
  cardHeight: SharedValue<number>
  setScrollEnabled: (enabled: boolean) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onNotify: (item: WaitlistEntry) => void
  onSeat: (item: WaitlistEntry) => void
  onCancel: (item: WaitlistEntry) => void
  onMarkNoShow: (item: WaitlistEntry) => void
  onOfferComp?: (item: WaitlistEntry) => void
}

export const AnimatedCardItem: React.FC<AnimatedCardItemProps> = ({
  item,
  index,
  activeWaitlistLength,
  cardDragStates,
  dragIndex,
  dragStartY,
  cardHeight,
  setScrollEnabled,
  onReorder,
  onNotify,
  onSeat,
  onCancel,
  onMarkNoShow,
  onOfferComp
}) => {
  const dragGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.LongPress()
          .minDuration(300)
          .onStart(() => {
            runOnJS(setScrollEnabled)(false)
          }),
        Gesture.Pan()
          .onStart(() => {
            if (
              index >= 0 &&
              index < cardDragStates.length &&
              cardDragStates[index]
            ) {
              dragIndex.value = index
              dragStartY.value = 0
              cardDragStates[index].isDragging.value = true
            }
          })
          .onUpdate(e => {
            if (index < 0 || index >= cardDragStates.length) return

            const delta = e.absoluteY - dragStartY.value || e.translationY
            if (dragStartY.value === 0) {
              dragStartY.value =
                e.absoluteY - (cardDragStates[index]?.translateY.value || 0)
            }

            if (cardDragStates[index]) {
              cardDragStates[index].translateY.value = delta
            }

            // Calculate target index based on drag position
            const fromIndex = index
            const toIndex = Math.round(
              Math.max(
                0,
                Math.min(
                  activeWaitlistLength - 1,
                  fromIndex + delta / (cardHeight.value || 120)
                )
              )
            )

            // Shift other cards
            for (let j = 0; j < activeWaitlistLength; j++) {
              if (j === fromIndex || !cardDragStates[j]) continue
              const shouldShift =
                j >= Math.min(fromIndex, toIndex) &&
                j <= Math.max(fromIndex, toIndex)
              const shift = shouldShift
                ? toIndex > fromIndex
                  ? -(cardHeight.value || 120)
                  : cardHeight.value || 120
                : 0
              cardDragStates[j].translateY.value = withSpring(shift)
            }
          })
          .onEnd(() => {
            const fromIndex = dragIndex.value
            if (fromIndex < 0 || fromIndex >= activeWaitlistLength) {
              dragIndex.value = -1
              return
            }

            const delta = cardDragStates[fromIndex]?.translateY.value || 0
            const toIndex = Math.round(
              Math.max(
                0,
                Math.min(
                  activeWaitlistLength - 1,
                  fromIndex + delta / (cardHeight.value || 120)
                )
              )
            )

            // Reset all translations
            for (let j = 0; j < activeWaitlistLength; j++) {
              if (cardDragStates[j]) {
                cardDragStates[j].translateY.value = withSpring(0)
                cardDragStates[j].isDragging.value = false
              }
            }

            dragIndex.value = -1
            runOnJS(setScrollEnabled)(true)
            runOnJS(onReorder)(fromIndex, toIndex)
          })
      ),
    [
      index,
      activeWaitlistLength,
      cardDragStates,
      dragIndex,
      dragStartY,
      cardHeight,
      setScrollEnabled,
      onReorder
    ]
  )

  const animatedStyle = useAnimatedStyle(() => {
    if (index < 0 || index >= cardDragStates.length || !cardDragStates[index]) {
      return {}
    }
    return {
      transform: [{ translateY: cardDragStates[index].translateY.value }],
      zIndex: cardDragStates[index].isDragging.value ? 100 : 1
    }
  })

  const handleLayout = useCallback((e: any) => {
    if (cardHeight.value === 0) {
      cardHeight.value = e.nativeEvent.layout.height + 12
    }
  }, [cardHeight])

  const handleNotify = useCallback(() => onNotify(item), [onNotify, item])
  const handleSeat = useCallback(() => onSeat(item), [onSeat, item])
  const handleCancel = useCallback(() => onCancel(item), [onCancel, item])
  const handleMarkNoShow = useCallback(() => onMarkNoShow(item), [onMarkNoShow, item])
  const handleOfferComp = useCallback(() => onOfferComp?.(item), [onOfferComp, item])

  return (
    <Animated.View style={animatedStyle} onLayout={handleLayout}>
      <WaitlistQueueCard
        entry={item}
        position={index + 1}
        dragGesture={dragGesture}
        isDragging={cardDragStates[index].isDragging}
        onNotify={handleNotify}
        onSeat={handleSeat}
        onCancel={handleCancel}
        onMarkNoShow={handleMarkNoShow}
        onOfferComp={handleOfferComp}
      />
    </Animated.View>
  )
}

export default React.memo(AnimatedCardItem)
