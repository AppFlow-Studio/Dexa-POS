import { TemplateShiftChip } from "@/components/scheduling/TemplateShiftChip";
import { useDropZoneContext } from "@/contexts/DropZoneContext";
import { TemplateShift } from "@/lib/types";
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

interface DraggableTemplateShiftProps {
  shift: TemplateShift;
  wage?: number;
  onShiftClick: (shift: TemplateShift) => void;
  onShiftDrop: (
    shift: TemplateShift,
    newEmployeeId: string,
    newDayOfWeek: number
  ) => void;
}

export const DraggableTemplateShift: React.FC<DraggableTemplateShiftProps> = ({
  shift,
  wage,
  onShiftClick,
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

  // Controls opacity of the original item (0 when dragging, 1 otherwise)
  const isDraggingLocal = useSharedValue(false);
  const isDropCommitted = useSharedValue(false);

  const itemWidth = useSharedValue(0);
  const itemHeight = useSharedValue(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setActiveDragItem(null);
    };
  }, []);

  // Watch for failure to reset
  useAnimatedReaction(
    () => dropResult.value,
    (result) => {
      if (result === "failure") {
        isDropCommitted.value = false;
        isDraggingLocal.value = false;
        runOnJS(setActiveDragItem)(null);
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
        isDropCommitted.value = false;
        itemWidth.value = measurement.width;
        itemHeight.value = measurement.height;

        // 1. Show Overlay
        runOnJS(setActiveDragItem)({
          type: "template", // Specify type
          shift: shift, // Pass the TemplateShift object
          wage: wage || 0,
          startX: measurement.pageX,
          startY: measurement.pageY,
          width: measurement.width,
          height: measurement.height,
        });

        // 2. Hide Local
        isDraggingLocal.value = true;
        // Key format: "employeeId-dayOfWeek"
        draggingCellKey.value = `${shift.employeeId}-${shift.dayOfWeek}`;
        dropResult.value = "idle";
        dragTranslation.value = { x: 0, y: 0 };
      }
    })
    .onUpdate((e) => {
      dragTranslation.value = { x: e.translationX, y: e.translationY };

      const layouts = dropZoneLayouts.value;
      const ownKey = `${shift.employeeId}-${shift.dayOfWeek}`;
      const ownLayout = layouts[ownKey];
      if (!ownLayout) return;

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
      const originalKey = `${shift.employeeId}-${shift.dayOfWeek}`;
      if (
        hoveredDropZoneKey.value &&
        hoveredDropZoneKey.value !== originalKey
      ) {
        isDropCommitted.value = true;

        // Key format: "employeeId-dayOfWeek"
        const parts = hoveredDropZoneKey.value.split("-");
        const newEmployeeId = parts[0];
        const newDayOfWeek = parseInt(parts[1], 10);

        runOnJS(onShiftDrop)(shift, newEmployeeId, newDayOfWeek);
      }
    })
    .onFinalize(() => {
      if (!isDropCommitted.value) {
        isDraggingLocal.value = false;
        runOnJS(setActiveDragItem)(null);
        draggingCellKey.value = null;
        hoveredDropZoneKey.value = null;
        dragTranslation.value = { x: 0, y: 0 };
      } else {
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
        <TemplateShiftChip
          shift={shift}
          wage={wage}
          onClick={() => onShiftClick(shift)}
        />
      </Animated.View>
    </GestureDetector>
  );
};
