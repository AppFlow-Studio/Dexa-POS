import { colors } from "@/lib/theme";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

type SortBy = "date" | "total" | "status";
type SortOrder = "asc" | "desc";

interface SortControlsProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortByChange: (sortBy: SortBy) => void;
  onSortOrderChange: (sortOrder: SortOrder) => void;
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "total", label: "Amount" },
  { value: "status", label: "Status" },
];

export default function SortControls({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: SortControlsProps) {
  const toggleSortOrder = () => {
    onSortOrderChange(sortOrder === "asc" ? "desc" : "asc");
  };

  return (
    <View className="flex-row items-center gap-2">
      {/* Sort By Pills */}
      {SORT_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onSortByChange(opt.value)}
          className={`px-4 py-2 rounded-lg ${
            sortBy === opt.value
              ? "bg-blue-600"
              : "bg-panel"
          }`}
        >
          <Text className="text-white text-base">{opt.label}</Text>
        </TouchableOpacity>
      ))}

      {/* Sort Order Toggle */}
      <TouchableOpacity
        onPress={toggleSortOrder}
        className="px-3 py-2 bg-panel rounded-lg"
      >
        {sortOrder === "asc" ? (
          <ArrowUp size={20} color={colors.label} />
        ) : (
          <ArrowDown size={20} color={colors.label} />
        )}
      </TouchableOpacity>
    </View>
  );
}
