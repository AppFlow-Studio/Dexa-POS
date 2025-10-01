// /components/menu/ScheduleRuleModal.tsx
import { Schedule } from "@/lib/types";
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
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
  const [name, setName] = useState("");
  const [days, setDays] = useState<DayKey[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || "");
      setDays((initialData?.days as DayKey[]) || []);
      setStartTime(initialData?.startTime || "09:00");
      setEndTime(initialData?.endTime || "17:00");
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

    const [aStartH, aStartM] = a.startTime.split(":").map(Number);
    const [aEndH, aEndM] = a.endTime.split(":").map(Number);
    const [bStartH, bStartM] = b.startTime.split(":").map(Number);
    const [bEndH, bEndM] = b.endTime.split(":").map(Number);

    const aStartMinutes = aStartH * 60 + aStartM;
    const aEndMinutes = aEndH * 60 + aEndM;
    const bStartMinutes = bStartH * 60 + bStartM;
    const bEndMinutes = bEndH * 60 + bEndM;

    // Check for overlap: !(a ends before b starts || a starts after b ends)
    return aStartMinutes < bEndMinutes && aEndMinutes > bStartMinutes;
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
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if (sh * 60 + sm >= eh * 60 + em) {
      setError("End time must be after start time.");
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
      <DialogContent className="bg-[#212121] border-gray-700 w-[600px]">
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
              placeholderTextColor="#6B7280"
              className="bg-[#303030] border border-gray-600 rounded-lg px-3 py-2 text-white text-lg h-16"
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
                        : "bg-[#303030] border-gray-600"
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
            className="flex-1 px-3 py-3 rounded-lg bg-[#303030] border border-gray-600"
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
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleRuleModal;
