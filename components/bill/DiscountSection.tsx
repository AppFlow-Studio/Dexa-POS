import { useOrderStore } from "@/stores/useOrderStore";
import { Tag, X } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface DiscountSectionProps {
  onOpenDiscounts: () => void;
}

const DiscountSection: React.FC<DiscountSectionProps> = ({
  onOpenDiscounts,
}) => {
  const { activeOrderId, orders, removeCheckDiscount } = useOrderStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const appliedDiscount = activeOrder?.checkDiscount;

  const handleRemoveDiscount = () => {
    if (activeOrderId) {
      removeCheckDiscount(activeOrderId);
    }
  };

  return (
    <View className="bg-[#212121]">
      {appliedDiscount ? (
        // If a discount IS applied, show the discount label and a remove button
        <View
          className="flex-row items-center justify-between p-1.5 pl-3 bg-blue-900/30 border border-blue-500 rounded-xl gap-2"
          style={{ elevation: 2, height: 44 }}
        >
          <View className="flex-row items-center">
            <Text className="text-base font-bold text-blue-400">
              {appliedDiscount.label}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleRemoveDiscount}
            className="p-1.5 bg-blue-600/30 rounded-full"
          >
            <X color="#60A5FA" size={20} />
          </TouchableOpacity>
        </View>
      ) : (
        // If NO discount is applied, show the button to open the discount overlay
        <TouchableOpacity
          onPress={onOpenDiscounts}
          className="flex-row items-center"
          style={{ elevation: 2, height: 44 }}
        >
          <View className="bg-[#303030] border border-gray-600 rounded-xl flex-row py-1 px-2 items-center">
            <View className="p-1.5 rounded-md mr-1.5">
              <Tag color="#9CA3AF" size={20} />
            </View>
            <Text className="font-bold text-base text-gray-300">Discounts</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default DiscountSection;
