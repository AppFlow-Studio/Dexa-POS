import { ExtendedModifierGroup } from "@/lib/types";
import { Settings } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ModifierGroupCardProps {
  modifierGroup: ExtendedModifierGroup;
  onEdit: () => void;
}

export const ModifierGroupCard: React.FC<ModifierGroupCardProps> = ({
  modifierGroup,
  onEdit,
}) => {
  return (
    <View className="bg-[#303030] rounded-lg border border-gray-700 p-4 mb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-xl font-semibold text-white">
            {modifierGroup.name}
          </Text>
          <View
            className={`px-2.5 py-1 rounded-full ${
              modifierGroup.type === "required"
                ? "bg-red-900/30 border border-red-500"
                : "bg-blue-900/30 border border-blue-500"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                modifierGroup.type === "required"
                  ? "text-red-400"
                  : "text-blue-400"
              }`}
            >
              {modifierGroup.type === "required" ? "Required" : "Optional"}
            </Text>
          </View>
          <View className="bg-gray-600/30 border border-gray-500 px-2.5 py-1 rounded-full">
            <Text className="text-sm text-gray-300">
              {modifierGroup.selectionType === "single" ? "Single" : "Multiple"}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={onEdit}
            className="p-2 bg-[#212121] rounded border border-gray-600"
          >
            <Settings size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
