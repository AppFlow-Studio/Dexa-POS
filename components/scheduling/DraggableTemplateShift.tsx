import { useDropZoneContext } from "@/contexts/DropZoneContext";
import { TemplateShift } from "@/lib/types";
import React from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { TemplateShiftChip } from "./TemplateShiftChip"; // Assuming TemplateShiftChip is the correct component for display

interface DraggableTemplateShiftProps {
  shift: TemplateShift;
  onShiftClick: (shift: TemplateShift) => void;
  wage: number; // Assuming template shifts can also have a wage for display
  onShiftDrop: (
    shift: TemplateShift,
    newEmployeeId: string,
    newDayOfWeek: number
  ) => void;
}

export const DraggableTemplateShift: React.FC<DraggableTemplateShiftProps> = ({
  shift,
  onShiftClick,
  wage,
  onShiftDrop,
}) => {
  const { dropZoneLayouts, hoveredDropZoneKey, draggingCellKey, dropResult } =
    useDropZoneContext();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Derive initial cell key from the shift's employeeId and dayOfWeek
  const initialCellKey = `${shift.employeeId}-${shift.dayOfWeek}`;

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      isDragging.value = true;
      // Use tempId for template shifts to identify the dragging item uniquely
      draggingCellKey.value = initialCellKey;
      dropResult.value = "idle"; // Reset on new drag
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd(() => {
      if (hoveredDropZoneKey.value) {
        const parts = hoveredDropZoneKey.value.split("-");
        const newEmployeeId = parts[0];
        const newDayOfWeek = parseInt(parts[1], 10);

        // Call the onShiftDrop function provided by the parent (TemplateGrid)
        runOnJS(onShiftDrop)(shift, newEmployeeId, newDayOfWeek);
      } else {
        // Dropped outside a valid zone, so animate back
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      }
    })
    .onFinalize(() => {
      isDragging.value = false;
      draggingCellKey.value = null;
      hoveredDropZoneKey.value = null;
    });

  // This reaction handles the result of the drop from the JS thread (e.g., if validation fails)
  useAnimatedReaction(
    () => dropResult.value,
    (result) => {
      if (result === "failure") {
        // Animate back to original position
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      }
    },
    [dropResult]
  );

  // This reaction continuously checks for hovered drop zones while dragging
  useAnimatedReaction(
    () => ({
      isDragging: isDragging.value,
      tx: translateX.value,
      ty: translateY.value,
    }),
    (current) => {
      if (current.isDragging) {
        const layouts = dropZoneLayouts.value;
        const ownLayout = layouts[initialCellKey]; // Use initialCellKey for own layout
        if (!ownLayout) return;

        // Calculate the current position relative to the ScrollView (assuming top-left of the draggable)
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
            // Only consider it a valid hover if it's a different cell OR the same cell but moved internally
            // For template shifts, we mostly care about moving to a *different* cell or employee/day
            // We can refine this logic if needed to prevent self-dropping without change
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
    [dropZoneLayouts, initialCellKey]
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
        <TemplateShiftChip
          shift={shift}
          wage={wage}
          onClick={() => onShiftClick(shift)}
          // Template shifts don't usually have requiredCount, isOpen, hasConflict etc.
          // Adjust props for TemplateShiftChip as necessary
        />
      </Animated.View>
    </GestureDetector>
  );
};
