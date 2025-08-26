import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CartItem } from "@/lib/types";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { ChevronDown, ChevronUp, Trash2, Utensils } from "lucide-react-native";
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Layout,
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

const DELETE_BUTTON_WIDTH = 75;

const BillItem: React.FC<BillItemProps> = ({
  item,
  isEditable = false,
  expandedItemId,
  onToggleExpand
}) => {
  const { activeOrderId, removeItemFromActiveOrder } = useOrderStore();
  const { openToEdit, openToView } = useCustomizationStore();
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
      openToEdit(item, activeOrderId);
    } else {
      openToView(item);
    }
  };

  const imageSource = item.image
    ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
    : undefined;

  // Check if item has any modifiers to show
  const hasModifiers = item.customizations.size ||
    (item.customizations.addOns && item.customizations.addOns.length > 0) ||
    item.customizations.notes;

  return (
    <View className="mb-4 rounded-lg overflow-hidden bg-white">
      {/* Delete Button - Positioned absolutely but behind the content */}
      {isEditable && (
        <View className="absolute top-0 right-0 h-full justify-center items-end z-10">
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
            {imageSource ? (
              <Image
                source={imageSource}
                className="w-12 h-12 rounded-lg"
                resizeMode="contain"
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
                <Text className="text-sm text-accent-500">
                  x {item.quantity}
                </Text>
                {hasModifiers && (
                  <TouchableOpacity
                    className="flex-row items-center ml-3 px-2 py-0.5 bg-[#659AF033] rounded-3xl"
                    onPress={handleNotesPress}
                  >
                    <Text className="text-xs font-semibold text-primary-400 mr-1">
                      Modifiers
                    </Text>
                    {isExpanded ? (
                      <ChevronUp color="#2563eb" size={10} />
                    ) : (
                      <ChevronDown color="#2563eb" size={10} />
                    )}
                  </TouchableOpacity>
                )}
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
            layout={Layout.springify()}
            className={`overflow-hidden ${isExpanded ? 'max-h-96' : 'max-h-0'}`}
          >
            <View className="px-2 pb-2 bg-gray-50 border-t border-gray-100">
              {/* Size */}
              {item.customizations.size && (
                <View className="flex-row justify-between items-center py-1">
                  <Text className="text-sm text-gray-600">Size:</Text>
                  <Text className="text-sm font-medium text-gray-800">
                    {item.customizations.size.name}
                    {item.customizations.size.priceModifier > 0 && (
                      <Text className="text-green-600"> (+${item.customizations.size.priceModifier.toFixed(2)})</Text>
                    )}
                  </Text>
                </View>
              )}

              {/* Add-ons */}
              {item.customizations.addOns && item.customizations.addOns.length > 0 && (
                <View className="py-1">
                  <Text className="text-sm text-gray-600 mb-1">Add-ons:</Text>
                  {item.customizations.addOns.map((addon, index) => (
                    <View key={index} className="flex-row justify-between items-center ml-2">
                      <Text className="text-sm text-gray-700">• {addon.name}</Text>
                      <Text className="text-sm font-medium text-green-600">
                        +${addon.price.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Notes */}
              {item.customizations.notes && (
                <View className="py-1">
                  <Text className="text-sm text-gray-600 mb-1">Notes:</Text>
                  <Text className="text-sm text-gray-700 ml-2 italic">
                    "{item.customizations.notes}"
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
};

export default BillItem;
