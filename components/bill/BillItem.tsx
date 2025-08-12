import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CartItem } from "@/lib/types";
import { Pencil } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

interface BillItemProps {
  item: CartItem;
}

const BillItem: React.FC<BillItemProps> = ({ item }) => {
  const imageSource = item.image
    ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
    : undefined;
  const finalPrice = item.appliedDiscount
    ? item.originalPrice * (1 - item.appliedDiscount.value)
    : item.originalPrice;

  return (
    <View className="flex-row items-center mb-4">
      <Image
        source={imageSource}
        className="w-12 h-12 rounded-lg"
        resizeMode="contain"
      />
      <View className="flex-1 ml-3">
        <Text className="font-semibold text-base text-accent-500">
          {item.name}
        </Text>
        <View className="flex-row items-center mt-1">
          <Text className="text-sm text-accent-500">x {item.quantity}</Text>
          {item.appliedDiscount && (
            <View className="flex-row items-baseline mt-1 gap-2">
              <Text className="text-base font-bold text-green-600">
                ${finalPrice.toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-400 line-through">
                ${item.originalPrice.toFixed(2)}
              </Text>
              <Text className="text-sm font-semibold text-green-600">
                -{item.appliedDiscount.value * 100}%
              </Text>
            </View>
          )}
          <TouchableOpacity className="flex-row items-center ml-3 px-2 py-0.5 bg-[#659AF033] rounded-3xl">
            <Text className="text-xs font-semibold text-primary-400 mr-1">
              Notes
            </Text>
            <Pencil color="#2563eb" size={10} />
          </TouchableOpacity>
        </View>
      </View>
      <Text className="font-semibold text-base text-accent-300">
        ${(finalPrice * item.quantity).toFixed(2)}
      </Text>
    </View>
  );
};

export default BillItem;
