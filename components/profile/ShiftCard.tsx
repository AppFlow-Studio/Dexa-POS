import { Shift } from "@/lib/types";
import React from "react";
import { Text, TouchableOpacity } from "react-native";

interface ShiftCardProps {
  shift: Shift;
  onPress: () => void;
}

const getStatusStyles = (status: Shift["status"]) => {
  switch (status) {
    case "confirmed":
      return {
        bg: "bg-green-500/10",
        text: "text-green-400",
        border: "border-green-500/20",
      };
    case "pending-drop":
    case "pending-swap":
      return {
        bg: "bg-yellow-500/10",
        text: "text-yellow-400",
        border: "border-yellow-500/20",
      };
    case "dropped":
      return {
        bg: "bg-gray-500/10",
        text: "text-gray-400",
        border: "border-gray-500/20",
      };
    default:
      return {
        bg: "bg-gray-700",
        text: "text-gray-300",
        border: "border-gray-600",
      };
  }
};

const getStatusLabel = (status: Shift["status"]) => {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "pending-drop":
      return "Drop Pending";
    case "pending-swap":
      return "Swap Pending";
    case "dropped":
      return "Dropped";
    default:
      return status;
  }
};

const ShiftCard: React.FC<ShiftCardProps> = ({ shift, onPress }) => {
  const statusStyles = getStatusStyles(shift.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      className={`p-3 rounded-xl border ${statusStyles.border} ${statusStyles.bg} hover:opacity-80 transition-opacity`}
    >
      <Text className="text-sm font-semibold text-white mb-1">
        {shift.role}
      </Text>
      <Text className="text-xs text-gray-300 mb-1">
        {shift.startTime} - {shift.endTime}
      </Text>
      <Text className="text-xs text-gray-400 mb-2">{shift.location}</Text>
      <Text className={`text-xs font-medium ${statusStyles.text}`}>
        {getStatusLabel(shift.status)}
      </Text>
    </TouchableOpacity>
  );
};

export default ShiftCard;
