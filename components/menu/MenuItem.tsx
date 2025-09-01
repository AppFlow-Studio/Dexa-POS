import { MenuItemType } from "@/lib/types";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Plus, Utensils } from "lucide-react-native";
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

const MenuItem: React.FC<MenuItemProps> = ({
  item,
  imageSource,
  onOrderClosedCheck,
}) => {
  const { activeOrderId, orders } = useOrderStore();
  const { openToAdd } = useCustomizationStore();
  const { status: clockStatus, showClockInWall } = useTimeclockStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // Check if an item with this `menuItemId` is already in the active cart
  const itemInCart = activeOrder?.items.find(
    (cartItem) => cartItem.menuItemId === item.id
  );
  const isSelected = !!itemInCart;

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

    openToAdd(item, activeOrderId);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      className={`w-[32%] p-4 rounded-[20px] mb-3 bg-white  ${
        isSelected
          ? " border-b-primary-400 border-b-4 "
          : "border border-[#F5F5F5]"
      }`}
    >
      <View className="flex-row items-center gap-2">
        {imageSource ? (
          <Image
            source={imageSource}
            className="w-1/3 h-12 rounded-lg"
            resizeMode="contain"
          />
        ) : (
          <View className="w-full h-24 rounded-lg bg-gray-100 items-center justify-center">
            <Utensils color="#9ca3af" size={32} />
          </View>
        )}
        <View>
          <Text className="text-base font-bold text-accent-500 mt-3">
            {item.name}
          </Text>
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

      {/* The "Add to Cart" / "Selected" button now renders conditionally */}
      <View
        className={`w-full mt-4 py-3 rounded-xl items-center justify-center ${
          isSelected ? "bg-gray-100" : "bg-primary-100"
        }`}
      >
        <View className="flex-row items-center">
          <Plus color="#3D72C2" size={16} strokeWidth={3} />
          <Text className="text-primary-500 font-bold ml-1.5">Add to Cart</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default MenuItem;
