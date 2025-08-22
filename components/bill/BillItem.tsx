import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CartItem } from "@/lib/types";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { Pencil, Trash2, Utensils } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
// 1. Import Gesture Handler and Reanimated
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface BillItemProps {
  item: CartItem;
}

const DELETE_BUTTON_WIDTH = 75; // The width of the delete button area

const BillItem: React.FC<BillItemProps> = ({ item }) => {
  const { activeOrderId, removeItemFromActiveOrder } = useOrderStore();
  const openDialogToEdit = useCustomizationStore((state) => state.openToEdit);

  // --- Animation State ---
  const translateX = useSharedValue(0);

  // --- Gesture Handler ---
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Allow swiping from right to left, but not too far
      translateX.value = Math.max(
        -DELETE_BUTTON_WIDTH,
        Math.min(0, event.translationX)
      );
    })
    .onEnd(() => {
      // If swiped more than halfway, snap open. Otherwise, snap closed.
      if (translateX.value < -DELETE_BUTTON_WIDTH / 2) {
        translateX.value = withTiming(-DELETE_BUTTON_WIDTH);
      } else {
        translateX.value = withTiming(0);
      }
    });

  // Animated style for the main content that will slide
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Handler for the delete button press
  const handleDelete = () => {
    if (activeOrderId) {
      // Use runOnJS if you experience issues, but it's often fine for Zustand
      removeItemFromActiveOrder(item.id);
    }
  };

  const imageSource = item.image
    ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
    : undefined;

  return (
    <View className="rounded-lg overflow-hidden">
      {/* --- Delete Button (positioned underneath) --- */}
      <View className="absolute top-0 right-0 h-full w-full justify-center items-end">
        <TouchableOpacity
          onPress={handleDelete}
          className="w-14 h-full bg-red-500 items-center justify-center"
        >
          <Trash2 color="white" size={24} />
        </TouchableOpacity>
      </View>

      {/* --- Main Swipeable Content --- */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={animatedStyle}
          className="flex-row items-center px-2 py-1 bg-white"
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
              {/* "Notes" button now opens the edit dialog */}
              <TouchableOpacity
                className="flex-row items-center ml-3 px-2 py-0.5 bg-[#659AF033] rounded-3xl"
                onPress={() => openDialogToEdit(item, activeOrderId)}
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
      </GestureDetector>
    </View>
  );
};

export default BillItem;
