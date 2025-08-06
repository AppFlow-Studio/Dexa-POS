import { Discount, useCartStore } from "@/stores/useCartStore";
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
  const applyDiscountAction = useCartStore((state) => state.applyDiscount);

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

  const handleApply = () => {
    if (selectedDiscount) {
      applyDiscountAction(selectedDiscount);
      onClose();
    }
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
          {/* ... tabs ... */}
        </View>
        <Text className="font-semibold text-gray-600 mb-4">
          Select a discount
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View className="flex-row flex-wrap justify-between">
            {mockDiscounts.map((d) => (
              <DiscountButton
                key={d.id}
                discount={d}
                isSelected={selectedDiscount?.id === d.id}
                onPress={() => setSelectedDiscount(d)}
              />
            ))}
          </View>
        </ScrollView>
        <TouchableOpacity
          onPress={handleApply}
          className="w-full mt-4 p-4 bg-primary-400 rounded-xl items-center"
        >
          <Text className="text-white font-bold text-base">Apply Discount</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

export default DiscountOverlay;
