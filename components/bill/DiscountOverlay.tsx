import { colors } from "@/lib/theme";
import { CartItem, Discount } from "@/lib/types";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView, // <--- Imported
  Platform, // <--- Imported
  Pressable,
  ScrollView,
  Text,
  TextInput,
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

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface DiscountOverlayProps {
  isVisible: boolean;
  onClose: () => void;
}

const DiscountOverlay: React.FC<DiscountOverlayProps> = ({
  isVisible,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"check" | "items">("check");
  const translateY = useSharedValue(SCREEN_HEIGHT);

  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const applyDiscountToCheck = useOrderStore((s) => s.applyDiscountToCheck);
  const applyDiscountToItem = useOrderStore((s) => s.applyDiscountToItem);
  const removeDiscountFromItem = useOrderStore((s) => s.removeDiscountFromItem);
  const activeOrder = useActiveOrder();
  const cartItems = activeOrder?.items || [];

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  useEffect(() => {
    if (isVisible) {
      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });
    } else {
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
    if (activeOrderId) {
      applyDiscountToCheck(activeOrderId, discount);
      onClose();
    }
  };

  const handleToggleItemDiscount = (itemInCart: CartItem) => {
    if (!activeOrderId) return;
    if (itemInCart.appliedDiscount) {
      removeDiscountFromItem(activeOrderId, itemInCart.id);
    } else {
      applyDiscountToItem(activeOrderId, itemInCart.id);
    }
    onClose();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
      }}
    >
      <Pressable onPress={onClose} className="absolute inset-0 bg-black/60" />
      <Animated.View
        style={animatedStyle}
        className="absolute bottom-0 left-0 right-0 h-[85%] bg-panel rounded-t-3xl p-4 border-t border-gray-700"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-2xl font-bold text-white">Discounts</Text>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 bg-surface rounded-full border border-gray-600"
            >
              <X color={colors.label} size={20} />
            </TouchableOpacity>
          </View>

          <View className="flex-row bg-surface border border-gray-700 p-1.5 rounded-xl self-start mb-4">
            <TouchableOpacity
              onPress={() => setActiveTab("check")}
              className={`py-2 px-3 rounded-lg ${
                activeTab === "check" ? "bg-panel" : ""
              }`}
            >
              <Text
                className={`text-lg font-semibold ${
                  activeTab === "check" ? "text-blue-400" : "text-gray-400"
                }`}
              >
                Apply to check
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("items")}
              className={`py-2 px-3 rounded-lg ${
                activeTab === "items" ? "bg-panel" : ""
              }`}
            >
              <Text
                className={`text-lg font-semibold ${
                  activeTab === "items" ? "text-blue-400" : "text-gray-400"
                }`}
              >
                Apply to items
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView>
            {activeTab === "check" && (
              <View className="flex-row flex-wrap justify-between">
                {mockDiscounts.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    onPress={() => handleApplyCheckDiscount(d)}
                    className="w-[49%] p-1 border rounded-xl mb-2 items-center justify-center h-20 bg-surface border-gray-600"
                  >
                    <Text className="text-lg text-wrap w-full overflow-hidden font-bold text-center text-white">
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {activeTab === "items" && (
              <View className="gap-y-3">
                {itemsWithAvailableDiscounts.length > 0 ? (
                  itemsWithAvailableDiscounts.map((item) => {
                    const isApplied = !!item.appliedDiscount;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => handleToggleItemDiscount(item)}
                        className={`p-4 border rounded-xl flex-row justify-between items-center ${
                          isApplied
                            ? "border-blue-500 bg-blue-900/20"
                            : "bg-surface border-gray-600"
                        }`}
                      >
                        <View>
                          <Text
                            className={`text-xl font-bold ${
                              isApplied ? "text-blue-400" : "text-white"
                            }`}
                          >
                            {item.name}
                          </Text>
                          <Text
                            className={`text-lg w-full overflow-hidden font-semibold text-wrap mt-1 ${
                              isApplied ? "text-blue-300" : "text-gray-400"
                            }`}
                          >
                            {item.availableDiscount?.label}
                          </Text>
                        </View>
                        <Text
                          className={`text-xl font-bold ${
                            isApplied ? "text-blue-400" : "text-white"
                          }`}
                        >
                          {isApplied ? "Applied" : "Apply"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text className="text-center text-xl text-gray-500 mt-10">
                    No items in the cart are eligible for a discount.
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
          <View className="flex-row items-center gap-3 mt-4 pt-4 border-t border-gray-700">
            <TextInput
              placeholder="Add promo or voucher"
              className="flex-1 p-3 bg-surface rounded-xl text-xl text-white border border-gray-600 h-16"
              placeholderTextColor={colors.muted}
            />
            <TouchableOpacity className="px-5 py-3 bg-blue-600 rounded-xl">
              <Text className="text-white text-xl font-bold">Apply</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
};

export default DiscountOverlay;
