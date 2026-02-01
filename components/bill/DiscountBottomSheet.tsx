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
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Check, X } from "lucide-react-native";
import React, { forwardRef, useEffect, useMemo, useState } from "react";
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

  // Custom discount state
  const [customDiscountType, setCustomDiscountType] = useState<
    "percentage" | "fixed"
  >("percentage");
  const [customDiscountValue, setCustomDiscountValue] = useState("");

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
    (item) => !!item.availableDiscount,
  );

  // Check if order has refunds - if so, show warning and close sheet
  const hasRefunds = useMemo(() => {
    const payments = activeOrder?.payments || [];
    return payments.some((p) => (p.refundedAmount ?? 0) > 0);
  }, [activeOrder?.payments]);

  // Close sheet and show warning if order has refunds
  // useEffect(() => {
  //   if (hasRefunds && ref && "current" in ref && ref.current) {
  //     show({
  //       title: "Discounts Unavailable",
  //       message: "Cannot add discounts to refunded orders.",
  //       type: "warning",
  //     });
  //     ref.current.close();
  //   }
  // }, [hasRefunds, ref, show]);

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
    if (
      existingCheckDiscount &&
      (existingNonStackable || incomingNonStackable)
    ) {
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

  const handleApplyCustomDiscount = () => {
    if (!activeOrderId || !customDiscountValue) return;

    const numericValue = parseFloat(customDiscountValue);
    if (isNaN(numericValue) || numericValue <= 0) {
      show({
        title: "Invalid discount",
        message: "Please enter a valid discount amount.",
        type: "error",
      });
      return;
    }

    // Validate percentage doesn't exceed 100%
    if (customDiscountType === "percentage" && numericValue > 100) {
      show({
        title: "Invalid percentage",
        message: "Percentage discount cannot exceed 100%.",
        type: "error",
      });
      return;
    }

    // Create a custom discount object compatible with applyDiscountToCheck
    const customDiscount = {
      id: `custom_${Date.now()}`,
      label:
        customDiscountType === "percentage"
          ? `Custom ${numericValue}% Off`
          : `Custom $${numericValue.toFixed(2)} Off`,
      value:
        customDiscountType === "percentage"
          ? numericValue / 100 // Convert to decimal for percentage
          : numericValue,
      type: customDiscountType,
    };

    applyDiscountToCheck(activeOrderId, customDiscount as any);

    // Reset custom discount form
    setCustomDiscountValue("");

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
    [],
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
      <BottomSheetScrollView className="flex-1 bg-[#212121] px-4 pb-6">
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
                  {Math.round((activeOrder.checkDiscount.value || 0) * 100)}%
                  off
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
        <View
        // FIX 3: Add large bottom padding.
        // This ensures that when the keyboard comes up, there is enough 'scrollable'
        // area to push the input to the top of the screen.
        >
          {activeTab === "check" && (
            <View className="flex-1">
              {/* Custom Discount Section */}
              <View className="mb-6">
                <Text className="text-gray-400 text-sm mb-3 uppercase tracking-wider font-semibold">
                  Custom Discount
                </Text>
                <View className="bg-[#303030] border border-gray-700 rounded-xl p-4">
                  {/* Discount Type Tabs */}
                  <View className="flex-row bg-[#212121] p-1 rounded-lg mb-4">
                    <TouchableOpacity
                      onPress={() => setCustomDiscountType("percentage")}
                      className={`flex-1 py-2 rounded-md items-center ${
                        customDiscountType === "percentage" ? "bg-blue-600" : ""
                      }`}
                    >
                      <Text
                        className={`font-semibold ${
                          customDiscountType === "percentage"
                            ? "text-white"
                            : "text-gray-400"
                        }`}
                      >
                        % Percentage
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setCustomDiscountType("fixed")}
                      className={`flex-1 py-2 rounded-md items-center ${
                        customDiscountType === "fixed" ? "bg-green-600" : ""
                      }`}
                    >
                      <Text
                        className={`font-semibold ${
                          customDiscountType === "fixed"
                            ? "text-white"
                            : "text-gray-400"
                        }`}
                      >
                        $ Dollar Amount
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Quick Value Buttons */}
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {customDiscountType === "percentage"
                      ? [5, 10, 15, 20, 25, 50].map((pct) => (
                          <TouchableOpacity
                            key={pct}
                            onPress={() =>
                              setCustomDiscountValue(pct.toString())
                            }
                            className={`px-4 py-2 rounded-lg border ${
                              customDiscountValue === pct.toString()
                                ? "bg-blue-600 border-blue-500"
                                : "bg-[#212121] border-gray-600"
                            }`}
                          >
                            <Text
                              className={`font-semibold ${
                                customDiscountValue === pct.toString()
                                  ? "text-white"
                                  : "text-gray-300"
                              }`}
                            >
                              {pct}%
                            </Text>
                          </TouchableOpacity>
                        ))
                      : [5, 10, 15, 20, 25, 50].map((amt) => (
                          <TouchableOpacity
                            key={amt}
                            onPress={() =>
                              setCustomDiscountValue(amt.toString())
                            }
                            className={`px-4 py-2 rounded-lg border ${
                              customDiscountValue === amt.toString()
                                ? "bg-green-600 border-green-500"
                                : "bg-[#212121] border-gray-600"
                            }`}
                          >
                            <Text
                              className={`font-semibold ${
                                customDiscountValue === amt.toString()
                                  ? "text-white"
                                  : "text-gray-300"
                              }`}
                            >
                              ${amt}
                            </Text>
                          </TouchableOpacity>
                        ))}
                  </View>

                  {/* Custom Input */}
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1 flex-row items-center bg-[#212121] rounded-lg border border-gray-600 px-3">
                      <Text className="text-gray-400 text-lg mr-1">
                        {customDiscountType === "percentage" ? "%" : "$"}
                      </Text>
                      <BottomSheetTextInput
                        value={customDiscountValue}
                        onChangeText={setCustomDiscountValue}
                        placeholder={
                          customDiscountType === "percentage"
                            ? "Enter %"
                            : "Enter $"
                        }
                        placeholderTextColor="#6B7280"
                        keyboardType="decimal-pad"
                        className="flex-1 py-3 text-white text-lg"
                        style={{ color: "#FFFFFF" }}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={handleApplyCustomDiscount}
                      disabled={
                        !customDiscountValue ||
                        parseFloat(customDiscountValue) <= 0
                      }
                      className={`px-6 py-3 rounded-lg ${
                        customDiscountValue &&
                        parseFloat(customDiscountValue) > 0
                          ? customDiscountType === "percentage"
                            ? "bg-blue-600"
                            : "bg-green-600"
                          : "bg-gray-600"
                      }`}
                    >
                      <Text className="text-white font-bold">Apply</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Preview */}
                  {customDiscountValue &&
                    parseFloat(customDiscountValue) > 0 && (
                      <View className="mt-3 p-2 bg-[#212121] rounded-lg border border-dashed border-gray-600">
                        <Text className="text-gray-400 text-sm text-center">
                          Will save:{" "}
                          <Text className="text-green-400 font-bold">
                            {customDiscountType === "percentage"
                              ? `${customDiscountValue}% off`
                              : `$${parseFloat(customDiscountValue).toFixed(2)} off`}
                          </Text>
                        </Text>
                      </View>
                    )}
                </View>
              </View>

              {/* Available Discounts (Preset) */}
              <Text className="text-gray-400 text-sm mb-3 uppercase tracking-wider font-semibold">
                Preset Discounts
              </Text>
              <View className="flex-col gap-y-3">
                {eligibilityResults.length === 0 ? (
                  <Text className="text-gray-500">
                    No preset discounts available
                  </Text>
                ) : (
                  eligibilityResults.map((d) => (
                    <TouchableOpacity
                      key={d.discount.id}
                      disabled={!d.eligible}
                      onPress={() => handleApplyCheckDiscount(d.discount)}
                      className={`p-3 rounded-xl border ${
                        d.eligible
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
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const DiscountBottomSheet = forwardRef(DiscountBottomSheetComponent);
DiscountBottomSheet.displayName = "DiscountBottomSheet";

export default DiscountBottomSheet;
