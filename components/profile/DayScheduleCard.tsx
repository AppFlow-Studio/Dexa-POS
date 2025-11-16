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
  onCancelSwapRequest: (shift: Shift) => void; // New prop
}

const DayScheduleCard: React.FC<DayScheduleCardProps> = ({
  date,
  shifts,
  onShiftPress,
  onRequestDrop,
  onRequestSwap,
  onCancelDropRequest,
  onCancelSwapRequest, // Destructure new prop
}) => {
  return (
    <View className="mb-4">
      <Text className="text-lg font-bold text-white mb-2">
        {format(date, "EEE, MMM d")}
      </Text>
      <View className="gap-y-3">
        {shifts.length > 0 ? (
          shifts.map((shift) => (
            <ShiftDetailRow
              key={shift.id}
              shift={shift}
              onPress={() => onShiftPress(shift)}
              onRequestDrop={onRequestDrop}
              onRequestSwap={onRequestSwap}
              onCancelDropRequest={onCancelDropRequest}
              onCancelSwapRequest={onCancelSwapRequest} // Pass new prop
            />
          ))
        ) : (
          <View className="p-4 bg-[#303030] rounded-xl border border-gray-700 items-center justify-center min-h-[60px]">
            <Text className="text-gray-500">No shifts scheduled</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default DayScheduleCard;
