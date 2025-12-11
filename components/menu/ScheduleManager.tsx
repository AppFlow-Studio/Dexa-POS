import { Schedule } from "@/lib/types";
import { Clock, Plus, Trash2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export interface ScheduleManagerProps {
  value: Schedule[];
  onChange: (next: Schedule[]) => void;
  onAdd: () => void;
  onEdit: (rule: Schedule, index: number) => void;
}

const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  value,
  onChange,
  onAdd,
  onEdit,
}) => {
  const schedules = value ?? [];

  const removeRule = (idx: number) => {
    onChange(schedules.filter((_, i) => i !== idx));
  };

  return (
    <View className="gap-2">
      {schedules.length === 0 && (
        <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
          <Text className="text-gray-300 text-lg">
            No schedule rules defined.
          </Text>
        </View>
      )}

      {schedules.map((rule, idx) => (
        <TouchableOpacity
          key={rule.id}
          onPress={() => onEdit(rule, idx)}
          className="bg-[#303030] border rounded-lg p-3 border-gray-600"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Clock size={16} color="#9CA3AF" />
              <Text className="text-white font-semibold text-xl">
                {rule.name || `Rule ${idx + 1}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                removeRule(idx);
              }}
              className="p-1.5 bg-red-900/30 border border-red-500 rounded-lg"
            >
              <Trash2 size={18} color="#F87171" />
            </TouchableOpacity>
          </View>
          <Text className="text-base text-gray-400 mt-1.5">
            {rule.days.join(", ")} from {formatTime(rule.startTime)} to{" "}
            {formatTime(rule.endTime)}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={onAdd}
        className="flex-row items-center gap-2 px-4 py-3 rounded-lg bg-blue-600 self-start"
      >
        <Plus size={18} color="#FFFFFF" />
        <Text className="text-white font-bold text-lg">Add Schedule Rule</Text>
      </TouchableOpacity>
    </View>
  );
};

const formatTime = (time: string): string => {
  if (!time) return "";

  // Handle ISO string (e.g., "2023-01-01T13:00:00.000Z")
  if (time.includes("T")) {
    const date = new Date(time);
    if (!isNaN(date.getTime())) {
      let hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      const strMinutes = minutes < 10 ? "0" + minutes : minutes;
      return `${hours}:${strMinutes} ${ampm}`;
    }
  }

  // Handle "HH:mm" format
  const parts = time.split(":");
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      const strMinutes = minutes < 10 ? "0" + minutes : minutes;
      return `${hours}:${strMinutes} ${ampm}`;
    }
  }

  return time;
};

export default ScheduleManager;
