import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CartItem } from "@/stores/useCartStore";
import React from "react";
import { Image, Text, View } from "react-native";

const OrderDetailItem: React.FC<{ item: CartItem }> = ({ item }) => {
  const imageSource = item.image
    ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
    : undefined;

  return (
    <View className="flex-row items-start p-4 border border-gray-200 rounded-xl bg-white">
      {/* Image and Name */}
      <View className="flex-row items-center w-1/4">
        <Image source={imageSource} className="w-12 h-12 rounded-lg" />
        <View className="ml-3">
          <Text className="font-bold text-gray-800">{item.name}</Text>
          <Text className="text-sm text-gray-500">
            Size: {item.customizations.size?.name || "Regular"}
          </Text>
        </View>
      </View>
      {/* Price */}
      <View className="w-[12.5%]">
        <Text className="font-semibold text-gray-700">
          ${item.originalPrice.toFixed(2)}
        </Text>
      </View>
      {/* Qty */}
      <View className="w-[12.5%]">
        <Text className="font-semibold text-gray-700">x{item.quantity}</Text>
      </View>
      {/* Modifiers */}
      <View className="w-1/4">
        <Text className="font-semibold text-gray-700">
          {item.customizations.addOns
            ?.map((a) => `${a.name} + $${a.price.toFixed(2)}`)
            .join(", ") || "None"}
        </Text>
      </View>
      {/* Notes */}
      <View className="w-1/4">
        <Text className="text-gray-600">
          {item.customizations.notes || "No notes"}
        </Text>
      </View>
      {/* Total */}
      <View className="w-[12.5%] items-end">
        <Text className="font-bold text-gray-800">
          ${(item.finalPrice * item.quantity).toFixed(2)}
        </Text>
      </View>
    </View>
  );
};

export default OrderDetailItem;
