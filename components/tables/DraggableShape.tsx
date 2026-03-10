import { useDragToAddContext } from "@/contexts/DragToAddContext";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import React from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

interface DraggableShapeProps {
  shapeId: keyof typeof TABLE_SHAPES;
  children: React.ReactNode;
}

export const DraggableShape: React.FC<DraggableShapeProps> = ({
  shapeId,
  children,
}) => {
  const { draggedShapeId, isDraggingNewObject, dragPosition, dropPending } =
    useDragToAddContext();

  const panGesture = Gesture.Pan()
    .minDistance(15) // Require 15px movement to start dragging (prevents accidental activation on scroll)
    .activeOffsetX([-15, 15])
    .activeOffsetY([-15, 15])
    .failOffsetX([-5, 5]) // Scrolling within ±5px X cancels drag
    .shouldCancelWhenOutside(false) // Allow dragging outside the shape
    .onStart((e) => {
      // Set values on the UI thread directly
      draggedShapeId.value = shapeId;
      isDraggingNewObject.value = true;
      dragPosition.value = { x: e.absoluteX, y: e.absoluteY };
    })
    .onUpdate((e) => {
      // Update position on UI thread (smoother)
      dragPosition.value = { x: e.absoluteX, y: e.absoluteY };
    })
    .onEnd(() => {
      // Signal to the LayoutScreen that a drop has occurred
      dropPending.value = true;
    })
    .onFinalize(() => {
      // We don't reset here immediately; let the LayoutScreen handle the reset
      // after it processes the drop.
    });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View>{children}</Animated.View>
    </GestureDetector>
  );
};
