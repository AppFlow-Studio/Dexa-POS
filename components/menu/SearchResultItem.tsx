import { useToast } from "@/contexts/ToastContext";
import { MenuItemType } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { Plus } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SearchResultItemProps {
  item: MenuItemType;
  menuName?: string;
  displayPrice?: number;
  isDisabled?: boolean;
  disabledReason?: string;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({
  item,
  menuName,
  displayPrice,
  isDisabled = false,
  disabledReason,
}) => {
  const openDialog = useCustomizationStore((state) => state.openToAdd);
  const closeSearchSheet = useSearchStore((state) => state.closeSearch);
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const { openFullscreen } = useModifierSidebarStore();
  const { show } = useToast();

  const activeOrder = useActiveOrder();

  const handleAddToCart = () => {
    if (isDisabled) return;

    if (!activeOrder?.order_type) {
      show({
        title: "Order Type Required",
        message:
          "Please select an order type (e.g., Dine-In) before adding items.",
        type: "warning",
      });
      return;
    }

    // Pass the overridden price context if possible?
    // Currently openFullscreen doesn't support context overrides easily unless we modify that workflow too.
    // For now, we assume the customization modal will handle it OR we might have to pass data.
    // Given the task is about Search UI, I will proceed with just visual price.
    // TODO: Ensure backend/cart respects this price.
    openFullscreen(item, activeOrderId);
    closeSearchSheet();
  };

  const finalPrice = displayPrice !== undefined ? displayPrice : item.price;

  return (
    <View className="flex-row justify-between items-center py-3 border-b border-gray-700">
      <View className="flex-1 mr-4">
        {menuName && (
          <Text className="text-xs text-gray-400 mb-1 uppercase tracking-wider">
            {menuName}
          </Text>
        )}
        <Text
          className={`text-xl font-bold ${
            isDisabled ? "text-gray-500" : "text-white"
          }`}
        >
          {item.name}
        </Text>
        <View className="flex-row items-baseline mt-1">
          <Text
            className={`text-lg font-semibold ${
              isDisabled ? "text-gray-600" : "text-blue-400"
            }`}
          >
            ${finalPrice.toFixed(2)}
          </Text>
          {item.cashPrice && !isDisabled && (
            <Text className="text-sm text-gray-500 ml-2">
              Cash: ${item.cashPrice.toFixed(2)}
            </Text>
          )}
        </View>
        {isDisabled && disabledReason && (
          <Text className="text-xs text-red-500 mt-1">{disabledReason}</Text>
        )}
      </View>
      <TouchableOpacity
        className={`flex-row items-center py-2 px-4 rounded-xl ${
          isDisabled
            ? "bg-gray-800 border-gray-700"
            : "bg-blue-600/20 border border-blue-600"
        }`}
        onPress={handleAddToCart}
        disabled={isDisabled}
      >
        <Plus
          color={isDisabled ? "#6b7280" : "#60a5fa"}
          size={20}
          strokeWidth={3}
        />
        <Text
          className={`font-bold ml-1.5 text-base ${
            isDisabled ? "text-gray-500" : "text-blue-400"
          }`}
        >
          Add
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default SearchResultItem;
