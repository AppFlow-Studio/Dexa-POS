import { colors } from "@/lib/theme";
import { Schedule } from "@/lib/types";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { TimeField } from "./ScheduleEditor";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayKey = (typeof DAY_ORDER)[number];

interface ScheduleRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: Omit<Schedule, "id" | "isActive">) => void;
  initialData?: Omit<Schedule, "id" | "isActive"> | null;
  existingSchedules: Schedule[];
}

const ScheduleRuleModal: React.FC<ScheduleRuleModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  existingSchedules,
}) => {
  // Helper to get ISO string for a given hour/minute today
  const getIsoTime = (h: number, m: number = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const [name, setName] = useState("");
  const [days, setDays] = useState<DayKey[]>([]);
  const [startTime, setStartTime] = useState(getIsoTime(9));
  const [endTime, setEndTime] = useState(getIsoTime(17));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || "");
      setDays((initialData?.days as DayKey[]) || []);
      // Ensure we have valid ISO strings or fallback
      setStartTime(initialData?.startTime || getIsoTime(9));
      setEndTime(initialData?.endTime || getIsoTime(17));
      setError(null);
    }
  }, [isOpen, initialData]);

  // --- THIS IS THE CORRECTED FUNCTION ---
  const toggleDay = (d: DayKey) => {
    setDays((prev) => {
      const has = prev.includes(d);
      const next = has ? prev.filter((x) => x !== d) : [...prev, d];
      // Ensure the array maintains the correct Monday-Sunday order
      return DAY_ORDER.filter((dayOfWeek) => next.includes(dayOfWeek));
    });
  };

  const hasOverlap = (
    a: Omit<Schedule, "id" | "isActive">,
    b: Schedule
  ): boolean => {
    const sharedDays = a.days.some((day) => b.days.includes(day));
    if (!sharedDays) return false;

    // Helper to get minutes from start of day (local time)
    const getMins = (iso: string) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 0;
      return d.getHours() * 60 + d.getMinutes();
    };

    const aStart = getMins(a.startTime);
    let aEnd = getMins(a.endTime);
    const bStart = getMins(b.startTime);
    let bEnd = getMins(b.endTime);

    // Handle overnight (if end < start, assume +24h)
    if (aEnd < aStart) aEnd += 24 * 60;
    if (bEnd < bStart) bEnd += 24 * 60;

    // Check for overlap: !(a ends before b starts || a starts after b ends)
    return aStart < bEnd && aEnd > bStart;
  };

  const handleSave = () => {
    if (!name.trim()) {
      setError("Rule name cannot be empty.");
      return;
    }
    if (days.length === 0) {
      setError("Please select at least one day.");
      return;
    }

    const dStart = new Date(startTime);
    const dEnd = new Date(endTime);
    const startMins = dStart.getHours() * 60 + dStart.getMinutes();
    const endMins = dEnd.getHours() * 60 + dEnd.getMinutes();

    // Check equality only; if end < start it's overnight (allowed)
    if (startMins === endMins) {
      setError("Start and end time cannot be the same.");
      return;
    }

    const newRuleData = { name, days, startTime, endTime };
    const overlaps = existingSchedules.some((existingRule) => {
      if (initialData && existingRule.name === initialData.name) return false;
      return hasOverlap(newRuleData, existingRule);
    });

    if (overlaps) {
      setError("This schedule overlaps with an existing rule.");
      return;
    }

    onSave(newRuleData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-panel border-gray-700 w-[600px]">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">
              {initialData ? "Edit Schedule Rule" : "Add Schedule Rule"}
            </DialogTitle>
          </DialogHeader>
          <View className="py-4 gap-y-4">
            <View>
              <Text className="text-gray-300 mb-1.5 text-xl font-semibold">
                Rule Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g., Happy Hour"
                placeholderTextColor={colors.muted}
                className="bg-surface border border-gray-600 rounded-lg px-3 py-2 text-white text-lg h-16"
              />
            </View>
            <View>
              <Text className="text-gray-300 mb-1.5 text-xl font-semibold">
                Active Days
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {DAY_ORDER.map((d) => {
                  const active = days.includes(d);
                  return (
                    <TouchableOpacity
                      key={d}
                      onPress={() => toggleDay(d)}
                      className={`px-4 py-3 rounded-lg border ${
                        active
                          ? "bg-blue-600 border-blue-500"
                          : "bg-surface border-gray-600"
                      }`}
                    >
                      <Text
                        className={`text-xl font-semibold ${
                          active ? "text-white" : "text-gray-300"
                        }`}
                      >
                        {d}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-gray-300 mb-1.5 text-xl font-semibold">
                  Start Time
                </Text>
                <TimeField value={startTime} onChange={setStartTime} />
              </View>
              <View className="flex-1">
                <Text className="text-gray-300 mb-1.5 text-xl font-semibold">
                  End Time
                </Text>
                <TimeField value={endTime} onChange={setEndTime} />
              </View>
            </View>
            {error && (
              <Text className="text-red-400 mt-1.5 text-lg">{error}</Text>
            )}
          </View>
          <View className="flex-row gap-3 mt-3 pt-4 border-t border-gray-700">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 px-3 py-3 rounded-lg bg-surface border border-gray-600"
            >
              <Text className="text-white text-center text-xl font-bold">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              className="flex-1 px-3 py-3 rounded-lg bg-blue-600"
            >
              <Text className="text-white text-center text-xl font-bold">
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleRuleModal;
