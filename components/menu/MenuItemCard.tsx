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
    <View className="bg-[#303030] rounded-lg border border-gray-700 p-3 w-full flex-row items-center">
      {/* Image Section - smaller image */}
      <View className="w-16 h-16 rounded-md border border-gray-600 overflow-hidden">
        {imageSource ? (
          <Image
            source={imageSource}
            className="w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-full bg-gray-700 items-center justify-center">
            <Utensils color="#9ca3af" size={24} />
          </View>
        )}
      </View>

      {/* Info Section - reduced margins and font sizes */}
      <View className="flex-1 ml-3">
        <Text className="text-lg font-semibold text-white" numberOfLines={1}>
          {item.name}
        </Text>
        <Text className="text-base text-gray-400">
          ${item.price.toFixed(2)}
        </Text>
        <View
          className={`px-2 py-0.5 mt-1.5 rounded-full self-start ${
            isAvailable ? "bg-green-900/30" : "bg-red-900/30"
          }`}
        >
          <Text
            className={`text-xs font-medium ${
              isAvailable ? "text-green-400" : "text-red-400"
            }`}
          >
            {isAvailable ? "Available" : "Unavailable"}
          </Text>
        </View>
      </View>

      {/* Actions Section - smaller icons and less padding */}
      <View className="flex-row items-center gap-0">
        <TouchableOpacity
          onPress={() => onToggleAvailability(item.id)}
          className="p-2"
        >
          {isAvailable ? (
            <EyeOff size={20} color="#9CA3AF" />
          ) : (
            <Eye size={20} color="#9CA3AF" />
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onEdit(item)} className="p-2">
          <Settings size={20} color="#9CA3AF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(item.id)} className="p-2">
          <Trash2 size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
};
