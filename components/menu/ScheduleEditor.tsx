import { colors } from "@/lib/theme";
import { Schedule } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { Clock, Plus, Trash2 } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
const DAY_ORDER: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const TimeField: React.FC<{
  value: string;
  onChange: (next: string) => void;
}> = ({ value, onChange }) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [hours, minutes] = useMemo(() => {
    if (!value) return [0, 0];
    const d = new Date(value);
    // If invalid date (e.g. old "09:00" format during migration), fallback or parse manually
    if (isNaN(d.getTime())) {
      const [h = "0", m = "0"] = value.split(":") ?? [];
      return [parseInt(h, 10) || 0, parseInt(m, 10) || 0];
    }
    return [d.getHours(), d.getMinutes()];
  }, [value]);

  const set = (h: number, m: number) => {
    let d = value ? new Date(value) : new Date();
    if (isNaN(d.getTime())) d = new Date(); // Fallback if invalid
    d.setHours((h + 24) % 24);
    d.setMinutes((m + 60) % 60);
    d.setSeconds(0);
    d.setMilliseconds(0);
    onChange(d.toISOString());
  };

  const toAmPm = (h: number, m: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const minutesStr = String(m).padStart(2, "0");
    return `${hour12}:${minutesStr} ${period}`;
  };

  return (
    <View className="flex-row items-center gap-2 p-1 bg-panel border border-gray-600 rounded-lg">
      <View className="flex-1 flex-row items-center justify-around">
        <TouchableOpacity
          onPress={() => set(hours === 0 ? 23 : hours - 1, minutes)}
          className="p-2"
        >
          <Text className="text-white text-xl font-bold">-</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">
          {String(hours).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => set(hours === 23 ? 0 : hours + 1, minutes)}
          className="p-2"
        >
          <Text className="text-white text-xl font-bold">+</Text>
        </TouchableOpacity>
      </View>
      <Text className="text-white text-xl font-bold">:</Text>
      <View className="flex-1 flex-row items-center justify-around">
        <TouchableOpacity
          onPress={() => set(hours, (minutes + 45) % 60)}
          className="p-2"
        >
          <Text className="text-white text-xl font-bold">-</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">
          {String(minutes).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => set(hours, (minutes + 15) % 60)}
          className="p-2"
        >
          <Text className="text-white text-xl font-bold">+</Text>
        </TouchableOpacity>
      </View>
      <View className="px-2 py-1 rounded bg-surface border border-gray-700">
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
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const schedules = value ?? [];
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const removeRule = (idx: number) => {
    onChange(schedules.filter((_, i) => i !== idx));
  };

  return (
    <View className="gap-2">
      {schedules.length === 0 && (
        <View className="bg-surface border border-gray-600 rounded-lg p-4 items-center">
          <Text className="text-gray-300 text-lg">
            No schedule rules defined.
          </Text>
        </View>
      )}

      {schedules.map((rule, idx) => (
        <TouchableOpacity
          key={rule.id}
          onPress={() => onEditPress(rule, idx)}
          className="bg-surface border rounded-lg p-3 border-gray-600"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Clock size={s(16)} color={colors.label} />
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
              <Trash2 size={s(18)} color={colors.danger} />
            </TouchableOpacity>
          </View>
          <Text className="text-base text-gray-400 mt-1.5">
            {(rule.days || []).join(", ")} from{" "}
            {new Date(rule.startTime).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            to{" "}
            {new Date(rule.endTime).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={onAddPress}
        className="flex-row items-center gap-2 px-4 py-3 rounded-lg bg-blue-600 self-start"
      >
        <Plus size={s(18)} color="#FFFFFF" />
        <Text className="text-white font-bold text-lg">Add Schedule Rule</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ScheduleEditor;
