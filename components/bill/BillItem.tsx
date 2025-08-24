import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CartItem } from "@/lib/types";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { Pencil, Trash2, Utensils } from "lucide-react-native";
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface BillItemProps {
  item: CartItem;
}

const DELETE_BUTTON_WIDTH = 75;

const BillItem: React.FC<BillItemProps> = ({ item }) => {
  const { activeOrderId, removeItemFromActiveOrder } = useOrderStore();
  const openDialogToEdit = useCustomizationStore((state) => state.openToEdit);

  // Add a state to track if the delete button is visible
  const [isDeleteVisible, setDeleteVisible] = useState(false);
  const translateX = useSharedValue(0);

  // This is the handler for tapping the item
  const handleItemPress = () => {
    // Toggle the visibility state
    const newIsVisible = !isDeleteVisible;
    setDeleteVisible(newIsVisible);

    // Animate based on the new state
    if (newIsVisible) {
      translateX.value = withTiming(-DELETE_BUTTON_WIDTH);
    } else {
      translateX.value = withTiming(0);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleDelete = () => {
    if (activeOrderId) {
      removeItemFromActiveOrder(item.id);
    }
  };

  const imageSource = item.image
    ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
    : undefined;

  return (
    <View className="mb-4 rounded-lg overflow-hidden bg-white">
      {/* --- Delete Button (positioned underneath) --- */}
      <View className="absolute top-0 right-0 h-full w-full justify-center items-end">
        <TouchableOpacity
          onPress={handleDelete}
          className="w-[75px] h-full bg-red-500 items-center justify-center"
        >
          <Trash2 color="white" size={24} />
        </TouchableOpacity>
      </View>

      {/* --- Main Tappable Content --- */}
      {/* Replace GestureDetector with a TouchableOpacity */}
      <TouchableOpacity onPress={handleItemPress} activeOpacity={0.9}>
        <Animated.View
          style={animatedStyle}
          className="flex-row items-center p-2 bg-white" // Add padding here
        >
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
              <TouchableOpacity
                className="flex-row items-center ml-3 px-2 py-0.5 bg-[#659AF033] rounded-3xl"
                onPress={(e) => {
                  e.stopPropagation();
                  openDialogToEdit(item, activeOrderId);
                }}
              >
                <Text className="text-xs font-semibold text-primary-400 mr-1">
                  Notes
                </Text>
                <Pencil color="#2563eb" size={10} />
              </TouchableOpacity>
            </View>
          </View>
          <Text className="font-semibold text-base text-accent-300">
            ${(item.price * item.quantity).toFixed(2)}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
};

export default BillItem;
