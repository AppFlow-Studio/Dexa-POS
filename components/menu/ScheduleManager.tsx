import { colors } from "@/lib/theme";
import { Schedule } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { CalendarClock, Clock, Plus, Trash2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export interface ScheduleManagerProps {
  value: Schedule[];
  onChange: (next: Schedule[]) => void;
  onAdd: () => void;
  onEdit: (rule: Schedule, index: number) => void;
}

const formatTime = (time: string): string => {
  if (!time) return "";
  if (time.includes("T")) {
    const date = new Date(time);
    if (!isNaN(date.getTime())) {
      let hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      const strMinutes = minutes < 10 ? "0" + minutes : minutes;
      return `${hours}:${strMinutes} ${ampm}`;
    }
  }
  const parts = time.split(":");
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      const strMinutes = minutes < 10 ? "0" + minutes : minutes;
      return `${hours}:${strMinutes} ${ampm}`;
    }
  }
  return time;
};

const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  value,
  onChange,
  onAdd,
  onEdit,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const schedules = value ?? [];

  const removeRule = (idx: number) => {
    onChange(schedules.filter((_, i) => i !== idx));
  };

  return (
    <View style={{ gap: s(6) }}>
      {schedules.length === 0 && (
        <View
          style={{
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
            padding: s(12),
            alignItems: "center",
            gap: s(4),
          }}
        >
          <CalendarClock size={s(16)} color={colors.muted} />
          <Text style={{ fontSize: s(12), color: colors.muted }}>
            No schedule rules — always available
          </Text>
        </View>
      )}

      {schedules.map((rule, idx) => (
        <TouchableOpacity
          key={rule.id}
          onPress={() => onEdit(rule, idx)}
          style={{
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
            paddingHorizontal: s(12),
            paddingVertical: s(9),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(8),
              flex: 1,
            }}
          >
            <View
              style={{
                width: s(28),
                height: s(28),
                borderRadius: s(8),
                backgroundColor: colors.teal + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Clock size={s(13)} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "600",
                  color: colors.heading,
                }}
              >
                {rule.name || `Rule ${idx + 1}`}
              </Text>
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.label,
                  marginTop: s(1),
                }}
              >
                {(rule.days || []).join(", ")} · {formatTime(rule.startTime)} –{" "}
                {formatTime(rule.endTime)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              removeRule(idx);
            }}
            style={{
              padding: s(6),
              backgroundColor: colors.danger + "15",
              borderWidth: 1,
              borderColor: colors.danger + "30",
              borderRadius: s(7),
            }}
          >
            <Trash2 size={s(13)} color={colors.danger} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={onAdd}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s(6),
          alignSelf: "flex-start",
          paddingHorizontal: s(12),
          paddingVertical: s(6),
          borderRadius: s(8),
          backgroundColor: colors.teal + "20",
          borderWidth: 1,
          borderColor: colors.teal + "50",
        }}
      >
        <Plus size={s(13)} color={colors.teal} />
        <Text
          style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}
        >
          Add Schedule Rule
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default ScheduleManager;
