import { Badge } from "@/components/ui/badge";
import { Role } from "@/lib/types"; // Assuming types will be in lib/types
import { AlertCircle, Clock, Users } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ShiftChipProps {
  role: Role;
  start: string;
  end: string;
  requiredCount?: number;
  wage?: number;
  isOpen?: boolean;
  hasConflict?: boolean;
  conflictType?: "ot" | "pto" | "gap" | "swap";
  onClick?: () => void;
}

const roleColors: Record<Role, string> = {
  Cashier: "bg-blue-500/20 border-blue-500/30",
  Barista: "bg-purple-500/20 border-purple-500/30",
  "Line Cook": "bg-yellow-500/20 border-yellow-500/30",
  Prep: "bg-green-500/20 border-green-500/30",
  Supervisor: "bg-pink-500/20 border-pink-500/30",
};

const conflictColors = {
  ot: "border-l-red-500",
  pto: "border-l-purple-500",
  gap: "border-l-red-500",
  swap: "border-l-blue-500",
};

const formatTime = (time: string): string => {
  const [hours, minutes] = time.split(":");
  const h = Number.parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

export const ShiftChip: React.FC<ShiftChipProps> = ({
  role,
  start,
  end,
  requiredCount = 1,
  wage,
  isOpen,
  hasConflict,
  conflictType,
  onClick,
}) => {
  const roleColorStyle =
    roleColors[role] || "bg-gray-500/20 border-gray-500/30";
  const conflictStyle =
    hasConflict && conflictType ? conflictColors[conflictType] : "";

  return (
    <TouchableOpacity
      onPress={onClick}
      className={`relative px-3 py-2 rounded-lg border cursor-pointer transition-all active:scale-95 ${isOpen ? "border-dashed border-gray-500 bg-[#212121]" : roleColorStyle} ${conflictStyle}`}
    >
      <View className="flex-row items-center justify-between gap-2 mb-1">
        <Badge
          variant="outline"
          className={`text-xs px-1.5 border-current ${isOpen ? "text-gray-400 border-gray-400" : "text-white border-white"}`}
        >
          <Text
            className={`text-xs ${isOpen ? "text-gray-400" : "text-white"}`}
          >
            {role}
          </Text>
        </Badge>
        {requiredCount > 1 && (
          <View className="flex-row items-center gap-1 text-xs text-gray-400">
            <Users size={12} color={"#9ca3af"} />
            <Text className="text-xs text-gray-400">{requiredCount}</Text>
          </View>
        )}
      </View>

      <View className="flex-row items-center gap-1.5">
        <Clock
          size={12}
          color={isOpen ? "#9ca3af" : "white"}
          className={isOpen ? "text-gray-400" : "text-white"}
        />
        <Text
          className={`font-medium text-xs ${isOpen ? "text-gray-400" : "text-white"}`}
        >
          {formatTime(start)} - {formatTime(end)}
        </Text>
      </View>

      {wage && (
        <Text className="text-xs text-gray-500 mt-1">
          ${wage.toFixed(2)}/hr
        </Text>
      )}

      {isOpen && (
        <View className="absolute top-1 right-1">
          <AlertCircle size={12} className="text-red-500" />
        </View>
      )}
    </TouchableOpacity>
  );
};
