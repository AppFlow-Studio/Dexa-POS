import { getCurrentBusinessDay, type BusinessDayConfig } from "@/lib/businessDay";
import { colors } from "@/lib/theme";
import { useColorScheme } from "@/lib/useColorScheme";
import type { DateWindowLabel } from "@/stores/usePreviousOrdersStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import * as PopoverPrimitive from "@rn-primitives/popover";
import { DateTime } from "luxon";
import { Calendar as CalendarIcon } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Calendar, type DateData } from "react-native-calendars";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

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

// Built per-render (inside components that subscribe to useColorScheme) so the
// values reflect the current theme. If hoisted to module scope these would be
// captured once at import time and never update when the user toggles light/
// dark.
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

const buildPopoverStyle = () => ({
  width: 340,
  backgroundColor: colors.card,
  borderColor: colors.border,
});

const PILL_BASE_STYLE = {
  paddingHorizontal: 12,
  alignSelf: "stretch" as const,
  justifyContent: "center" as const,
  borderRadius: 6,
  borderWidth: 1,
};

const buildPillActiveStyle = () => ({
  backgroundColor: colors.teal + "20",
  borderColor: colors.teal + "40",
});

const PILL_INACTIVE_STYLE = { borderColor: "transparent" };

// Popover (Root) renders a wrapping View around the Trigger. Without these
// flex props the Custom pill renders shorter than its siblings and sits
// off-center in the row.
const POPOVER_ROOT_STYLE = {
  alignSelf: "stretch" as const,
  flexDirection: "row" as const,
  alignItems: "stretch" as const,
};

const CustomDatePillContent: React.FC<{
  isActive: boolean;
  currentStart: string | null;
  currentEnd: string | null;
  onSelect: (pill: DatePillDef) => void;
}> = ({ isActive, currentStart, currentEnd, onSelect }) => {
  const { colorScheme } = useColorScheme();
  const triggerRef = useRef<PopoverPrimitive.TriggerRef>(null);
  const [pickingFrom, setPickingFrom] = useState<string | null>(
    isActive ? currentStart : null,
  );
  const [pickingTo, setPickingTo] = useState<string | null>(
    isActive ? currentEnd : null,
  );

  const handleDayPress = useCallback(
    (day: DateData) => {
      if (!pickingFrom || pickingTo) {
        setPickingFrom(day.dateString);
        setPickingTo(null);
        return;
      }
      const startDate =
        pickingFrom <= day.dateString ? pickingFrom : day.dateString;
      const endDate =
        pickingFrom <= day.dateString ? day.dateString : pickingFrom;
      setPickingFrom(startDate);
      setPickingTo(endDate);
      onSelect({
        label: "Custom",
        windowLabel: "custom",
        getDateRange: () => ({ startDate, endDate }),
      });
      triggerRef.current?.close();
    },
    [pickingFrom, pickingTo, onSelect],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setPickingFrom(isActive ? currentStart : null);
        setPickingTo(isActive ? currentEnd : null);
      }
    },
    [isActive, currentStart, currentEnd],
  );

  const labelText = useMemo(() => {
    if (!isActive || !currentStart) return "Custom";
    if (currentStart === currentEnd || !currentEnd)
      return formatShortDate(currentStart);
    return `${formatShortDate(currentStart)} – ${formatShortDate(currentEnd)}`;
  }, [isActive, currentStart, currentEnd]);

  const markedDates = useMemo(
    () => buildMarkedDates(pickingFrom, pickingTo),
    [pickingFrom, pickingTo],
  );

  const triggerStyle = useMemo(
    () => [
      PILL_BASE_STYLE,
      isActive ? buildPillActiveStyle() : PILL_INACTIVE_STYLE,
    ],
    // colorScheme included so the active-pill teal/border tint follows theme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isActive, colorScheme],
  );

  const triggerIconColor = isActive ? colors.teal : colors.label;
  const triggerTextStyle = useMemo(
    () => ({ color: triggerIconColor }),
    [triggerIconColor],
  );

  const popoverStyle = useMemo(
    () => buildPopoverStyle(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorScheme],
  );
  const calendarTheme = useMemo(
    () => buildCalendarTheme(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorScheme],
  );

  return (
    <Popover onOpenChange={handleOpenChange} style={POPOVER_ROOT_STYLE}>
      <PopoverTrigger
        ref={triggerRef}
        className="flex-row items-center rounded-md gap-x-1"
        style={triggerStyle}
      >
        <CalendarIcon size={10} color={triggerIconColor} />
        <Text className="text-xs font-semibold" style={triggerTextStyle}>
          {labelText}
        </Text>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="p-0 border rounded-2xl"
        style={popoverStyle}
      >
        <View style={{ padding: 8 }}>
          <Calendar
            onDayPress={handleDayPress}
            markingType="period"
            markedDates={markedDates}
            theme={calendarTheme}
          />
          {pickingFrom && (
            <Text
              style={{
                paddingTop: 6,
                paddingHorizontal: 8,
                fontSize: 12,
                color: colors.label,
              }}
            >
              {pickingTo
                ? `${formatShortDate(pickingFrom)} – ${formatShortDate(pickingTo)}`
                : `Start: ${formatShortDate(pickingFrom)} — tap end date`}
            </Text>
          )}
        </View>
      </PopoverContent>
    </Popover>
  );
};

const CustomDatePill = React.memo(CustomDatePillContent);

const PresetPill: React.FC<{
  pill: DatePillDef;
  isActive: boolean;
  onSelect: (pill: DatePillDef) => void;
}> = React.memo(({ pill, isActive, onSelect }) => {
  const { colorScheme } = useColorScheme();
  const handlePress = useCallback(() => onSelect(pill), [pill, onSelect]);
  const pillStyle = useMemo(
    () => [
      PILL_BASE_STYLE,
      isActive ? buildPillActiveStyle() : PILL_INACTIVE_STYLE,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isActive, colorScheme],
  );
  const textStyle = useMemo(
    () => ({ color: isActive ? colors.teal : colors.label }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isActive, colorScheme],
  );
  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center rounded-md gap-x-1"
      style={pillStyle}
    >
      {pill.windowLabel !== "today" && pill.windowLabel !== "yesterday" && (
        <CalendarIcon size={10} color={isActive ? colors.teal : colors.label} />
      )}
      <Text className="text-xs font-semibold" style={textStyle}>
        {pill.label}
      </Text>
    </Pressable>
  );
});
PresetPill.displayName = "PresetPill";

const selectCustomStart = (s: { dateWindow?: { label: DateWindowLabel; startDate: string | null } | null }) =>
  s.dateWindow?.label === "custom" ? s.dateWindow.startDate : null;
const selectCustomEnd = (s: { dateWindow?: { label: DateWindowLabel; endDate: string | null } | null }) =>
  s.dateWindow?.label === "custom" ? s.dateWindow.endDate : null;

const DatePillRowContent: React.FC<{
  activeLabel: DateWindowLabel;
  onSelect: (pill: DatePillDef) => void;
}> = ({ activeLabel, onSelect }) => {
  const { colorScheme } = useColorScheme();
  const customStart = usePreviousOrdersStore(selectCustomStart);
  const customEnd = usePreviousOrdersStore(selectCustomEnd);

  const rowStyle = useMemo(
    () => ({
      height: 34,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorScheme],
  );

  return (
    <View className="flex-row self-start rounded-lg p-0.5" style={rowStyle}>
      {DATE_PILLS.map((pill) => (
        <PresetPill
          key={pill.windowLabel}
          pill={pill}
          isActive={activeLabel === pill.windowLabel}
          onSelect={onSelect}
        />
      ))}
      <CustomDatePill
        isActive={activeLabel === "custom"}
        currentStart={customStart}
        currentEnd={customEnd}
        onSelect={onSelect}
      />
    </View>
  );
};

const DatePillRow = React.memo(DatePillRowContent);

export default DatePillRow;
