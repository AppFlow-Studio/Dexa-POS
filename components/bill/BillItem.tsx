import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CartItem } from "@/lib/types";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { Trash2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface BillItemProps {
  item: CartItem;
  isEditable?: boolean;
  expandedItemId?: string | null;
  onToggleExpand?: (itemId: string) => void;
}

const DELETE_BUTTON_WIDTH = 90;

const BillItem: React.FC<BillItemProps> = ({
  item,
  isEditable = false,
  expandedItemId,
  onToggleExpand,
}) => {
  const { activeOrderId, removeItemFromActiveOrder } = useOrderStore();
  const { openToEdit, openToView, openFullscreenEdit } =
    useModifierSidebarStore();
  const translateX = useSharedValue(0);

  const isExpanded = expandedItemId === item.id;

  const handleItemPress = () => {
    if (onToggleExpand) {
      onToggleExpand(item.id);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Pan gesture to reveal delete
  const MAX_LEFT = -DELETE_BUTTON_WIDTH;
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const next = Math.max(MAX_LEFT, Math.min(0, e.translationX));
      translateX.value = next;
    })
    .onEnd(() => {
      const shouldOpen = translateX.value < MAX_LEFT / 2;
      translateX.value = withTiming(shouldOpen ? MAX_LEFT : 0);
    });

  const handleDelete = () => {
    if (activeOrderId) {
      removeItemFromActiveOrder(item.id);
      // Reset the position after deletion
      translateX.value = withTiming(0);
    }
  };

  const handleNotesPress = (e: any) => {
    e.stopPropagation();
    if (isEditable) {
      openFullscreenEdit(item, activeOrderId);
    } else {
      openToView(item, activeOrderId);
    }
  };

  const imageSource = item.image
    ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
    : undefined;

  // Check if item has any modifiers to show
  const hasModifiers =
    (item.customizations.modifiers &&
      item.customizations.modifiers.length > 0) ||
    item.customizations.notes;
  return (
    <View className="rounded-xl overflow-hidden bg-[#303030] border border-gray-600">
      {isEditable && (
        <View className="absolute top-0 right-1 h-full justify-center items-end self-center z-10">
          <TouchableOpacity
            onPress={handleDelete}
            className="w-20 h-[90%] bg-red-500 items-center rounded-lg justify-center"
          >
            <Trash2 color="white" size={20} />
          </TouchableOpacity>
        </View>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View style={animatedStyle} className="bg-[#303030] z-20">
          <TouchableOpacity onPress={handleNotesPress} activeOpacity={0.9}>
            <View className="flex-row items-center p-2">
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="font-semibold text-xl text-white">
                    {item.name}
                  </Text>
                  {item.isDraft && (
                    <View className="ml-2 px-2 py-0.5 bg-yellow-100 rounded-full">
                      <Text className="text-base font-medium text-yellow-700">
                        Draft
                      </Text>
                    </View>
                  )}
                  {item.kitchen_status && (
                    <View
                      className={`ml-2 px-2 py-0.5 rounded-full ${
                        item.kitchen_status === "new"
                          ? "bg-green-900/30 border border-green-500"
                          : item.kitchen_status === "sent"
                            ? "bg-blue-900/30 border border-blue-500"
                            : item.kitchen_status === "ready"
                              ? "bg-orange-900/30 border border-orange-500"
                              : "bg-gray-900/30 border border-gray-500"
                      }`}
                    >
                      <Text
                        className={`text-base font-medium ${
                          item.kitchen_status === "new"
                            ? "text-green-400"
                            : item.kitchen_status === "sent"
                              ? "text-blue-400"
                              : item.kitchen_status === "ready"
                                ? "text-orange-400"
                                : "text-gray-400"
                        }`}
                      >
                        {item.kitchen_status.charAt(0).toUpperCase() +
                          item.kitchen_status.slice(1)}
                      </Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center mt-1">
                  <Text className="text-lg text-gray-300">
                    x {item.quantity}
                  </Text>
                </View>
              </View>
              <Text className="font-semibold text-xl text-white">
                ${(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>
          </TouchableOpacity>

          {hasModifiers && (
            <Animated.View className="overflow-hidden">
              <View className="px-2 pb-2 bg-[#212121] border-t border-gray-600">
                {item.customizations.modifiers &&
                  item.customizations.modifiers.length > 0 && (
                    <View className="py-1">
                      {item.customizations.modifiers.map((modifier, index) => (
                        <View key={index}>
                          {modifier.options.length > 0 && (
                            <View className="flex-row flex-wrap items-center mb-1">
                              <Text className="text-lg font-medium text-gray-300">
                                {modifier.categoryName}:
                              </Text>
                              {modifier.options.map((option, optionIndex) => (
                                <View
                                  key={optionIndex}
                                  className="flex-row items-center ml-1"
                                >
                                  <Text className="text-lg text-gray-200">
                                    {option.name}
                                    {optionIndex <
                                      modifier.options.length - 1 && " • "}
                                  </Text>
                                  {option.price > 0 && (
                                    <Text className="text-lg font-medium ml-1 text-green-400">
                                      +${option.price.toFixed(2)}
                                    </Text>
                                  )}
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                {item.customizations.notes && (
                  <View className="py-1">
                    <Text className="text-lg text-gray-300 mb-1">Notes:</Text>
                    <Text className="text-lg text-gray-200 ml-2 italic">
                      {item.customizations.notes}
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </GestureDetector>
      <View className="h-[1px] bg-gray-600 w-[90%] self-center mt-1" />
    </View>
  );
};

export default BillItem;
