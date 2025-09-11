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
}

const MenuItem: React.FC<MenuItemProps> = ({ item, imageSource, onOrderClosedCheck }) => {
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

    openFullscreen(item, activeOrderId);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      className="w-[32%] rounded-[20px] mb-3 bg-[#303030] border border-gray-600"
    >
      <View className="flex-col items-center gap-2 overflow-hidden rounded-lg">
        {imageSource ? (
          <Image
            source={imageSource}
            className="w-full h-40 object-cover rounded-lg "
          />
        ) : (
          <View className="w-full h-40 rounded-xl  items-center justify-center ">
            <Utensils color="#9ca3af" size={32} />
          </View>
        )}
        <View className="w-full px-3 pb-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-white mt-3 flex-1">
              {item.name}
            </Text>
            {item.modifiers && item.modifiers.length > 0 && (
              <Settings color="#60A5FA" size={16} className="ml-2" />
            )}
          </View>
          <View className="flex-row items-baseline mt-1">
            <Text className="text-base font-semibold text-white">
              ${item.price.toFixed(2)}
            </Text>
            {item.cashPrice && (
              <Text className="text-xs text-gray-300 ml-2">
                Cash Price: ${item.cashPrice.toFixed(2)}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Action buttons
      <TouchableOpacity
        onPress={handlePress}
        className="w-full mt-4 py-3 rounded-xl items-center justify-center bg-primary-100"
      >
        <View className="flex-row items-center">
          <Plus color="#3D72C2" size={16} strokeWidth={3} />
          <Text className="text-primary-500 font-bold ml-1.5">Add to Cart</Text>
        </View>
      </TouchableOpacity> */}
    </TouchableOpacity>
  );
};

export default MenuItem;
