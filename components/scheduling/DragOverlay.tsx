import { useDropZoneContext } from "@/contexts/DropZoneContext";
import { Shift, TemplateShift } from "@/lib/types";
import React from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { OpenShiftChip } from "./OpenShiftChip";
import { ShiftChip } from "./ShiftChip";

// Type guard to check if the item being dragged is a full Shift object
const isShift = (item: Shift | TemplateShift): item is Shift => {
  return "status" in item;
};

const DragOverlay = () => {
  const { activeDragItem, dragTranslation } = useDropZoneContext();

  const style = useAnimatedStyle(() => {
    if (!activeDragItem) {
      return { opacity: 0 };
    }

    return {
      width: activeDragItem.width,
      height: activeDragItem.height,
      opacity: 1,
      transform: [
        { translateX: activeDragItem.startX + dragTranslation.value.x },
        { translateY: activeDragItem.startY + dragTranslation.value.y },
      ],
    };
  });

  if (!activeDragItem) return null;

  return (
    <Animated.View
      style={style}
      pointerEvents="none"
      className="absolute top-0 left-0 z-50"
    >
      {isShift(activeDragItem.shift) && activeDragItem.shift.status === "open" ? (
        <OpenShiftChip shift={activeDragItem.shift} onClick={() => {}} />
      ) : (
        <ShiftChip
          role={activeDragItem.shift.role}
          start={activeDragItem.shift.startTime}
          end={activeDragItem.shift.endTime}
          requiredCount={
            isShift(activeDragItem.shift)
              ? activeDragItem.shift.requiredCount
              : undefined
          }
          wage={isShift(activeDragItem.shift) ? activeDragItem.wage : undefined}
          onClick={() => {}}
        />
      )}
    </Animated.View>
  );
};

export default DragOverlay;
