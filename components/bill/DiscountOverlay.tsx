import { Discount } from "@/lib/types";
import { CartItem, useCartStore } from "@/stores/useCartStore";
import { X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const mockDiscounts: Discount[] = [
  { id: "1", label: "10% Discount", value: 0.1, type: "percentage" },
  { id: "2", label: "15% Discount", value: 0.15, type: "percentage" },
  { id: "3", label: "50% Discount", value: 0.5, type: "percentage" },
  {
    id: "4",
    label: "Mall Employee",
    subLabel: "30%",
    value: 0.3,
    type: "percentage",
  },
  {
    id: "5",
    label: "Military Discount",
    subLabel: "(10%)",
    value: 0.1,
    type: "percentage",
  },
];

const DiscountButton = ({ discount, isSelected, onPress }: any) => (
  <TouchableOpacity
    onPress={onPress}
    className={`w-[48%] p-4 border rounded-2xl mb-3 items-center justify-center h-20 ${isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}
  >
    <Text
      className={`font-bold text-center ${isSelected ? "text-blue-600" : "text-gray-700"}`}
    >
      {discount.label}
    </Text>
    {discount.subLabel && (
      <Text
        className={`font-semibold text-center mt-1 ${isSelected ? "text-blue-600" : "text-gray-500"}`}
      >
        {discount.subLabel}
      </Text>
    )}
  </TouchableOpacity>
);

// Get the screen height to calculate animation positions
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface DiscountOverlayProps {
  isVisible: boolean;
  onClose: () => void;
}

const DiscountOverlay: React.FC<DiscountOverlayProps> = ({
  isVisible,
  onClose,
}) => {
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<"check" | "items">("check");

  const {
    items: cartItems,
    applyDiscountToCheck,
    applyDiscountToItem,
    removeDiscountFromItem,
  } = useCartStore();

  // Reanimated value to control the vertical position of the sheet
  const translateY = useSharedValue(SCREEN_HEIGHT);

  // Animated style that will be applied to the content view
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  // Effect to trigger the animation when `isVisible` changes
  useEffect(() => {
    if (isVisible) {
      // Animate IN (slide up)
      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });
    } else {
      // Animate OUT (slide down)
      translateY.value = withTiming(SCREEN_HEIGHT, {
        duration: 300,
        easing: Easing.in(Easing.quad),
      });
    }
  }, [isVisible]);

  const itemsWithAvailableDiscounts = cartItems.filter(
    (item) => !!item.availableDiscount
  );

  const handleApplyCheckDiscount = (discount: Discount) => {
    applyDiscountToCheck(discount);
    onClose();
  };

  const handleToggleItemDiscount = (itemInCart: CartItem) => {
    if (itemInCart.appliedDiscount) {
      removeDiscountFromItem(itemInCart.id);
    } else {
      applyDiscountToItem(itemInCart.id);
    }
    onClose();
  };

  // We only render the component if isVisible is true, for performance.
  if (!isVisible) {
    return null;
  }

  return (
    // The main container is absolutely positioned to cover the entire screen
    <View
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {/* The backdrop, which closes the overlay when pressed */}
      <Pressable onPress={onClose} className="absolute inset-0 bg-black/40" />

      {/* The animated content sheet */}
      <Animated.View
        style={animatedStyle}
        className="absolute bottom-0 left-0 right-0 h-[85%] bg-white rounded-t-2xl p-6"
      >
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-2xl font-bold text-gray-800">Discounts</Text>
          <TouchableOpacity
            onPress={onClose}
            className="p-2 bg-gray-100 rounded-full"
          >
            <X color="#4b5563" size={20} />
          </TouchableOpacity>
        </View>

        {/* The rest of your UI is exactly the same */}
        <View className="flex-row bg-gray-100 p-1 rounded-xl self-start mb-4">
          <TouchableOpacity
            onPress={() => setActiveTab("check")}
            className={`py-2 px-4 rounded-lg ${activeTab === "check" ? "bg-white" : ""}`}
          >
            <Text
              className={`font-semibold ${activeTab === "check" ? "text-primary-400" : "text-gray-500"}`}
            >
              Apply to check
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("items")}
            className={`py-2 px-4 rounded-lg ${activeTab === "items" ? "bg-white" : ""}`}
          >
            <Text
              className={`font-semibold ${activeTab === "items" ? "text-primary-400" : "text-gray-500"}`}
            >
              Apply to items
            </Text>
          </TouchableOpacity>
        </View>
        <Text className="font-semibold text-gray-600 mb-4">
          Select a discount
        </Text>
        <ScrollView>
          {activeTab === "check" && (
            <View className="flex-row flex-wrap justify-between">
              {mockDiscounts.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => handleApplyCheckDiscount(d)}
                  className="w-[48%] p-4 border rounded-2xl mb-3 items-center justify-center h-20 bg-white border-gray-200"
                >
                  <Text className="font-bold text-center text-gray-700">
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {activeTab === "items" && (
            <View className="space-y-3">
              {itemsWithAvailableDiscounts.length > 0 ? (
                itemsWithAvailableDiscounts.map((item) => {
                  const isApplied = !!item.appliedDiscount;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => handleToggleItemDiscount(item)}
                      className={`p-4 border rounded-2xl flex-row justify-between items-center ${isApplied ? "border-primary-400 bg-primary-100" : "bg-white border-gray-200"}`}
                    >
                      <View>
                        <Text
                          className={`font-bold ${isApplied ? "text-primary-400" : "text-gray-700"}`}
                        >
                          {item.name}
                        </Text>
                        <Text
                          className={`font-semibold mt-1 ${isApplied ? "text-primary-400" : "text-gray-500"}`}
                        >
                          {item.availableDiscount?.label}
                        </Text>
                      </View>
                      <Text
                        className={`font-bold text-lg ${isApplied ? "text-primary-400" : "text-gray-700"}`}
                      >
                        {isApplied ? "Applied" : "Apply"}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text className="text-center text-gray-500 mt-10">
                  No items in the cart are eligible for a discount.
                </Text>
              )}
            </View>
          )}
        </ScrollView>
        <TouchableOpacity
          onPress={() => {
            if (selectedDiscount) {
              handleApplyCheckDiscount(selectedDiscount);
            }
          }}
          disabled={!selectedDiscount} // Disable button if no discount is selected
          className={`w-full mt-4 p-4 rounded-xl items-center ${
            selectedDiscount ? "bg-primary-400" : "bg-gray-300"
          }`}
        >
          <Text className="text-white font-bold text-base">Apply Discount</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

export default DiscountOverlay;
