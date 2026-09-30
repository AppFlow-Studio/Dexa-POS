import { CalendarDays } from "@/lib/icons";
import {
  customRangeLabel,
  DATE_PRESETS,
  shortDay,
  storeToday,
  type DateFilter,
} from "./kioskOrders";
import { Chip, TEAL } from "./KioskOrdersUi";
import { DateTime } from "luxon";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Calendar, type DateData } from "react-native-calendars";

/**
 * Date chips for Kiosk Settings → Orders: Today, Yesterday, Last 7 / 30 days,
 * and "Pick dates", which opens a calendar for one day or a range.
 */
export function KioskOrdersDateFilter({
  value,
  onChange,
}: {
  value: DateFilter;
  onChange: (filter: DateFilter) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isCustom = value.preset === "custom" && !!value.start;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8 }}
      >
        {DATE_PRESETS.map((p) => (
          <Chip
            key={p.preset}
            label={p.label}
            active={value.preset === p.preset}
            onPress={() => onChange({ preset: p.preset })}
          />
        ))}
        <Chip
          label={isCustom ? customRangeLabel(value.start!, value.end) : "Pick dates"}
          Icon={CalendarDays}
          active={isCustom}
          onPress={() => setPickerOpen(true)}
        />
      </ScrollView>

      <DateRangeModal
        visible={pickerOpen}
        initialStart={isCustom ? value.start : undefined}
        initialEnd={isCustom ? value.end : undefined}
        onClose={() => setPickerOpen(false)}
        onApply={(start, end) => {
          setPickerOpen(false);
          onChange({ preset: "custom", start, end });
        }}
      />
    </>
  );
}

/** Period markings from `start` to `end` (or just `start`). */
function periodMarks(start: string | null, end: string | null) {
  if (!start) return {};
  const last = end ?? start;
  const marks: Record<string, object> = {};
  for (
    let d = DateTime.fromISO(start);
    d <= DateTime.fromISO(last);
    d = d.plus({ days: 1 })
  ) {
    const key = d.toISODate() ?? "";
    const edge = key === start || key === last;
    marks[key] = {
      startingDay: key === start,
      endingDay: key === last,
      color: edge ? TEAL : "#CCFBF1",
      textColor: edge ? "#FFFFFF" : "#0F766E",
    };
  }
  return marks;
}

function DateRangeModal({
  visible,
  initialStart,
  initialEnd,
  onClose,
  onApply,
}: {
  visible: boolean;
  initialStart?: string;
  initialEnd?: string;
  onClose: () => void;
  onApply: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStart(initialStart ?? null);
    setEnd(initialEnd ?? null);
  }, [visible, initialStart, initialEnd]);

  const today = storeToday().toISODate() ?? undefined;

  // First tap picks a day; a second tap makes it a range (in either order);
  // a tap after that starts over.
  const onDayPress = (day: DateData) => {
    const d = day.dateString;
    if (!start || end) {
      setStart(d);
      setEnd(null);
    } else if (d < start) {
      setEnd(start);
      setStart(d);
    } else {
      setEnd(d);
    }
  };

  const hint = !start
    ? "Tap a day, or a start and an end day."
    : !end
      ? `${shortDay(start)} · tap another day for a range`
      : customRangeLabel(start, end);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 items-center justify-center px-6">
        <Pressable className="absolute inset-0 bg-black/40" onPress={onClose} />
        <View
          className="w-full bg-white rounded-3xl p-5"
          style={{ maxWidth: 420 }}
        >
          <Text className="text-lg font-bold text-gray-900">Choose dates</Text>
          <Text className="text-sm text-gray-500 mt-0.5 mb-3">{hint}</Text>
          <Calendar
            current={start ?? today}
            maxDate={today}
            markingType="period"
            markedDates={periodMarks(start, end)}
            onDayPress={onDayPress}
            hideExtraDays
            enableSwipeMonths
            theme={{
              todayTextColor: TEAL,
              arrowColor: TEAL,
              textMonthFontWeight: "700",
              textDayHeaderFontWeight: "600",
              textDayFontWeight: "500",
            }}
          />
          <View className="flex-row mt-4" style={{ gap: 10 }}>
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-4 rounded-2xl bg-gray-100 items-center"
            >
              <Text className="text-base font-bold text-gray-700">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => start && onApply(start, end ?? start)}
              disabled={!start}
              className={`flex-1 py-4 rounded-2xl items-center ${
                start ? "bg-teal-600" : "bg-gray-200"
              }`}
            >
              <Text
                className={`text-base font-bold ${
                  start ? "text-white" : "text-gray-400"
                }`}
              >
                Show orders
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
