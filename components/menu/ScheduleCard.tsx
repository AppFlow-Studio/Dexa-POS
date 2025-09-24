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
    <View className="bg-[#303030] rounded-lg border border-gray-700 p-6 mb-4">
      <View className="flex-row justify-between items-start">
        <View>
          <Text className="text-sm font-semibold text-purple-400 mb-1">
            {item.type === "menu" ? "Menu" : "Category"}
          </Text>
          <Text className="text-3xl font-bold text-white">{item.name}</Text>
        </View>
        <TouchableOpacity
          onPress={handleEdit}
          className="p-3 bg-[#212121] rounded border border-gray-600"
        >
          <Settings size={24} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <View className="mt-4 space-y-2">
        {item.schedules?.map((schedule: Schedule, index: number) => (
          <View
            key={index}
            className="p-3 bg-[#212121] rounded-md border border-gray-600"
          >
            <Text className="text-lg font-semibold text-gray-300">
              {formatDays(schedule.days)}: {schedule.startTime} -{" "}
              {schedule.endTime}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};
