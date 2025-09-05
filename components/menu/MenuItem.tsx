import { MenuItemType } from "@/lib/types";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Plus, Settings } from "lucide-react-native";
import React from "react";
import {
  ImageSourcePropType,
  Text,
  TouchableOpacity,
  View
} from "react-native";

interface MenuItemProps {
  item: MenuItemType;
  imageSource?: ImageSourcePropType;
  onOrderClosedCheck?: () => boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ item, imageSource, onOrderClosedCheck }) => {
  const { activeOrderId, orders, addItemToActiveOrder } = useOrderStore();
  const { openFullscreen } = useModifierSidebarStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // Menu items always add new items, not edit existing ones

  const handlePress = () => {
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

    openFullscreen(item, activeOrderId);
  };


  return (
    <TouchableOpacity
      onPress={handlePress}
      className={`w-[32%] p-4 rounded-[20px] mb-3 ${item.cardBgColor} border border-[#F5F5F5]`}
    >
      <View className="flex-row items-center gap-2">
        {/* {imageSource ? (
          <Image
            source={imageSource}
            className="w-1/3 h-12 rounded-lg"
            resizeMode="contain"
          />
        ) : (
          <View className="w-full h-24 rounded-lg bg-gray-100 items-center justify-center">
            <Utensils color="#9ca3af" size={32} />
          </View>
        )} */}
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-accent-500 mt-3 flex-1">
              {item.name}
            </Text>
            {item.modifiers && item.modifiers.length > 0 && (
              <Settings color="#3b82f6" size={16} className="ml-2" />
            )}
          </View>
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

      {/* Action buttons */}
      <TouchableOpacity
        onPress={handlePress}
        className="w-full mt-4 py-3 rounded-xl items-center justify-center bg-primary-100"
      >
        <View className="flex-row items-center">
          <Plus color="#3D72C2" size={16} strokeWidth={3} />
          <Text className="text-primary-500 font-bold ml-1.5">Add to Cart</Text>
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

export default MenuItem;
