import { colors } from "@/lib/theme";
import type { DateWindowLabel } from "@/stores/usePreviousOrdersStore";
import { Calendar } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

export interface DatePillDef {
  label: string;
  windowLabel: DateWindowLabel;
  getDateRange: () => { startDate: string | null; endDate: string | null };
}

export const DATE_PILLS: DatePillDef[] = [
  {
    label: "Today",
    windowLabel: "today",
    getDateRange: () => ({ startDate: null, endDate: null }),
  },
  {
    label: "Yesterday",
    windowLabel: "yesterday",
    getDateRange: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return { startDate: d.toISOString().split("T")[0], endDate: d.toISOString().split("T")[0] };
    },
  },
  {
    label: "Last 7 days",
    windowLabel: "last_7_days",
    getDateRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] };
    },
  },
];

const DatePillRow: React.FC<{
  activeLabel: DateWindowLabel;
  onSelect: (pill: DatePillDef) => void;
}> = ({ activeLabel, onSelect }) => (
  <View
    className="flex-row self-start rounded-lg p-0.5"
    style={{ height: 34, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 2 }}
  >
    {DATE_PILLS.map((pill) => {
      const isActive = activeLabel === pill.windowLabel;
      return (
        <Pressable
          key={pill.windowLabel}
          onPress={() => onSelect(pill)}
          className="flex-row items-center rounded-md gap-x-1"
          style={[
            { paddingHorizontal: 12, alignSelf: "stretch", justifyContent: "center", borderRadius: 6, borderWidth: 1 },
            isActive
              ? { backgroundColor: colors.teal + "20", borderColor: colors.teal + "40" }
              : { borderColor: "transparent" },
          ]}
        >
          {pill.windowLabel !== "today" && pill.windowLabel !== "yesterday" && (
            <Calendar size={10} color={isActive ? colors.teal : colors.label} />
          )}
          <Text
            className="text-xs font-semibold"
            style={{ color: isActive ? colors.teal : colors.label }}
          >
            {pill.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

export default DatePillRow;
