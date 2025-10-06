import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import { Plus, Search } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface MenuHeaderProps {
  title: string;
  onAddPress: () => void;
  addButtonLabel: string;
}

const MenuHeader: React.FC<MenuHeaderProps> = ({
  title,
  onAddPress,
  addButtonLabel,
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
          onPress={onAddPress}
          className="flex-row items-center bg-blue-600 px-4 py-3 rounded-lg"
        >
          <Plus size={20} color="white" />
          <Text className="text-base text-white font-bold ml-2">
            {addButtonLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MenuHeader;
