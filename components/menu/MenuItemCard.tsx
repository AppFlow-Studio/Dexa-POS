import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import { Eye, EyeOff, Settings, Trash2, Utensils } from "lucide-react-native";
import React from "react";
import {
  Image,
  ImageSourcePropType,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Helper function for resolving image sources
const getImageSource = (
  image: string | undefined
): ImageSourcePropType | undefined => {
  if (image && image.length > 200) {
    return { uri: `data:image/jpeg;base64,${image}` };
  }
  if (image && MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP]) {
    return MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP];
  }
  return undefined;
};

interface MenuItemCardProps {
  item: MenuItemType;
  onEdit: (item: MenuItemType) => void;
  onDelete: (id: string) => void;
  onToggleAvailability: (id: string) => void;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  onEdit,
  onDelete,
  onToggleAvailability,
}) => {
  const imageSource = getImageSource(item.image);
  const isAvailable = item.availability !== false;

  return (
    // Main container is now a row
    <View className="bg-[#303030] rounded-lg border border-gray-700 p-4 w-full flex-row items-center">
      {/* Image Section */}
      <View className="w-24 h-24 rounded-lg border border-gray-600 overflow-hidden">
        {imageSource ? (
          <Image
            source={imageSource}
            className="w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-full bg-gray-700 items-center justify-center">
            <Utensils color="#9ca3af" size={32} />
          </View>
        )}
      </View>

      {/* Info Section (Takes remaining space) */}
      <View className="flex-1 ml-4">
        <Text className="text-2xl font-semibold text-white" numberOfLines={1}>
          {item.name}
        </Text>
        <Text className="text-xl text-gray-400 mt-1">
          ${item.price.toFixed(2)}
        </Text>
        <View
          className={`px-3 py-1 mt-2 rounded-full self-start ${
            isAvailable
              ? "bg-green-900/30 border border-green-500"
              : "bg-red-900/30 border-red-500"
          }`}
        >
          <Text
            className={`text-base font-medium ${
              isAvailable ? "text-green-400" : "text-red-400"
            }`}
          >
            {isAvailable ? "Available" : "Unavailable"}
          </Text>
        </View>
      </View>

      {/* Actions Section */}
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => onToggleAvailability(item.id)}
          className="p-3"
        >
          {isAvailable ? (
            <EyeOff size={24} color="#9CA3AF" />
          ) : (
            <Eye size={24} color="#9CA3AF" />
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onEdit(item)} className="p-3">
          <Settings size={24} color="#9CA3AF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(item.id)} className="p-3">
          <Trash2 size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
};
