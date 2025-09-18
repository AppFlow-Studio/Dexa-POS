import { MenuItemType } from "@/lib/types";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Settings, Utensils } from "lucide-react-native";
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
  imageSource?: ImageSourcePropType;
  onOrderClosedCheck?: () => boolean;
  categoryId?: string;
  getItemPriceForCategory?: (itemId: string, categoryId: string) => number;
}

const MenuItem: React.FC<MenuItemProps> = ({
  item,
  imageSource,
  onOrderClosedCheck,
  categoryId,
  getItemPriceForCategory,
}) => {
  const { activeOrderId, orders, addItemToActiveOrder } = useOrderStore();
  const { openFullscreen } = useModifierSidebarStore();
  const { openToAdd } = useCustomizationStore();
  const { status: clockStatus, showClockInWall } = useTimeclockStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // Menu items always add new items, not edit existing ones

  const handlePress = () => {
    if (clockStatus !== "clockedIn") {
      showClockInWall(); // Show the modal
      return; // Stop execution
    }

    // Check if order is closed first
    if (onOrderClosedCheck && onOrderClosedCheck()) {
      return; // Stop execution if order is closed
    }

    // 2. Add validation check before opening the dialog
    if (!activeOrder?.order_type) {
      toast.error("Please select an Order Type", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return; // Stop execution
    }

    openFullscreen(item, activeOrderId, categoryId);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      className="w-[23%] rounded-[20px] mb-4 bg-[#303030] border border-gray-600"
    >
      <View className="flex-col items-center gap-3 overflow-hidden rounded-lg">
        {imageSource ? (
          <Image
            source={imageSource}
            className="w-full h-48 object-cover rounded-lg "
          />
        ) : (
          <View className="w-full h-48 rounded-xl  items-center justify-center ">
            <Utensils color="#9ca3af" size={48} />
          </View>
        )}
        <View className="h-[1px] bg-blue-400 self-center w-[90%]" />
        <View className="w-full px-4 pb-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-white mt-3 flex-1">
              {item.name}
            </Text>
            {item.modifiers && item.modifiers.length > 0 && (
              <Settings color="#60A5FA" size={24} className="ml-2" />
            )}
          </View>
          <View className="flex-row items-baseline mt-1">
            {(() => {
              // Get the correct price for this category
              const displayPrice =
                categoryId && getItemPriceForCategory
                  ? getItemPriceForCategory(item.id, categoryId)
                  : item.price;

              const hasCustomPricing =
                categoryId &&
                getItemPriceForCategory &&
                getItemPriceForCategory(item.id, categoryId) !== item.price;

              return (
                <>
                  <Text
                    className={`text-2xl font-semibold ${hasCustomPricing ? "text-yellow-400" : "text-white"}`}
                  >
                    ${displayPrice.toFixed(2)}
                  </Text>
                  {hasCustomPricing && (
                    <Text className="text-xl text-gray-500 ml-2 line-through">
                      ${item.price.toFixed(2)}
                    </Text>
                  )}
                  {item.cashPrice && (
                    <Text className="text-xl text-gray-300 ml-2">
                      Cash Price: ${item.cashPrice.toFixed(2)}
                    </Text>
                  )}
                </>
              );
            })()}
          </View>

          {/* Stock Status Display */}
          <View className="mt-2">
            {(() => {
              // Determine stock status based on item properties
              if (item.stockQuantity !== undefined && item.stockQuantity > 0) {
                return (
                  <View className="flex-row items-center">
                    <View className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                    <Text className="text-green-400 text-sm font-medium">
                      {item.stockQuantity} in stock
                    </Text>
                  </View>
                );
              } else if (item.availability === false) {
                return (
                  <View className="flex-row items-center">
                    <View className="w-2 h-2 bg-red-500 rounded-full mr-2" />
                    <Text className="text-red-400 text-sm font-medium">
                      Out of Stock
                    </Text>
                  </View>
                );
              } else {
                // Default to "In Stock" for items without specific stock tracking
                return (
                  <View className="flex-row items-center">
                    <View className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                    <Text className="text-green-400 text-sm font-medium">
                      In Stock
                    </Text>
                  </View>
                );
              }
            })()}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default MenuItem;
