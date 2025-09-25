import { Schedule } from "@/lib/types";
import { Clock, Plus, Trash2 } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
const DAY_ORDER: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const TimeField: React.FC<{
  value: string;
  onChange: (next: string) => void;
}> = ({ value, onChange }) => {
  const [hours, minutes] = useMemo(() => {
    const [h = "0", m = "0"] = value?.split(":") ?? [];
    return [parseInt(h, 10) || 0, parseInt(m, 10) || 0];
  }, [value]);

  const set = (h: number, m: number) =>
    onChange(
      `${String((h + 24) % 24).padStart(2, "0")}:${String((m + 60) % 60).padStart(2, "0")}`
    );

  const toAmPm = (h: number, m: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const minutesStr = String(m).padStart(2, "0");
    return `${hour12}:${minutesStr} ${period}`;
  };

  return (
    <View className="flex-row items-center gap-2 p-2 bg-[#212121] border border-gray-600 rounded-lg">
      <View className="flex-1 flex-row items-center justify-around">
        <TouchableOpacity
          onPress={() => set(hours === 0 ? 23 : hours - 1, minutes)}
          className="p-2"
        >
          <Text className="text-white text-2xl font-bold">-</Text>
        </TouchableOpacity>
        <Text className="text-white text-2xl font-bold">
          {String(hours).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => set(hours === 23 ? 0 : hours + 1, minutes)}
          className="p-2"
        >
          <Text className="text-white text-2xl font-bold">+</Text>
        </TouchableOpacity>
      </View>
      <Text className="text-white text-2xl font-bold">:</Text>
      <View className="flex-1 flex-row items-center justify-around">
        <TouchableOpacity
          onPress={() => set(hours, (minutes + 45) % 60)}
          className="p-2"
        >
          <Text className="text-white text-2xl font-bold">-</Text>
        </TouchableOpacity>
        <Text className="text-white text-2xl font-bold">
          {String(minutes).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => set(hours, (minutes + 15) % 60)}
          className="p-2"
        >
          <Text className="text-white text-2xl font-bold">+</Text>
        </TouchableOpacity>
      </View>
      <View className="px-3 py-2 rounded bg-[#303030] border border-gray-700">
        <Text className="text-gray-300 text-lg">{toAmPm(hours, minutes)}</Text>
      </View>
    </View>
  );
};

export interface ScheduleEditorProps {
  value: Schedule[] | undefined;
  onChange: (next: Schedule[]) => void;
  onAddPress: () => void;
  onEditPress: (rule: Schedule, index: number) => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({
  value,
  onChange,
  onAddPress,
  onEditPress,
}) => {
  const schedules = value ?? [];
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const removeRule = (idx: number) => {
    onChange(schedules.filter((_, i) => i !== idx));
  };

  return (
    <View className="gap-3">
      {schedules.length === 0 && (
        <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
          <Text className="text-gray-300 text-xl">
            No schedule rules defined.
          </Text>
        </View>
      )}

      {schedules.map((rule, idx) => (
        <TouchableOpacity
          key={rule.id}
          onPress={() => onEditPress(rule, idx)}
          className="bg-[#303030] border rounded-lg p-4 border-gray-600"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Clock size={18} color="#9CA3AF" />
              <Text className="text-white font-semibold text-2xl">
                {rule.name || `Rule ${idx + 1}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                removeRule(idx);
              }}
              className="p-2 bg-red-900/30 border border-red-500 rounded-lg"
            >
              <Trash2 size={20} color="#F87171" />
            </TouchableOpacity>
          </View>
          <Text className="text-lg text-gray-400 mt-2">
            {rule.days.join(", ")} from {rule.startTime} to {rule.endTime}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={onAddPress}
        className="flex-row items-center gap-2 px-6 py-4 rounded-lg bg-blue-600 self-start"
      >
        <Plus size={20} color="#FFFFFF" />
        <Text className="text-white font-bold text-xl">Add Schedule Rule</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ScheduleEditor;
