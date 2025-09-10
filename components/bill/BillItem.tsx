import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CartItem } from "@/lib/types";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

interface BillItemProps {
  item: CartItem;
  isEditable?: boolean;
  expandedItemId?: string | null;
  onToggleExpand?: (itemId: string) => void;
}

const DELETE_BUTTON_WIDTH = 75;

const BillItem: React.FC<BillItemProps> = ({
  item,
  isEditable = false,
  expandedItemId,
  onToggleExpand
}) => {
  const { activeOrderId, removeItemFromActiveOrder } = useOrderStore();
  const { openToEdit, openToView, openFullscreenEdit } = useModifierSidebarStore();
  const [isDeleteVisible, setDeleteVisible] = useState(false);
  const translateX = useSharedValue(0);

  const isExpanded = expandedItemId === item.id;

  const handleItemPress = () => {
    if (onToggleExpand) {
      onToggleExpand(item.id);
    } else if (!isEditable) return;

    if (isEditable) {
      const newIsVisible = !isDeleteVisible;
      setDeleteVisible(newIsVisible);
      translateX.value = withTiming(newIsVisible ? -DELETE_BUTTON_WIDTH : 0);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleDelete = () => {
    if (activeOrderId) {
      removeItemFromActiveOrder(item.id);
      // Reset the position after deletion
      translateX.value = withTiming(0);
      setDeleteVisible(false);
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
  const hasModifiers = (item.customizations.modifiers && item.customizations.modifiers.length > 0) ||
    item.customizations.notes;
  return (
    <View className="mb-2 rounded-xl overflow-hidden bg-white border border-gray-200">
      {/* Delete Button - Positioned absolutely but behind the content */}
      {isEditable && (
        <View className="absolute top-0 right-0 h-16 justify-center items-end z-10">
          <TouchableOpacity
            onPress={handleDelete}
            className="w-[75px] h-full bg-red-500 items-center justify-center"
          >
            <Trash2 color="white" size={24} />
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content - This will slide to reveal the delete button */}
      <Animated.View style={animatedStyle} className="bg-white z-20">
        <TouchableOpacity onPress={handleItemPress} activeOpacity={0.9}>
          <View className="flex-row items-center p-2">
            {/* {imageSource ? (
              <Image
                source={imageSource}
                className="w-12 h-12 rounded-lg"
                resizeMode="contain"
              />
            ) : (
              <View className="w-12 h-12 rounded-lg bg-gray-100 items-center justify-center">
                <Utensils color="#9ca3af" size={20} />
              </View>
            )} */}

            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="font-semibold text-base text-accent-500">
                  {item.name}
                </Text>
                {item.isDraft && (
                  <View className="ml-2 px-2 py-0.5 bg-yellow-100 rounded-full">
                    <Text className="text-xs font-medium text-yellow-700">Draft</Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center mt-1">
                <Text className="text-sm text-accent-500">
                  x {item.quantity}
                </Text>

                <TouchableOpacity
                  className="flex-row items-center ml-3 px-2 py-0.5 bg-[#659AF033] rounded-3xl"
                  onPress={handleNotesPress}
                >
                  <Text className="text-xs font-semibold text-primary-400 mr-1">
                    {item.isDraft ? "Confirm" : "Edit"}
                  </Text>
                  {isExpanded ? (
                    <ChevronUp color="#2563eb" size={10} />
                  ) : (
                    <ChevronDown color="#2563eb" size={10} />
                  )}
                </TouchableOpacity>

              </View>
            </View>
            <Text className="font-semibold text-base text-accent-300">
              ${(item.price * item.quantity).toFixed(2)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Animated Modifiers Dropdown */}
        {hasModifiers && (
          <Animated.View
            className={`overflow-hidden `}
          >
            <View className="px-2 pb-2 bg-gray-50 border-t border-gray-100">
              {/* Modifiers */}
              {item.customizations.modifiers && item.customizations.modifiers.length > 0 && (
                <View className="py-1">
                  {item.customizations.modifiers.map((modifier, index) => (
                    <View key={index}>
                      {modifier.options.length > 0 && (
                        <View key={index} className="mb-2">
                          <Text className="text-sm font-medium text-gray-600 mb-1">
                            {modifier.categoryName}:
                          </Text>
                          {modifier.options.map((option, optionIndex) => (
                            <View key={optionIndex} className="flex-row justify-between items-center ml-2">
                              <Text className="text-sm text-gray-700">• {option.name}</Text>
                              {option.price > 0 && (
                                <Text className="text-sm font-medium text-green-600">
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

              {/* Notes */}
              {item.customizations.notes && (
                <View className="py-1">
                  <Text className="text-sm text-gray-600 mb-1">Notes:</Text>
                  <Text className="text-sm text-gray-700 ml-2 italic">
                    {item.customizations.notes}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}
      </Animated.View>
      <View className="h-[1px] bg-gray-100 w-[90%] self-center mt-1" />

    </View>
  );
};

export default BillItem;
