import { MenuItemType } from "@/lib/types";
import { GripVertical } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

interface DraggableMenuItemProps {
  item: MenuItemType;
  index: number;
  categoryId: string;
  menuId: string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onItemPriceEdit: (
    item: MenuItemType,
    categoryId: string,
    menuId: string
  ) => void;
  isEditable: boolean;
}

const DraggableMenuItem: React.FC<DraggableMenuItemProps> = ({
  item,
  index,
  categoryId,
  menuId,
  onReorder,
  onItemPriceEdit,
  isEditable,
}) => {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .enabled(isEditable) // Only enable drag if isEditable is true
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.05);
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const itemHeight = 60; // Approximate height of each item row
      const newIndex = Math.round(index + event.translationY / itemHeight);

      if (newIndex !== index && newIndex >= 0) {
        runOnJS(onReorder)(index, newIndex);
      }

      translateY.value = withTiming(0);
      scale.value = withSpring(1);
      isDragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(
      scale.value,
      [1, 1.05],
      [0, 0.2],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ translateY: translateY.value }, { scale: scale.value }],
      shadowOpacity,
      elevation: isDragging.value ? 4 : 0,
      zIndex: isDragging.value ? 500 : 1,
    };
  });

  return (
    <Animated.View
      style={animatedStyle}
      className={`flex-row items-center justify-between bg-[#303030] border border-gray-600 rounded-lg px-3 py-2 mb-2 ${
        isEditable ? "pr-2" : ""
      }`}
    >
      <View className="flex-row items-center flex-1 gap-2">
        {isEditable && (
          <GestureDetector gesture={panGesture}>
            <View className="p-2 -ml-2 cursor-grab">
              <GripVertical size={20} color="#6B7280" />
            </View>
          </GestureDetector>
        )}
        <TouchableOpacity
          onPress={() => onItemPriceEdit(item, categoryId, menuId)}
          className="flex-1"
        >
          <View className="flex-row items-center justify-between flex-1">
            <Text className="text-lg text-white">{item.name}</Text>
            <Text className="text-lg text-gray-300">
              ${item.price.toFixed(2)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default DraggableMenuItem;
