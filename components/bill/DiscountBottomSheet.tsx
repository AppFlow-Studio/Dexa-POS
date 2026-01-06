import { useToast } from "@/contexts/ToastContext";
import { useDiscounts } from "@/hooks/useDiscounts";
import {
  EligibilityContext,
  getEligibleDiscounts,
} from "@/services/discountEligibility";
import { getDailyUsageCounts } from "@/services/discountUsageTracker";
import { useOrderStore } from "@/stores/useOrderStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Check, X } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

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
    ordersById,
    applyDiscountToCheck,
    applyDiscountToItem,
    removeDiscountFromItem,
    removeCheckDiscount,
  } = useOrderStore();
  const { show } = useToast();

  const { data: discounts = [] } = useDiscounts();

  const activeOrder = activeOrderId ? ordersById[activeOrderId] : undefined;
  const cartItems = activeOrder?.items || [];
  const itemsWithAvailableDiscounts = cartItems.filter(
    (item) => !!item.availableDiscount
  );

  const eligibilityResults = useMemo(() => {
    if (!activeOrder) return [];
    const items = cartItems.map((item) => ({
      id: item.id,
      menu_item_id: item.menuItemId,
      category_id: item.category_name || undefined,
      is_alcohol: false,
      item_total: item.price * item.quantity,
    }));
    const ctx: EligibilityContext = {
      orderType:
        activeOrder.order_type === "Dine In"
          ? "dine_in"
          : activeOrder.order_type === "Delivery"
            ? "delivery"
            : "takeout",
      currentDate: new Date(),
      dailyUsageCounts: getDailyUsageCounts(),
      subtotal: items.reduce((sum, i) => sum + i.item_total, 0),
      items,
    };
    return getEligibleDiscounts(discounts as any, ctx);
  }, [activeOrder, cartItems, discounts]);

  const handleApplyCheckDiscount = (discount: any) => {
    if (!activeOrderId) return;

    const existingCheckDiscount = activeOrder?.checkDiscount as any;
    const existingNonStackable =
      existingCheckDiscount && existingCheckDiscount.stackable === false;
    const incomingNonStackable = (discount as any)?.stackable === false;

    // Enforce non-stackable rule: block applying when a non-stackable exists or incoming is non-stackable
    if (existingCheckDiscount && (existingNonStackable || incomingNonStackable)) {
      show({
        title: "Cannot stack discounts",
        message: "Remove the existing discount before applying this one.",
        type: "error",
      });
      return;
    }

    applyDiscountToCheck(activeOrderId, discount as any);
    onClose();
  };

  const handleRemoveCheckDiscount = () => {
    if (!activeOrderId) return;
    removeCheckDiscount(activeOrderId);
    onClose();
  };

  const handleToggleItemDiscount = (itemInCart: any) => {
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

        {/* Current discount + remove */}
        {activeOrder?.checkDiscount && (
          <View className="mb-4 p-3 border border-blue-500/60 bg-blue-500/10 rounded-xl flex-row items-center justify-between">
            <View>
              <Text className="text-white font-semibold">
                {activeOrder.checkDiscount.label || "Active Discount"}
              </Text>
              {activeOrder.checkDiscount.type === "percentage" ? (
                <Text className="text-gray-300">
                  {Math.round((activeOrder.checkDiscount.value || 0) * 100)}% off
                </Text>
              ) : (
                <Text className="text-gray-300">
                  ${activeOrder.checkDiscount.value?.toFixed(2)} off
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={handleRemoveCheckDiscount}
              className="px-3 py-2 bg-red-600 rounded-lg"
            >
              <Text className="text-white font-semibold">Remove</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tabs */}
        <View className="flex-row bg-[#303030] p-1 rounded-xl mb-5 border border-gray-700">
          <TouchableOpacity
            onPress={() => setActiveTab("check")}
            className={`flex-1 py-2 rounded-lg items-center ${activeTab === "check" ? "bg-[#4B5563]" : ""
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
            className={`flex-1 py-2 rounded-lg items-center ${activeTab === "items" ? "bg-[#4B5563]" : ""
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
                Available Discounts
              </Text>
              <View className="flex-col gap-y-3">
                {eligibilityResults.length === 0 ? (
                  <Text className="text-gray-500">No discounts available</Text>
                ) : (
                  eligibilityResults.map((d) => (
                    <TouchableOpacity
                      key={d.discount.id}
                      disabled={!d.eligible}
                      onPress={() => handleApplyCheckDiscount(d.discount)}
                      className={`p-3 rounded-xl border ${d.eligible
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-gray-700 bg-[#303030]"
                        }`}
                    >
                      <View className="flex-row justify-between items-center">
                        <View>
                          <Text className="text-white font-semibold text-lg">
                            {d.discount.name}
                          </Text>
                          <Text className="text-gray-400">
                            {d.discount.discount_type === "percentage"
                              ? `${d.discount.discount_value}% off`
                              : `$${d.discount.discount_value.toFixed(2)} off`}
                          </Text>
                        </View>
                        {d.eligible ? (
                          <Text className="text-green-400 font-bold">
                            -${d.calculated_savings.toFixed(2)}
                          </Text>
                        ) : (
                          <Text className="text-red-400 text-sm">
                            {d.reason}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
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
                      className={`flex-row justify-between items-center p-3 rounded-xl border ${isApplied
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
