import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import type { OnlineOrderDateFilter } from "@/hooks/orders/useOnlineOrdersByDate";
import {
    getCurrentBusinessDay,
    type BusinessDayConfig,
} from "@/lib/businessDay";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import * as PopoverPrimitive from "@rn-primitives/popover";
import { Calendar as CalendarIcon } from "lucide-react-native";
import { DateTime } from "luxon";
import React, { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Calendar, type DateData } from "react-native-calendars";

type DatePreset = OnlineOrderDateFilter["preset"];

interface DatePill {
  label: string;
  preset: DatePreset;
  getValue: () => { startDate: string | null; endDate: string | null };
}

function resolveConfig(): BusinessDayConfig {
  const store = useStoreSettingsStore.getState().selectedStore;
  return {
    timezone: store?.timezone || "UTC",
    rolloverHour: store?.business_day_start_hour ?? 0,
  };
}

function offsetBusinessDay(daysAgo: number, config: BusinessDayConfig): string {
  const today = getCurrentBusinessDay(config);
  if (daysAgo === 0) return today;
  const dt = DateTime.fromISO(today, { zone: config.timezone });
  return dt.minus({ days: daysAgo }).toISODate()!;
}

const DATE_PILLS: DatePill[] = [
  {
    label: "Today",
    preset: "today",
    getValue: () => ({ startDate: null, endDate: null }),
  },
  {
    label: "Yesterday",
    preset: "yesterday",
    getValue: () => {
      const config = resolveConfig();
      const yesterday = offsetBusinessDay(1, config);
      return { startDate: yesterday, endDate: yesterday };
    },
  },
  {
    label: "Last 7",
    preset: "last_7_days",
    getValue: () => {
      const config = resolveConfig();
      const end = offsetBusinessDay(0, config);
      const start = offsetBusinessDay(6, config);
      return { startDate: start, endDate: end };
    },
  },
];

function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toFormat("MMM d") : "";
}

function buildMarkedDates(
  from: string | null,
  to: string | null,
): Record<string, any> {
  const marked: Record<string, any> = {};
  if (!from) return marked;
  if (!to || from === to) {
    marked[from] = {
      startingDay: true,
      endingDay: true,
      color: colors.teal,
      textColor: "white",
    };
    return marked;
  }
  marked[from] = { startingDay: true, color: colors.teal, textColor: "white" };
  marked[to] = { endingDay: true, color: colors.teal, textColor: "white" };
  let cursor = DateTime.fromISO(from).plus({ days: 1 });
  const end = DateTime.fromISO(to);
  while (cursor < end) {
    const iso = cursor.toISODate();
    if (iso) marked[iso] = { color: colors.teal, textColor: "white" };
    cursor = cursor.plus({ days: 1 });
  }
  return marked;
}

const buildCalendarTheme = () => ({
  backgroundColor: colors.card,
  calendarBackground: colors.card,
  textSectionTitleColor: colors.label,
  selectedDayBackgroundColor: colors.teal,
  selectedDayTextColor: "#ffffff",
  todayTextColor: colors.teal,
  dayTextColor: colors.heading,
  textDisabledColor: colors.muted,
  arrowColor: colors.teal,
  monthTextColor: colors.heading,
  textMonthFontWeight: "bold" as const,
});

interface OnlineOrderDateFilterProps {
  value: OnlineOrderDateFilter;
  onChange: (filter: OnlineOrderDateFilter) => void;
}

const POPOVER_ROOT_STYLE = {
  alignSelf: "stretch" as const,
  flexDirection: "row" as const,
  alignItems: "stretch" as const,
};

const OnlineOrderDateFilterComponent: React.FC<OnlineOrderDateFilterProps> = ({
  value,
  onChange,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const triggerRef = useRef<PopoverPrimitive.TriggerRef>(null);
  const [pickStart, setPickStart] = useState<string | null>(value.startDate);
  const [pickEnd, setPickEnd] = useState<string | null>(value.endDate);

  const handlePillPress = useCallback(
    (pill: DatePill) => {
      const range = pill.getValue();
      onChange({ preset: pill.preset, ...range });
    },
    [onChange],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setPickStart(value.startDate);
        setPickEnd(value.endDate);
      }
    },
    [value.startDate, value.endDate],
  );

  const activePreset = value.preset;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
      {DATE_PILLS.map((pill) => {
        const isActive = activePreset === pill.preset;
        return (
          <Pressable
            key={pill.preset}
            onPress={() => handlePillPress(pill)}
            style={{
              paddingHorizontal: s(12),
              paddingVertical: s(6),
              borderRadius: s(6),
              borderWidth: 1,
              backgroundColor: isActive ? colors.teal + "20" : "transparent",
              borderColor: isActive ? colors.teal + "40" : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: s(13),
                fontWeight: isActive ? "700" : "500",
                color: isActive ? colors.teal : colors.label,
              }}
            >
              {pill.label}
            </Text>
          </Pressable>
        );
      })}

      {/* Custom date range picker */}
      <Popover onOpenChange={handleOpenChange} style={POPOVER_ROOT_STYLE}>
        <PopoverTrigger
          ref={triggerRef}
          style={{
            paddingHorizontal: s(10),
            paddingVertical: s(6),
            borderRadius: s(6),
            borderWidth: 1,
            backgroundColor:
              activePreset === "custom" ? colors.teal + "20" : "transparent",
            borderColor:
              activePreset === "custom" ? colors.teal + "40" : "transparent",
            flexDirection: "row",
            alignItems: "center",
            gap: s(4),
          }}
        >
          <CalendarIcon
            size={s(14)}
            color={activePreset === "custom" ? colors.teal : colors.label}
          />
          <Text
            style={{
              fontSize: s(13),
              fontWeight: activePreset === "custom" ? "700" : "500",
              color: activePreset === "custom" ? colors.teal : colors.label,
            }}
          >
            {activePreset === "custom"
              ? `${formatShortDate(value.startDate)} – ${formatShortDate(value.endDate)}`
              : "Custom"}
          </Text>
        </PopoverTrigger>
        <PopoverContent
          style={{
            width: 340,
            backgroundColor: colors.card,
            borderColor: colors.border,
          }}
        >
          <View>
            <Calendar
              markingType="period"
              markedDates={buildMarkedDates(pickStart, pickEnd)}
              onDayPress={(day: DateData) => {
                if (!pickStart || pickEnd) {
                  setPickStart(day.dateString);
                  setPickEnd(null);
                  return;
                }
                const startDate =
                  pickStart <= day.dateString ? pickStart : day.dateString;
                const endDate =
                  pickStart <= day.dateString ? day.dateString : pickStart;
                setPickStart(startDate);
                setPickEnd(endDate);
                onChange({ preset: "custom", startDate, endDate });
                triggerRef.current?.close();
              }}
              theme={buildCalendarTheme()}
              firstDay={1}
              hideExtraDays
              enableSwipeMonths
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.muted }}>
                {pickStart
                  ? pickEnd
                    ? `${formatShortDate(pickStart)} – ${formatShortDate(pickEnd)}`
                    : `From: ${formatShortDate(pickStart)}`
                  : "Select start date"}
              </Text>
            </View>
          </View>
        </PopoverContent>
      </Popover>
    </View>
  );
};

export default React.memo(OnlineOrderDateFilterComponent);
