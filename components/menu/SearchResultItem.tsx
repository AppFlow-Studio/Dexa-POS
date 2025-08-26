import { MenuItemType } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Plus } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SearchResultItemProps {
  item: MenuItemType;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ item }) => {
  const openDialog = useCustomizationStore((state) => state.openToAdd);
  const closeSearchSheet = useSearchStore((state) => state.closeSearch);
  const { activeTableId } = usePaymentStore();
  const { orders, activeOrderId } = useOrderStore();

  const handleAddToCart = () => {
    // Check if the active order is closed
    const activeOrder = orders.find((o) => o.id === activeOrderId);
    if (activeOrder?.order_status === "Closed") {
      // Show a toast warning instead of opening dialog
      toast.error("Order is closed. Please reopen the check to add items.", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      closeSearchSheet();
      return;
    }

    openDialog(item, activeTableId || undefined);
    closeSearchSheet();
  };

  return (
    <View className="flex-row justify-between items-center py-4 border-b border-gray-100">
      <View>
        <Text className="text-base font-bold text-gray-800">{item.name}</Text>
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
      <TouchableOpacity
        className="flex-row items-center py-2 px-4 border border-background-500 rounded-xl"
        onPress={handleAddToCart}
      >
        <Plus color="#374151" size={16} strokeWidth={3} />
        <Text className="font-bold text-gray-700 ml-1.5">Add to Cart</Text>
      </TouchableOpacity>
    </View>
  );
};

export default SearchResultItem;
