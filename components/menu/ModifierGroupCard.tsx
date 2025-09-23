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
    <View className="bg-[#303030] rounded-lg border border-gray-700 p-6 mb-4">
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-3">
          <Text className="text-3xl font-semibold text-white">
            {modifierGroup.name}
          </Text>
          <View
            className={`px-4 py-2 rounded-full ${
              modifierGroup.type === "required"
                ? "bg-red-900/30 border border-red-500"
                : "bg-blue-900/30 border border-blue-500"
            }`}
          >
            <Text
              className={`text-xl font-medium ${
                modifierGroup.type === "required"
                  ? "text-red-400"
                  : "text-blue-400"
              }`}
            >
              {modifierGroup.type === "required" ? "Required" : "Optional"}
            </Text>
          </View>
          <View className="bg-gray-600/30 border border-gray-500 px-4 py-2 rounded-full">
            <Text className="text-xl text-gray-300">
              {modifierGroup.selectionType === "single" ? "Single" : "Multiple"}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          {/* This button now calls the onEdit prop */}
          <TouchableOpacity
            onPress={onEdit}
            className="p-3 bg-[#212121] rounded border border-gray-600"
          >
            <Settings size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
