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
  const hasModifiers =
    (item.customizations.modifiers &&
      item.customizations.modifiers.length > 0) ||
    item.customizations.notes;
  return (
    <View className="rounded-xl overflow-hidden bg-[#303030] border border-gray-600">
      {/* Delete Button - Positioned absolutely but behind the content */}
      {isEditable && (
        <View className="absolute top-0 right-0 h-full justify-center items-end z-10">
          <TouchableOpacity
            onPress={handleDelete}
            className="w-[90px] h-full bg-red-500 items-center justify-center"
          >
            <Trash2 color="white" size={24} />
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content - This will slide to reveal the delete button */}
      <Animated.View style={animatedStyle} className="bg-[#303030] z-20">
        <TouchableOpacity onPress={handleItemPress} activeOpacity={0.9}>
          <View className="flex-row items-center p-3">
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="font-semibold text-2xl text-white">
                  {item.name}
                </Text>
                {item.isDraft && (
                  <View className="ml-2 px-3 py-1 bg-yellow-100 rounded-full">
                    <Text className="text-lg font-medium text-yellow-700">
                      Draft
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center mt-1">
                <Text className="text-xl text-gray-300">x {item.quantity}</Text>

                {!item.isDraft && (
                  <TouchableOpacity
                    className="flex-row items-center ml-3 px-3 py-1 bg-blue-900/30 border border-blue-500 rounded-3xl"
                    onPress={handleNotesPress}
                  >
                    <Text className="text-lg font-semibold text-blue-400 mr-1">
                      Edit
                    </Text>

                    {isExpanded ? (
                      <ChevronUp color="#60A5FA" size={16} />
                    ) : (
                      <ChevronDown color="#60A5FA" size={16} />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Text className="font-semibold text-2xl text-white">
              ${(item.price * item.quantity).toFixed(2)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Animated Modifiers Dropdown */}
        {hasModifiers && (
          <Animated.View className={`overflow-hidden `}>
            <View className="px-3 pb-3 bg-[#212121] border-t border-gray-600">
              {/* Modifiers */}
              {item.customizations.modifiers &&
                item.customizations.modifiers.length > 0 && (
                  <View className="py-2">
                    {item.customizations.modifiers.map((modifier, index) => (
                      <View key={index} className="">
                        {modifier.options.length > 0 && (
                          <View
                            key={index}
                            className="flex flex-row flex-wrap items-center mb-1"
                          >
                            <Text className="text-xl font-medium text-gray-300 ">
                              {modifier.categoryName}:
                            </Text>
                            {modifier.options.map((option, optionIndex) => {
                              return (
                                <View
                                  key={optionIndex}
                                  className="flex-row justify-between items-center ml-1"
                                >
                                  <Text className="text-xl text-gray-200">
                                    {option.name}
                                    {optionIndex <
                                      modifier.options.length - 1 && " • "}
                                  </Text>
                                  {option.price > 0 && (
                                    <Text className="text-xl font-medium ml-1 text-green-400">
                                      +${option.price.toFixed(2)}{" "}
                                      {optionIndex <
                                        modifier.options.length - 1 && ","}
                                    </Text>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}

              {/* Notes */}
              {item.customizations.notes && (
                <View className="py-2">
                  <Text className="text-xl text-gray-300 mb-1">Notes:</Text>
                  <Text className="text-xl text-gray-200 ml-2 italic">
                    {item.customizations.notes}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}
      </Animated.View>
      <View className="h-[1px] bg-gray-600 w-[90%] self-center mt-1" />
    </View>
  );
};

export default BillItem;
