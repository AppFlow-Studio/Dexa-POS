import { Schedule } from "@/lib/types";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayKey = (typeof DAY_ORDER)[number];

// Reusable TimeField component
const TimeField: React.FC<{
  value: string;
  onChange: (next: string) => void;
}> = ({ value, onChange }) => {
  const [hours, minutes] = useMemo(() => {
    const [h = "0", m = "0"] = value?.split(":") ?? [];
    return [parseInt(h, 10) || 0, parseInt(m, 10) || 0];
  }, [value]);

  const isPm = hours >= 12;
  const displayHours = hours % 12 || 12;

  const updateTime = (h: number, m: number) => {
    onChange(
      `${String((h + 24) % 24).padStart(2, "0")}:${String(
        (m + 60) % 60
      ).padStart(2, "0")}`
    );
  };

  const setHour = (newDisplayHour: number) => {
    let newH24 = newDisplayHour;
    if (isPm) {
      if (newDisplayHour !== 12) newH24 = newDisplayHour + 12;
    } else {
      if (newDisplayHour === 12) newH24 = 0;
    }
    updateTime(newH24, minutes);
  };

  const toggleAmPm = () => {
    const newH = (hours + 12) % 24;
    updateTime(newH, minutes);
  };

  return (
    <View className="flex-row items-center gap-2 p-1 bg-panel border border-gray-600 rounded-lg">
      <View className="flex-1 flex-row items-center justify-around">
        <TouchableOpacity
          onPress={() => setHour(displayHours === 1 ? 12 : displayHours - 1)}
          className="p-2"
        >
          <Text className="text-white text-xl font-bold">-</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">
          {String(displayHours).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => setHour(displayHours === 12 ? 1 : displayHours + 1)}
          className="p-2"
        >
          <Text className="text-white text-xl font-bold">+</Text>
        </TouchableOpacity>
      </View>
      <Text className="text-white text-xl font-bold">:</Text>
      <View className="flex-1 flex-row items-center justify-around">
        <TouchableOpacity
          onPress={() => updateTime(hours, (minutes + 45) % 60)}
          className="p-2"
        >
          <Text className="text-white text-xl font-bold">-</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">
          {String(minutes).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => updateTime(hours, (minutes + 15) % 60)}
          className="p-2"
        >
          <Text className="text-white text-xl font-bold">+</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={toggleAmPm}
        className="px-3 py-2 rounded bg-surface border border-gray-700 min-w-[60px] items-center"
      >
        <Text className="text-white text-lg font-bold">
          {isPm ? "PM" : "AM"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// --- Bottom Sheet for Add/Edit --- //
interface ScheduleFormSheetProps {
  rule: Schedule | null;
  onSave: (rule: Schedule) => void;
}

const ScheduleFormSheet = forwardRef<BottomSheet, ScheduleFormSheetProps>(
  function ScheduleFormSheet({ rule, onSave }, ref) {
    const [name, setName] = useState("");
    const [days, setDays] = useState<DayKey[]>([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
    ]);
    const [start, setStart] = useState("09:00");
    const [end, setEnd] = useState("17:00");
    const [msg, setMsg] = useState<string | null>(null);

    const getIsoTime = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      return d.toISOString();
    };

    const parseTimeFromIso = (isoStr: string) => {
      if (!isoStr || !isoStr.includes("T")) return isoStr; // Fallback if already HH:MM
      const d = new Date(isoStr);
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return `${h}:${m}`;
    };

    useEffect(() => {
      if (rule) {
        setName(rule.name || "");
        setDays((rule.days as DayKey[]) || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
        setStart(parseTimeFromIso(rule.startTime));
        setEnd(parseTimeFromIso(rule.endTime));
      } else {
        setName("");
        setDays(["Mon", "Tue", "Wed", "Thu", "Fri"]);
        setStart("09:00");
        setEnd("17:00");
      }
      setMsg(null);
    }, [rule]);

    const toggleDay = (d: DayKey) => {
      setDays((prev) => {
        const has = prev.includes(d);
        const next = has ? prev.filter((x) => x !== d) : [...prev, d];
        return DAY_ORDER.filter((x) => next.includes(x));
      });
    };

    const isValid = useMemo(() => {
      if (days.length === 0) return false;
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const startM = sh * 60 + (sm || 0);
      const endM = eh * 60 + (em || 0);
      return endM > startM;
    }, [days, start, end]);

    const handleSave = () => {
      if (!isValid) {
        setMsg(
          days.length === 0
            ? "Select at least one day."
            : "End time must be after start time."
        );
        return;
      }
      const finalRule: Schedule = {
        ...(rule || { id: `sch_${Date.now()}`, name: "", isActive: true }),
        name: name.trim() || (rule?.name ?? "New Schedule"),
        days,
        startTime: getIsoTime(start),
        endTime: getIsoTime(end),
      };
      onSave(finalRule);
      (ref as React.RefObject<BottomSheet>)?.current?.close();
    };

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={["75%"]}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
        {...bottomSheetTheme}
      >
        <BottomSheetView className="p-4 h-full">
          <Text className="text-white text-2xl font-semibold mb-4">
            {rule ? "Edit Schedule" : "Add Schedule"}
          </Text>
          {!!msg && (
            <View className="bg-red-900/30 border border-red-500 rounded-lg p-2 mb-3">
              <Text className="text-red-400 text-xs">{msg}</Text>
            </View>
          )}
          <View className="mb-4">
            <Text className="text-gray-300 mb-2">Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Lunch, Happy Hour"
              placeholderTextColor={colors.label}
              className="bg-surface border border-gray-600 rounded-lg px-4 py-3 text-white"
            />
          </View>
          <View className="mb-4">
            <Text className="text-gray-300 mb-2">Days</Text>
            <View className="flex-row flex-wrap gap-2">
              {DAY_ORDER.map((d) => {
                const active = days.includes(d);
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => toggleDay(d)}
                    className={`px-3 py-2 rounded-lg border ${active
                        ? "bg-blue-600 border-blue-500"
                        : "bg-panel border-gray-600"
                      }`}
                  >
                    <Text
                      className={`text-sm ${active ? "text-white" : "text-gray-300"
                        }`}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View className="flex-row gap-4 w-full justify-between mb-4">
            <View className="flex-1">
              <Text className="text-gray-300 text-lg mb-2 text-center">
                Start Time
              </Text>
              <TimeField value={start} onChange={setStart} />
            </View>
            <View className="flex-1">
              <Text className="text-gray-300 text-lg mb-2 text-center">
                End Time
              </Text>
              <TimeField value={end} onChange={setEnd} />
            </View>
          </View>
          <View className="flex-1 justify-end">
            <TouchableOpacity
              onPress={handleSave}
              className="px-4 py-4 rounded-lg bg-blue-600"
            >
              <Text className="text-white text-center text-lg font-semibold">
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

export default ScheduleFormSheet;
