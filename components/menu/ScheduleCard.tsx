import { Menu, Schedule } from "@/lib/types";
import { Category } from "@/stores/useMenuStore";
import { router } from "expo-router";
import { Settings } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ScheduleCardProps {
  item: (Menu | Category) & { type: "menu" | "category" };
}

// Helper to format days for display
const formatDays = (days: string[]): string => {
  if (days.length === 7) return "Every Day";
  if (days.length === 5 && days.includes("Mon") && days.includes("Fri"))
    return "Weekdays";
  if (days.length === 2 && days.includes("Sat") && days.includes("Sun"))
    return "Weekends";
  return days.join(", ");
};

export const ScheduleCard: React.FC<ScheduleCardProps> = ({ item }) => {
  const handleEdit = () => {
    if (item.type === "menu") {
      router.push(`/menu/edit-menu?id=${item.id}`);
    } else {
      router.push(`/menu/edit-category?id=${item.id}`);
    }
  };

  return (
    <View className="bg-[#303030] rounded-lg border border-gray-700 p-4 mb-3">
      <View className="flex-row justify-between items-center">
        <View>
          <Text className="text-xs font-semibold text-purple-400 mb-0.5">
            {item.type === "menu" ? "Menu" : "Category"}
          </Text>
          <Text className="text-xl font-bold text-white">{item.name}</Text>
        </View>
        <TouchableOpacity
          onPress={handleEdit}
          className="p-2 bg-[#212121] rounded border border-gray-600"
        >
          <Settings size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <View className="mt-3 space-y-1.5">
        {(item.schedules?.length ?? 0) === 0 ? (
          <Text className="text-base text-gray-400 py-2">
            Always available (no schedule rules)
          </Text>
        ) : (
          item.schedules?.map((schedule: Schedule, index: number) => (
            <View
              key={index}
              className="p-2 bg-[#212121] rounded-md border border-gray-600"
            >
              <Text className="text-base font-semibold text-gray-300">
                {formatDays(schedule.days)}: {schedule.startTime} -{" "}
                {schedule.endTime}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
};
