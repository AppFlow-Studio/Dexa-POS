import { useToast } from "@/contexts/ToastContext";
import { MenuItemType } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { Plus } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SearchResultItemProps {
  item: MenuItemType;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ item }) => {
  const openDialog = useCustomizationStore((state) => state.openToAdd);
  const closeSearchSheet = useSearchStore((state) => state.closeSearch);
  const { activeOrderId, orders, addItemToActiveOrder, ordersById } = useOrderStore();
  const { openFullscreen } = useModifierSidebarStore();
  const { show } = useToast();

  const activeOrder = ordersById[activeOrderId ?? ""];
  const { openToAdd } = useModifierSidebarStore();

  const handleAddToCart = () => {
    // 2. Add validation check before opening the dialog
    if (!activeOrder?.order_type) {
      show({
        title: "Order Type Required",
        message:
          "Please select an order type (e.g., Dine-In) before adding items.",
        type: "warning",
      });
      return; // Stop execution
    }

    openFullscreen(item, activeOrderId);
    closeSearchSheet();
  };

  return (
    <View className="flex-row justify-between items-center py-3 border-b border-gray-100">
      <View>
        <Text className="text-xl font-bold text-gray-800">{item.name}</Text>
        <View className="flex-row items-baseline mt-1">
          <Text className="text-xl font-semibold text-accent-500">
            ${item.price.toFixed(2)}
          </Text>
          {item.cashPrice && (
            <Text className="text-lg text-accent-500 ml-2">
              Cash Price: ${item.cashPrice.toFixed(2)}
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        className="flex-row items-center py-2 px-4 border border-background-500 rounded-xl"
        onPress={handleAddToCart}
      >
        <Plus color="#374151" size={20} strokeWidth={3} />
        <Text className="font-bold text-gray-700 ml-1.5 text-base">
          Add to Cart
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default SearchResultItem;
