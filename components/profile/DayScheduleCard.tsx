import { Shift } from "@/lib/types";
import { format } from "date-fns";
import React from "react";
import { Text, View } from "react-native";
import ShiftDetailRow from "./ShiftDetailRow";

interface DayScheduleCardProps {
  date: Date;
  shifts: Shift[];
  onShiftPress: (shift: Shift) => void;
  onRequestDrop: (shift: Shift) => void;
  onRequestSwap: (shift: Shift) => void;
  onCancelDropRequest: (shift: Shift) => void;
  onCancelSwapRequest: (shift: Shift) => void;
  onPickUpShift?: (shift: Shift) => void; // New prop for open shifts
}

const DayScheduleCard: React.FC<DayScheduleCardProps> = ({
  date,
  shifts,
  onShiftPress,
  onRequestDrop,
  onRequestSwap,
  onCancelDropRequest,
  onCancelSwapRequest,
  onPickUpShift, // Destructure new prop
}) => {
  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold text-label uppercase tracking-wider mb-2">
        {format(date, "EEE, MMM d")}
      </Text>
      <View className="gap-y-2">
        {shifts.length > 0 ? (
          shifts.map((shift) => (
            <ShiftDetailRow
              key={shift.id}
              shift={shift}
              onPress={() => onShiftPress(shift)}
              onRequestDrop={onRequestDrop}
              onRequestSwap={onRequestSwap}
              onCancelDropRequest={onCancelDropRequest}
              onCancelSwapRequest={onCancelSwapRequest}
              onPickUpShift={onPickUpShift}
            />
          ))
        ) : (
          <View className="px-4 py-3 bg-panel rounded-xl border border-border items-center">
            <Text className="text-muted text-xs">No shifts scheduled</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default DayScheduleCard;
