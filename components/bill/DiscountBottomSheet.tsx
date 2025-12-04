import { CartItem, Discount } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Check, X } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const mockDiscounts: Discount[] = [
  { id: "1", label: "10% Off", value: 0.1, type: "percentage" },
  { id: "2", label: "15% Off", value: 0.15, type: "percentage" },
  { id: "3", label: "50% Off", value: 0.5, type: "percentage" },
  { id: "4", label: "Mall Staff (30%)", value: 0.3, type: "percentage" },
  { id: "5", label: "Military (10%)", value: 0.1, type: "percentage" },
];

interface DiscountBottomSheetProps {
  onClose: () => void;
}

const DiscountBottomSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  DiscountBottomSheetProps
> = ({ onClose }, ref) => {
  // FIX 1: Use 100% as the max height.
  // 90% causes the keyboard to overlap the input on some Android screens.
  const snapPoints = useMemo(() => ["50%", "100%"], []);
  const [activeTab, setActiveTab] = useState<"check" | "items">("check");

  const {
    activeOrderId,
    orders,
    applyDiscountToCheck,
    applyDiscountToItem,
    removeDiscountFromItem,
  } = useOrderStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const cartItems = activeOrder?.items || [];
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
  };

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#212121" }}
      handleIndicatorStyle={{ backgroundColor: "#4B5563" }}
      // FIX 2: Use 'interactive'.
      // This synchronizes the sheet movement with the keyboard animation exactly.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      topInset={60}
    >
      <BottomSheetView className="flex-1 bg-[#212121] px-4 pb-6">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-4 border-b border-gray-700 pb-3">
          <Text className="text-xl font-bold text-white">Apply Discount</Text>
          <TouchableOpacity
            onPress={onClose}
            className="p-1.5 bg-[#303030] rounded-full border border-gray-600"
          >
            <X color="#9CA3AF" size={18} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View className="flex-row bg-[#303030] p-1 rounded-xl mb-5 border border-gray-700">
          <TouchableOpacity
            onPress={() => setActiveTab("check")}
            className={`flex-1 py-2 rounded-lg items-center ${
              activeTab === "check" ? "bg-[#4B5563]" : ""
            }`}
          >
            <Text
              className={`font-semibold ${activeTab === "check" ? "text-white" : "text-gray-400"}`}
            >
              Whole Check
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("items")}
            className={`flex-1 py-2 rounded-lg items-center ${
              activeTab === "items" ? "bg-[#4B5563]" : ""
            }`}
          >
            <Text
              className={`font-semibold ${activeTab === "items" ? "text-white" : "text-gray-400"}`}
            >
              Specific Items
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          // FIX 3: Add large bottom padding.
          // This ensures that when the keyboard comes up, there is enough 'scrollable'
          // area to push the input to the top of the screen.
          contentContainerStyle={{ paddingBottom: 150 }}
        >
          {activeTab === "check" && (
            <View className="flex-1">
              <Text className="text-gray-400 text-sm mb-3 uppercase tracking-wider font-semibold">
                Quick Apply
              </Text>
              <View className="flex-row flex-wrap justify-between gap-y-3">
                {mockDiscounts.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    onPress={() => handleApplyCheckDiscount(d)}
                    className="w-[48%] h-16 bg-[#303030] border border-gray-600 rounded-xl items-center justify-center active:bg-blue-600/20 active:border-blue-500"
                  >
                    <Text className="text-white font-bold text-lg">
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="mt-6 border-t border-gray-700 pt-4">
                <Text className="text-gray-400 text-sm mb-3 uppercase tracking-wider font-semibold">
                  Voucher Code
                </Text>
                <View className="flex-row gap-2">
                  <BottomSheetTextInput
                    placeholder="Add promo or voucher"
                    placeholderTextColor="#6B7280"
                    style={{
                      flex: 1,
                      backgroundColor: "#303030",
                      color: "white",
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#4B5563",
                      fontSize: 16,
                    }}
                  />
                  <TouchableOpacity className="bg-blue-600 px-5 rounded-xl justify-center items-center">
                    <Text className="text-white font-bold">Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {activeTab === "items" && (
            <View className="gap-y-2">
              {itemsWithAvailableDiscounts.length > 0 ? (
                itemsWithAvailableDiscounts.map((item) => {
                  const isApplied = !!item.appliedDiscount;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => handleToggleItemDiscount(item)}
                      className={`flex-row justify-between items-center p-3 rounded-xl border ${
                        isApplied
                          ? "bg-blue-900/20 border-blue-500"
                          : "bg-[#303030] border-gray-700"
                      }`}
                    >
                      <View className="flex-1 mr-4">
                        <Text className="text-white font-semibold text-lg">
                          {item.name}
                        </Text>
                        <Text className="text-gray-400 text-sm">
                          {item.availableDiscount?.label || "Discountable"}
                        </Text>
                      </View>
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center border ${isApplied ? "bg-blue-500 border-blue-500" : "border-gray-500"}`}
                      >
                        {isApplied && <Check size={14} color="white" />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View className="items-center py-10">
                  <Text className="text-gray-500 text-lg">
                    No eligible items found.
                  </Text>
                </View>
              )}
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
};

const DiscountBottomSheet = forwardRef(DiscountBottomSheetComponent);
DiscountBottomSheet.displayName = "DiscountBottomSheet";

export default DiscountBottomSheet;
