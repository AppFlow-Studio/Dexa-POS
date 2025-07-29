import { MenuItemType } from "@/lib/types";
import { Plus, Utensils } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

interface MenuItemProps {
  item: MenuItemType;
  isSelected: boolean;
  onPress: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ item, isSelected, onPress }) => {
  const cardStyle = isSelected
    ? "bg-white border-2 border-blue-500"
    : "bg-white border border-gray-200";

  return (
    <TouchableOpacity
      onPress={onPress}
      className={`w-[32%] p-4 rounded-2xl mb-3 ${cardStyle}`}
    >
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          className="w-full h-24 rounded-lg"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full h-24 rounded-lg bg-gray-100 items-center justify-center">
          <Utensils color="#9ca3af" size={32} />
        </View>
      )}
      <Text className="text-base font-bold text-gray-800 mt-3">
        {item.name}
      </Text>
      <View className="flex-row items-baseline mt-1">
        <Text className="text-base font-semibold text-gray-700">
          ${item.price.toFixed(2)}
        </Text>
        {item.cashPrice && (
          <Text className="text-xs text-gray-400 ml-2">
            Cash Price: ${item.cashPrice.toFixed(2)}
          </Text>
        )}
      </View>

      <View
        className={`w-full mt-4 py-3 rounded-lg items-center justify-center ${
          isSelected ? "bg-gray-100" : "bg-blue-50"
        }`}
      >
        {isSelected ? (
          <Text className="font-bold text-gray-500">Selected</Text>
        ) : (
          <View className="flex-row items-center">
            <Plus color="#3b82f6" size={16} strokeWidth={3} />
            <Text className="text-blue-600 font-bold ml-1.5">Add to Cart</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default MenuItem;
