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
import { TemplateShiftChip } from "./TemplateShiftChip";

interface DraggableTemplateShiftProps {
  shift: TemplateShift;
  onShiftClick: (shift: TemplateShift) => void;
  onShiftDrop: (draggedShift: TemplateShift, newDayOfWeek: number) => void;
}

export const DraggableTemplateShift: React.FC<DraggableTemplateShiftProps> = ({
  shift,
  onShiftClick,
  onShiftDrop,
}) => {
  const { dropZoneLayouts, hoveredDropZoneKey, draggingCellKey, dropResult } =
    useDropZoneContext();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      isDragging.value = true;
      draggingCellKey.value = shift.dayOfWeek.toString(); // Key by dayOfWeek
      dropResult.value = "idle"; // Reset on new drag
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd(() => {
      if (hoveredDropZoneKey.value !== null) {
        const newDayOfWeek = parseInt(hoveredDropZoneKey.value as string, 10);
        runOnJS(onShiftDrop)(shift, newDayOfWeek);
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

  // This reaction handles the result of the drop from the JS thread
  useAnimatedReaction(
    () => dropResult.value,
    (result) => {
      if (result === "failure") {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      }
    },
    [dropResult]
  );

  useAnimatedReaction(
    () => ({
      isDragging: isDragging.value,
      tx: translateX.value,
      ty: translateY.value,
    }),
    (current) => {
      if (current.isDragging) {
        const layouts = dropZoneLayouts.value;
        const ownLayout = layouts[shift.dayOfWeek.toString()]; // Key by dayOfWeek
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
        <TemplateShiftChip shift={shift} onClick={() => onShiftClick(shift)} />
      </Animated.View>
    </GestureDetector>
  );
};
