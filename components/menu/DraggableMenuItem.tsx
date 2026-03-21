import { colors } from "@/lib/theme";
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

const DraggableMenuItem = React.memo(({
  item,
  index,
  categoryId,
  menuId,
  onReorder,
  onItemPriceEdit,
  isEditable,
}: DraggableMenuItemProps) => {
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
      style={[
        animatedStyle,
        {
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          width: 110,
        },
      ]}
    >
      <TouchableOpacity
        onPress={() => onItemPriceEdit(item, categoryId, menuId)}
        style={{ padding: 8 }}
      >
        {isEditable && (
          <GestureDetector gesture={panGesture}>
            <View style={{ position: "absolute", top: 4, right: 4 }}>
              <GripVertical size={11} color={colors.muted} />
            </View>
          </GestureDetector>
        )}
        <Text
          style={{ fontSize: 11, fontWeight: "600", color: colors.heading, marginBottom: 3 }}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        <Text style={{ fontSize: 11, color: colors.teal, fontWeight: "600" }}>
          ${item.price.toFixed(2)}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default DraggableMenuItem;
