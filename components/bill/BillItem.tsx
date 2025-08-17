import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CartItem } from "@/lib/types";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { Pencil, Utensils } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

interface BillItemProps {
  item: CartItem;
  tableId?: string;
}

const BillItem: React.FC<BillItemProps> = ({ item, tableId }) => {
  const { activeTableId } = usePaymentStore();
  const openDialogToEdit = useCustomizationStore((state) => state.openToEdit);

  const imageSource = item.image
    ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
    : undefined;

  // Use the final price stored in the cart item
  const singleItemPrice = item.price;

  const finalPriceAfterDiscount = item.appliedDiscount
    ? singleItemPrice * (1 - item.appliedDiscount.value)
    : singleItemPrice;

  return (
    <View className="flex-row items-center mb-4">
      {imageSource ? (
        <Image
          source={imageSource}
          className="w-12 h-12 rounded-lg"
          resizeMode="cover"
        />
      ) : (
        <View className="w-12 h-12 rounded-lg bg-gray-100 items-center justify-center">
          <Utensils color="#9ca3af" size={20} />
        </View>
      )}

      <View className="flex-1 ml-3">
        <Text className="font-semibold text-base text-accent-500">
          {item.name}
        </Text>
        <View className="flex-row items-center mt-1">
          <Text className="text-sm text-accent-500">x {item.quantity}</Text>

          {/* Discount Display */}
          {item.appliedDiscount && (
            <View className="flex-row items-baseline ml-3 gap-2">
              <Text className="text-base font-bold text-green-600">
                ${finalPriceAfterDiscount.toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-400 line-through">
                ${singleItemPrice.toFixed(2)}
              </Text>
            </View>
          )}
          <TouchableOpacity
            className="flex-row items-center ml-3 px-2 py-0.5 bg-[#659AF033] rounded-3xl"
            onPress={() => openDialogToEdit(item, activeTableId || undefined)}
          >
            <Text className="text-xs font-semibold text-primary-400 mr-1">
              Notes
            </Text>
            <Pencil color="#2563eb" size={10} />
          </TouchableOpacity>
        </View>
      </View>
      <Text className="font-semibold text-base text-accent-300">
        ${(finalPriceAfterDiscount * item.quantity).toFixed(2)}
      </Text>
    </View>
  );
};

export default BillItem;
