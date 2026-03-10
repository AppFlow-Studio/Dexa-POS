import { useDragToAddContext } from '@/contexts/DragToAddContext'
import { TABLE_SHAPES } from '@/lib/table-shapes'
import React from 'react'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue } from 'react-native-reanimated'

interface DraggableShapeProps {
  shapeId: keyof typeof TABLE_SHAPES
  children: React.ReactNode
}

export const DraggableShape: React.FC<DraggableShapeProps> = ({
  shapeId,
  children
}) => {
  const DRAG_HOLD_MS = 180
  const { draggedShapeId, isDraggingNewObject, dragPosition, dropPending } =
    useDragToAddContext()
  const didActivateDrag = useSharedValue(false)

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(DRAG_HOLD_MS)
    .minDistance(8)
    .activeOffsetX([-8, 8])
    .activeOffsetY([-8, 8])
    .shouldCancelWhenOutside(false) // Allow dragging outside the shape
    .onBegin(() => {
      didActivateDrag.value = false
    })
    .onUpdate(e => {
      if (!didActivateDrag.value) {
        didActivateDrag.value = true
        draggedShapeId.value = shapeId
        isDraggingNewObject.value = true
      }
      // Update position on UI thread (smoother)
      dragPosition.value = { x: e.absoluteX, y: e.absoluteY }
    })
    .onEnd(() => {
      if (didActivateDrag.value) {
        dropPending.value = true
      }
    })
    .onFinalize(() => {
      // Bottom sheet close can cancel the gesture before onEnd.
      if (didActivateDrag.value) {
        dropPending.value = true
      }
    })

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View>{children}</Animated.View>
    </GestureDetector>
  )
}
