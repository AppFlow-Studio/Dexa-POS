import { OpenShiftChip } from "@/components/scheduling/OpenShiftChip";
import { ShiftChip } from "@/components/scheduling/ShiftChip";
import { TemplateShiftChip } from "@/components/scheduling/TemplateShiftChip"; // Import this
import { useDropZoneContext } from "@/contexts/DropZoneContext";
import { Shift, TemplateShift } from "@/lib/types";
import React from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

export const DragOverlayTemplate = () => {
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
      {activeDragItem.type === "shift" ? (
        // --- Regular Shift Logic ---
        (activeDragItem.shift as Shift).status === "open" ? (
          <OpenShiftChip
            shift={activeDragItem.shift as Shift}
            onClick={() => {}}
          />
        ) : (
          <ShiftChip
            role={(activeDragItem.shift as Shift).role}
            start={(activeDragItem.shift as Shift).startTime}
            end={(activeDragItem.shift as Shift).endTime}
            requiredCount={(activeDragItem.shift as Shift).requiredCount}
            wage={activeDragItem.wage}
            onClick={() => {}}
          />
        )
      ) : (
        // --- Template Shift Logic ---
        <TemplateShiftChip
          shift={activeDragItem.shift as TemplateShift}
          wage={activeDragItem.wage}
          onClick={() => {}}
        />
      )}
    </Animated.View>
  );
};
