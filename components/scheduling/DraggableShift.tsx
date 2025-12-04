import { useDropZoneContext } from "@/contexts/DropZoneContext";
import { Shift } from "@/lib/types";
import React, { useEffect } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  measure,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
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
  const {
    dropZoneLayouts,
    hoveredDropZoneKey,
    draggingCellKey,
    dropResult,
    setActiveDragItem,
    dragTranslation,
  } = useDropZoneContext();

  const animatedRef = useAnimatedRef<Animated.View>();

  // Controls opacity of the original item
  const isDraggingLocal = useSharedValue(false);

  // Tracks if we have signaled a drop and are waiting for the update
  const isDropCommitted = useSharedValue(false);

  const itemWidth = useSharedValue(0);
  const itemHeight = useSharedValue(0);

  // Cleanup on Unmount: This ensures the overlay disappears ONLY when
  // the new schedule data arrives and this component is removed.
  useEffect(() => {
    return () => {
      // Safe to call even if not dragging
      setActiveDragItem(null);
    };
  }, []);

  // Watch for explicit failure signal to reset state
  useAnimatedReaction(
    () => dropResult.value,
    (result) => {
      if (result === "failure") {
        // If drop failed, reset everything immediately
        isDropCommitted.value = false;
        isDraggingLocal.value = false; // Show original
        runOnJS(setActiveDragItem)(null); // Hide overlay
        dragTranslation.value = { x: 0, y: 0 };
        draggingCellKey.value = null;
        hoveredDropZoneKey.value = null;
      }
    },
    [dropResult]
  );

  const panGesture = Gesture.Pan()
    .onStart(() => {
      const measurement = measure(animatedRef);

      if (measurement) {
        // Reset states
        isDropCommitted.value = false;
        itemWidth.value = measurement.width;
        itemHeight.value = measurement.height;

        // 1. Show Overlay
        runOnJS(setActiveDragItem)({
          shift: shift,
          wage: wage,
          startX: measurement.pageX,
          startY: measurement.pageY,
          width: measurement.width,
          height: measurement.height,
        });

        // 2. Hide Local
        isDraggingLocal.value = true;
        draggingCellKey.value = `${shift.employeeId}-${shift.date}`;
        dropResult.value = "idle";
        dragTranslation.value = { x: 0, y: 0 };
      }
    })
    .onUpdate((e) => {
      dragTranslation.value = { x: e.translationX, y: e.translationY };

      const layouts = dropZoneLayouts.value;
      const ownLayout = layouts[`${shift.employeeId}-${shift.date}`];
      if (!ownLayout) return;

      // Collision Logic (Center Point)
      const CELL_PADDING = 8;
      const centerX =
        ownLayout.x + CELL_PADDING + itemWidth.value / 2 + e.translationX;
      const centerY =
        ownLayout.y + CELL_PADDING + itemHeight.value / 2 + e.translationY;

      let foundZone = false;
      for (const key in layouts) {
        const layout = layouts[key];
        if (
          centerX > layout.x &&
          centerX < layout.x + layout.width &&
          centerY > layout.y &&
          centerY < layout.y + layout.height
        ) {
          hoveredDropZoneKey.value = key;
          foundZone = true;
          break;
        }
      }
      if (!foundZone) {
        hoveredDropZoneKey.value = null;
      }
    })
    .onEnd(() => {
      const originalCellKey = `${shift.employeeId}-${shift.date}`;
      if (
        hoveredDropZoneKey.value &&
        hoveredDropZoneKey.value !== originalCellKey
      ) {
        // 3. Commit Drop
        isDropCommitted.value = true;

        const parts = hoveredDropZoneKey.value.split("-");
        const newEmployeeId = parts[0];
        const newDate = parts.slice(1).join("-");

        runOnJS(onShiftDrop)(shift, newEmployeeId, newDate);
      }
    })
    .onFinalize(() => {
      // 4. Conditional Cleanup
      // If we committed a drop, we DO NOT reset isDraggingLocal.
      // We leave the original hidden (opacity 0) and the Overlay visible.
      // They will both be cleaned up when the component unmounts (via useEffect).
      if (!isDropCommitted.value) {
        isDraggingLocal.value = false;
        runOnJS(setActiveDragItem)(null);
        draggingCellKey.value = null;
        hoveredDropZoneKey.value = null;
        dragTranslation.value = { x: 0, y: 0 };
      } else {
        // If committed, just clear the highlights, but keep the item hidden
        draggingCellKey.value = null;
        hoveredDropZoneKey.value = null;
      }
    });

  const containerStyle = useAnimatedStyle(() => ({
    opacity: isDraggingLocal.value ? 0 : 1,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View ref={animatedRef} style={containerStyle}>
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
