import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScheduleTemplate } from "@/lib/types";
import { differenceInDays } from "date-fns";
import { Check, Copy, MoreVertical, Pencil, Trash2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface TemplateListItemProps {
  template: ScheduleTemplate;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

const tagColors: Record<string, string> = {
  weekday: "bg-blue-500/20 text-blue-400",
  weekend: "bg-purple-500/20 text-purple-400",
  holiday: "bg-orange-500/20 text-orange-400",
  peak: "bg-green-500/20 text-green-400",
  slow: "bg-gray-500/20 text-gray-400",
  morning: "bg-yellow-500/20 text-yellow-400",
  evening: "bg-indigo-500/20 text-indigo-400",
};

const TemplateListItem: React.FC<TemplateListItemProps> = ({
  template,
  onEdit,
  onDelete,
  onDuplicate,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
}) => {
  const daysAgo = differenceInDays(
    new Date(),
    new Date(template.lastUsed || Date.now())
  );

  const handlePress = () => {
    if (isSelectionMode && onSelect) {
      onSelect(template.id);
    } else {
      onEdit(template.id);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      className={`relative bg-[#2a2a2a] rounded-xl p-6 border-2 transition-all ${
        isSelected ? "border-blue-600" : "border-gray-700"
      }`}
    >
      {isSelectionMode && (
        <View className="absolute top-4 right-4 z-10">
          <View
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${
              isSelected
                ? "bg-blue-600 border-blue-600"
                : "border-gray-500 bg-[#1a1a1a]"
            }`}
          >
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </View>
        </View>
      )}

      {isSelected && (
        <View className="absolute top-6 right-12">
          <Text className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
            Active
          </Text>
        </View>
      )}

      <View className="flex-row items-start justify-between mb-3">
        <Text
          className="text-lg font-bold text-white pr-12 w-4/5"
          numberOfLines={1}
        >
          {template.name}
        </Text>
        {!isSelectionMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity
                onPress={(e) => e.stopPropagation()}
                className="p-2 -mt-2 -mr-2"
              >
                <MoreVertical size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-[#2a2a2a] border-[#e5e5e5] rounded-lg">
              <DropdownMenuItem onPress={() => onEdit(template.id)}>
                <Pencil className="mr-2 h-4 w-4" color="#9CA3AF" />
                <Text className="text-white">Edit Template</Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={() => onDuplicate(template.id)}>
                <Copy className="mr-2 h-4 w-4" color="#9CA3AF" />
                <Text className="text-white">Duplicate</Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={() => onDelete(template.id)}>
                <Trash2 className="mr-2 h-4 w-4" color="#F87171" />
                <Text className="text-red-400">Delete</Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </View>

      <Text className="text-zinc-400 text-sm mb-4 h-10" numberOfLines={2}>
        {template.description}
      </Text>

      <View className="flex-row flex-wrap gap-2 mb-4">
        {template.tags.map((tag) => (
          <View
            key={tag}
            className={`px-2 py-1 rounded-full ${tagColors[tag] || "bg-gray-500/20"}`}
          >
            <Text
              className={`text-xs font-medium ${tagColors[tag] ? tagColors[tag].split(" ")[1] : "text-gray-400"}`}
            >
              {tag}
            </Text>
          </View>
        ))}
      </View>

      <View className="flex-row items-center justify-between text-sm">
        <Text className="bg-[#1f2937] text-white px-3 py-1 rounded-md text-xs">
          {template.shifts.length} shifts
        </Text>
        <Text className="text-[#9ca3af] text-xs">
          Used {daysAgo} {daysAgo === 1 ? "day" : "days"} ago
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default TemplateListItem;
