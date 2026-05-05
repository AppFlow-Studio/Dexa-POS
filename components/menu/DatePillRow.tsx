import { getCurrentBusinessDay, type BusinessDayConfig } from "@/lib/businessDay";
import { colors } from "@/lib/theme";
import type { DateWindowLabel } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { DateTime } from "luxon";
import { Calendar } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

export interface DatePillDef {
  label: string;
  windowLabel: DateWindowLabel;
  getDateRange: () => { startDate: string | null; endDate: string | null };
}

/**
 * Resolve the current location's business-day config from the settings store.
 * Falls back to UTC + midnight rollover when no store is selected (e.g. cold
 * start before login) — predictable behaviour, matches the historical default.
 */
function resolveConfig(): BusinessDayConfig {
  const store = useStoreSettingsStore.getState().selectedStore;
  return {
    timezone: store?.timezone || "UTC",
    rolloverHour: store?.business_day_start_hour ?? 0,
  };
}

/**
 * Compute a calendar date string ('YYYY-MM-DD') in the location's timezone,
 * offset N business days from today. Used by the Yesterday / Last 7 Days pills
 * so the date strings sent to `get_business_day_bounds` reflect the merchant's
 * day boundaries — not whatever the device clock or UTC midnight happens to be.
 *
 * Without this, `new Date().toISOString().split('T')[0]` would silently use UTC
 * dates: at 8 PM EDT (which is ~midnight UTC the next day) "Yesterday" would
 * resolve to today's UTC date, and the user would see today's orders under the
 * Yesterday pill.
 */
function offsetBusinessDay(daysAgo: number, config: BusinessDayConfig): string {
  const today = getCurrentBusinessDay(config); // 'YYYY-MM-DD' in location TZ
  if (daysAgo === 0) return today;
  const dt = DateTime.fromISO(today, { zone: config.timezone });
  return dt.minus({ days: daysAgo }).toISODate()!;
}

export const DATE_PILLS: DatePillDef[] = [
  {
    label: "Today",
    windowLabel: "today",
    // null/null lets the server compute today's bounds via
    // `get_business_day_bounds(p_location_id, NULL, NULL)`.
    getDateRange: () => ({ startDate: null, endDate: null }),
  },
  {
    label: "Yesterday",
    windowLabel: "yesterday",
    getDateRange: () => {
      const config = resolveConfig();
      const yesterday = offsetBusinessDay(1, config);
      return { startDate: yesterday, endDate: yesterday };
    },
  },
  {
    label: "Last 7 days",
    windowLabel: "last_7_days",
    getDateRange: () => {
      const config = resolveConfig();
      const end = offsetBusinessDay(0, config);
      const start = offsetBusinessDay(6, config);
      return { startDate: start, endDate: end };
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
