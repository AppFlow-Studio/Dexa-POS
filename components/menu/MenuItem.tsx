import { MenuItemType } from "@/lib/types";
import { Plus, Utensils } from "lucide-react-native";
import React from "react";
import {
  Image,
  ImageSourcePropType,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface MenuItemProps {
  item: MenuItemType;
  onAddToCart: () => void; // Changed from onpress to be more specific
  imageSource?: ImageSourcePropType;
}

const MenuItem: React.FC<MenuItemProps> = ({
  item,
  onAddToCart,
  imageSource,
}) => {
  return (
    <TouchableOpacity
      onPress={onAddToCart}
      className="w-[32%] p-4 rounded-[20px] mb-3 bg-white border border-[#F5F5F5]"
    >
      <View className="flex-row items-center gap-2">
        {imageSource ? (
          <Image
            source={imageSource}
            className="w-1/3 h-12 rounded-lg"
            resizeMode="contain"
          />
        ) : (
          <View className="w-full h-24 rounded-lg bg-gray-100 items-center justify-center">
            <Utensils color="#9ca3af" size={32} />
          </View>
        )}
        <View>
          <Text className="text-base font-bold text-accent-500 mt-3">
            {item.name}
          </Text>
          <View className="flex-row items-baseline mt-1">
            <Text className="text-base font-semibold text-accent-500">
              ${item.price.toFixed(2)}
            </Text>
            {item.cashPrice && (
              <Text className="text-xs text-accent-500 ml-2">
                Cash Price: ${item.cashPrice.toFixed(2)}
              </Text>
            )}
          </View>
        </View>
      </View>
      <View className="w-full mt-4 py-3 rounded-xl items-center justify-center bg-primary-100">
        <View className="flex-row items-center">
          <Plus color="#3D72C2" size={16} strokeWidth={3} />
          <Text className="text-primary-500 font-bold ml-1.5">Add to Cart</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default MenuItem;
