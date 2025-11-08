import { useDropZoneContext } from "@/contexts/DropZoneContext";
import { Shift } from "@/lib/types";
import React from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { OpenShiftChip } from "./OpenShiftChip";
import { ShiftChip } from "./ShiftChip";

interface DraggableShiftProps {
  shift: Shift;
  onShiftClick: (shift: Shift) => void;
  wage: number;
  onShiftDrop: (shift: Shift, newEmployeeId: string, newDate: string) => void;
}

export const DraggableShift: React.FC<DraggableShiftProps> = ({
  shift,
  onShiftClick,
  wage,
  onShiftDrop,
}) => {
  const { dropZoneLayouts, hoveredDropZoneKey, draggingCellKey } =
    useDropZoneContext();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      isDragging.value = true;
      draggingCellKey.value = `${shift.employeeId}-${shift.date}`;
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd(() => {
      let droppedSuccessfully = false;
      if (hoveredDropZoneKey.value) {
        const parts = hoveredDropZoneKey.value.split("-");
        const newEmployeeId = parts[0];
        const newDate = parts.slice(1).join("-"); // Re-join date parts like "2025-11-10"

        runOnJS(onShiftDrop)(shift, newEmployeeId, newDate);
        droppedSuccessfully = true;
      }

      // Only animate back if the drop was NOT successful
      if (!droppedSuccessfully) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      }
    })
    .onFinalize(() => {
      isDragging.value = false;
      draggingCellKey.value = null;
      hoveredDropZoneKey.value = null;
    });

  useAnimatedReaction(
    () => ({
      isDragging: isDragging.value,
      tx: translateX.value,
      ty: translateY.value,
    }),
    (current) => {
      if (current.isDragging) {
        const layouts = dropZoneLayouts.value;
        const ownLayout = layouts[`${shift.employeeId}-${shift.date}`];
        if (!ownLayout) return;

        // Calculate the current position relative to the ScrollView
        const relativeX = ownLayout.x + current.tx;
        const relativeY = ownLayout.y + current.ty;

        let foundZone = false;
        for (const key in layouts) {
          const layout = layouts[key];
          if (
            relativeX > layout.x &&
            relativeX < layout.x + layout.width &&
            relativeY > layout.y &&
            relativeY < layout.y + layout.height
          ) {
            hoveredDropZoneKey.value = key;
            foundZone = true;
            break;
          }
        }
        if (!foundZone) {
          hoveredDropZoneKey.value = null;
        }
      }
    },
    [dropZoneLayouts]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    zIndex: isDragging.value ? 100 : 1, // Bring to front when dragging
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        {shift.status === "open" ? (
          <OpenShiftChip shift={shift} onClick={() => onShiftClick(shift)} />
        ) : (
          <ShiftChip
            role={shift.role}
            start={shift.startTime}
            end={shift.endTime}
            requiredCount={shift.requiredCount}
            wage={wage}
            onClick={() => onShiftClick(shift)}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
};
