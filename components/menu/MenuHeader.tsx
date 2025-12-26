import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import { Plus, Search } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface MenuHeaderProps {
  title: string;
  onAddPress: () => void;
  addButtonLabel: string;
  disabled?: boolean; // New prop to disable the Add button
}

const MenuHeader: React.FC<MenuHeaderProps> = ({
  title,
  onAddPress,
  addButtonLabel,
  disabled = false,
}) => {
  // Get the action to open the search bottom sheet from the store
  const { openSearch } = useMenuManagementSearchStore();

  return (
    <View className="flex-row items-center justify-between bg-[#212121] mb-4">
      <Text className="text-2xl font-bold text-white">{title}</Text>
      <View className="flex-row items-center gap-x-3">
        <TouchableOpacity
          onPress={openSearch} // This now opens the bottom sheet
          className="p-3 bg-[#303030] border border-gray-600 rounded-lg"
        >
          <Search color="#9CA3AF" size={20} />
        </TouchableOpacity>

        {/* Add Button */}
        <TouchableOpacity
          onPress={disabled ? undefined : onAddPress}
          disabled={disabled}
          className={`flex-row items-center px-4 py-3 rounded-lg ${
            disabled ? "bg-gray-600 opacity-50" : "bg-blue-600"
          }`}
        >
          <Plus size={20} color={disabled ? "#9CA3AF" : "white"} />
          <Text
            className={`text-base font-bold ml-2 ${
              disabled ? "text-gray-400" : "text-white"
            }`}
          >
            {addButtonLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MenuHeader;
