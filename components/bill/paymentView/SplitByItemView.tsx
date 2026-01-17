import { CartItem } from "@/lib/types";
import {
  calculateItemEffectiveCashPrice,
  useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  Banknote,
  Circle,
  CreditCard,
  Minus,
  Play,
  Plus,
  User,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * Get discounted values for a split item using the HYBRID approach:
 * - If split quantity equals original quantity, use the pre-calculated DB values
 * - If split quantity differs (partial assignment), calculate proportionally
 *
 * @param splitItem - The item in the split (may have different quantity than original)
 * @param originalItem - The original order item (has full quantity and discount_amount)
 * @param isCash - Whether to use cash pricing
 */
function getItemDiscountedValues(
  splitItem: CartItem,
  originalItem: CartItem | undefined,
  isCash: boolean = false
): { subtotal: number; discountAmount: number } {
  const splitQuantity = splitItem.quantity;
  const originalQuantity = originalItem?.quantity ?? splitItem.quantity;

  // Calculate unit price: for cash, use effective cash price (includes modifiers)
  const unitPrice = isCash
    ? calculateItemEffectiveCashPrice(splitItem)
    : splitItem.price;

  // Get order-level discount (from backend sync) - NOT the card/cash price difference
  // Only use actual discount_amount/discount_cash_amount from order-level discounts
  const originalDiscount = isCash
    ? (originalItem?.discount_cash_amount ?? 0)
    : (originalItem?.discount_amount ?? 0);

  // If split quantity equals original quantity and we have a pre-calculated DB subtotal with discount, use it
  // Only use cashSubtotal/subtotal if they are valid numbers (not undefined/NaN)
  if (splitQuantity === originalQuantity && originalDiscount > 0) {
    const preCalculatedSubtotal = isCash
      ? splitItem.cashSubtotal
      : splitItem.subtotal;
    if (preCalculatedSubtotal !== undefined && !isNaN(preCalculatedSubtotal)) {
      return {
        subtotal: preCalculatedSubtotal,
        discountAmount: originalDiscount,
      };
    }
  }

  // Calculate subtotal dynamically
  const grossSubtotal = unitPrice * splitQuantity;

  // Apply proportional discount if there's an order-level discount
  if (originalQuantity > 0 && originalDiscount > 0) {
    const perUnitDiscount = originalDiscount / originalQuantity;
    const itemDiscountAmount =
      Math.round(perUnitDiscount * splitQuantity * 100) / 100;
    return {
      subtotal: Math.round((grossSubtotal - itemDiscountAmount) * 100) / 100,
      discountAmount: itemDiscountAmount,
    };
  }

  // No order-level discount - just return gross subtotal
  return {
    subtotal: Math.round(grossSubtotal * 100) / 100,
    discountAmount: 0,
  };
}

// Helper function to calculate tax for split items using CARD pricing
// Uses hybrid approach: DB values for full quantities, proportional for partial
function calculateSplitTax(
  items: CartItem[],
  taxRatesMap: Record<string, number>,
  masterItems: CartItem[] // Original order items to look up original quantities
): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  let tax = 0;

  // Build map for fast lookup of original items
  const originalItemsMap = new Map(masterItems.map((item) => [item.id, item]));

  for (const item of items) {
    const originalItem = originalItemsMap.get(item.id);
    const { subtotal: itemSubtotal, discountAmount } = getItemDiscountedValues(
      item,
      originalItem,
      false
    );
    subtotal += itemSubtotal;

    // Skip tax-exempt items
    if (item.is_tax_exempt) continue;

    // Get the tax rate for this item's category (default to "standard" if not set)
    const taxCategory = item.tax_category || "standard";
    const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
    const taxRateDecimal = taxRatePercent / 100;

    // Calculate tax on discounted subtotal
    tax += itemSubtotal * taxRateDecimal;
  }

  // Round to 2 decimal places
  subtotal = Math.round(subtotal * 100) / 100;
  tax = Math.round(tax * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  return { subtotal, tax, total };
}

// Helper function to calculate tax for split items using CASH pricing
// Uses hybrid approach: DB values for full quantities, proportional for partial
function calculateSplitCashTax(
  items: CartItem[],
  taxRatesMap: Record<string, number>,
  masterItems: CartItem[] // Original order items to look up original quantities
): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  let tax = 0;

  // Build map for fast lookup of original items
  const originalItemsMap = new Map(masterItems.map((item) => [item.id, item]));

  for (const item of items) {
    const originalItem = originalItemsMap.get(item.id);
    const { subtotal: itemSubtotal } = getItemDiscountedValues(
      item,
      originalItem,
      true
    );
    subtotal += itemSubtotal;

    // Skip tax-exempt items
    if (item.is_tax_exempt) continue;

    // Get the tax rate for this item's category (default to "standard" if not set)
    const taxCategory = item.tax_category || "standard";
    const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
    const taxRateDecimal = taxRatePercent / 100;

    // Calculate tax on discounted subtotal
    tax += itemSubtotal * taxRateDecimal;
  }

  // Round to 2 decimal places
  subtotal = Math.round(subtotal * 100) / 100;
  tax = Math.round(tax * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  return { subtotal, tax, total };
}

const SplitByItemView = () => {
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const ordersById = useOrderStore((state) => state.ordersById);
  const ordersByDbId = useOrderStore((state) => state.ordersByDbId);
  const taxRatesMap = useStoreSettingsStore((state) => state.taxRatesMap);

  const {
    splits,
    addSplit,
    removeSplit,
    assignItemToSplit,
    unassignItemFromSplit,
    updateSplitCustomerName,
    setView,
    startSplitPaymentFlow,
    resetSplits,
  } = usePaymentStore();

  const [activeSplitId, setActiveSplitId] = useState<string | null>(null);

  // Initialize first guest
  useEffect(() => {
    if (splits.length === 0) {
      addSplit("Guest 1");
    } else if (!activeSplitId && splits.length > 0) {
      setActiveSplitId(splits[0].id);
    }
  }, [splits.length]);

  // Sync active split
  useEffect(() => {
    if (
      splits.length > 0 &&
      activeSplitId &&
      !splits.find((s) => s.id === activeSplitId)
    ) {
      setActiveSplitId(splits[0].id);
    }
  }, [splits, activeSplitId]);

  const activeOrder = useMemo(
    () => (activeOrderId ? ordersById[activeOrderId] : null),
    [ordersById, activeOrderId]
  );

  // Filter out voided items - they should not be included in splits
  const masterItems = useMemo(
    () => (activeOrder?.items || []).filter((item) => !item.is_voided),
    [activeOrder?.items]
  );
  // console.log('[activeOrder | SplitByItemView] activeOrder', activeOrder);

  // --- LOGIC: Calculate Item Distribution ---
  const itemData = useMemo(() => {
    return masterItems.map((item) => {
      const currentSplit = splits.find((s) => s.id === activeSplitId);
      const qtyInCurrent =
        currentSplit?.items.find((i) => i.id === item.id)?.quantity || 0;

      let totalAssigned = 0;
      splits.forEach((s) => {
        const found = s.items.find((i) => i.id === item.id);
        if (found) totalAssigned += found.quantity;
      });

      const qtyRemaining = item.quantity - totalAssigned;

      return {
        ...item,
        qtyInCurrent,
        qtyRemaining,
        totalAssigned,
        isFullyAssigned: item.quantity === totalAssigned,
      };
    });
  }, [masterItems, splits, activeSplitId]);

  const activeSplit = splits.find((s) => s.id === activeSplitId);

  // Calculate split totals with tax (CARD pricing)
  // Uses hybrid approach: DB values for full quantities, proportional for partial
  const activeSplitTotals = activeSplit
    ? calculateSplitTax(
        activeSplit.items,
        taxRatesMap,
        masterItems // Pass master items to look up original quantities/discounts
      )
    : { subtotal: 0, tax: 0, total: 0 };

  // Calculate split totals with tax (CASH pricing)
  // Uses hybrid approach: DB values for full quantities, proportional for partial
  const activeSplitCashTotals = activeSplit
    ? calculateSplitCashTax(
        activeSplit.items,
        taxRatesMap,
        masterItems // Pass master items to look up original quantities/discounts
      )
    : { subtotal: 0, tax: 0, total: 0 };

  // Calculate savings when paying cash vs card
  const cashSavings = Math.max(
    0,
    activeSplitTotals.total - activeSplitCashTotals.total
  );

  // Calculate global remaining items to control button state
  const globalRemainingItems = itemData.reduce(
    (acc, item) => acc + item.qtyRemaining,
    0
  );
  const isAllAssigned = globalRemainingItems === 0;

  const handleAddGuest = () => {
    addSplit(`Guest ${splits.length + 1}`);
  };

  const handleAddToGuest = (item: (typeof itemData)[0]) => {
    if (!activeSplitId || item.qtyRemaining <= 0) return;
    assignItemToSplit(activeSplitId, { ...item, quantity: 1 });
  };

  const handleRemoveFromGuest = (item: (typeof itemData)[0]) => {
    if (!activeSplitId || item.qtyInCurrent <= 0) return;
    unassignItemFromSplit(activeSplitId, item.id);
  };

  const handleStartPayment = () => {
    if (isAllAssigned) {
      startSplitPaymentFlow("split-by-item");
    }
  };

  const handleGoBack = () => {
    resetSplits();
    setView("split-options");
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* 1. Header */}
      <View className="flex-row items-center p-4 border-b border-[#333] h-[70px]">
        <TouchableOpacity
          onPress={handleGoBack}
          className="p-2 bg-[#333] rounded-lg mr-4"
        >
          <ArrowLeft size={20} color="white" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-bold text-white">Split by Item</Text>
          <Text className="text-gray-400 text-xs">Assign items to guests</Text>
        </View>

        {/* Removed 'Done' button from header */}
      </View>

      {/* 2. Guest Tabs */}
      <View className="h-[70px] bg-[#1a1a1a] border-b border-[#333]">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            onPress={handleAddGuest}
            className="flex-row items-center px-4 py-2 mx-2 rounded-full border border-[#444] bg-[#2a2a2a]"
          >
            <Plus size={18} color="#fff" />
            <Text className="ml-2 text-white font-semibold">Add</Text>
          </TouchableOpacity>

          {splits.map((split) => {
            const isActive = split.id === activeSplitId;
            return (
              <TouchableOpacity
                key={split.id}
                onPress={() => setActiveSplitId(split.id)}
                className={`flex-row items-center px-4 py-2 mr-2 rounded-full border ${
                  isActive
                    ? "bg-blue-600 border-blue-500"
                    : "bg-[#2a2a2a] border-[#333]"
                }`}
              >
                <User size={16} color={isActive ? "white" : "#9ca3af"} />
                <Text
                  className={`ml-2 font-semibold ${
                    isActive ? "text-white" : "text-gray-400"
                  }`}
                >
                  {split.customerName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Active Guest Summary */}
      {activeSplit && (
        <View className="p-4 bg-[#262626] border-b border-[#333]">
          <View className="flex-row justify-between items-start mb-3">
            <View>
              <TextInput
                className="text-2xl font-bold text-white border-b border-[#444] pb-1 min-w-[150px]"
                value={activeSplit.customerName}
                onChangeText={(t) => updateSplitCustomerName(activeSplit.id, t)}
                placeholderTextColor="#555"
              />
              <Text className="text-gray-400 text-xs mt-1">
                Tap items below to assign
              </Text>
            </View>
            <View className="items-end">
              <View className="flex-row items-center gap-2">
                <Text className="text-gray-500 text-xs">Subtotal:</Text>
                <Text className="text-gray-300 text-sm">
                  ${activeSplitTotals.subtotal.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="text-gray-500 text-xs">Tax:</Text>
                <Text className="text-gray-300 text-sm">
                  ${activeSplitTotals.tax.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>

          {/* Dual Pricing Display - Card vs Cash */}
          {activeSplit.items.length > 0 && (
            <View className="flex-row gap-2">
              {/* Card Payment Option */}
              <View className="flex-1 flex-row justify-between items-center py-2 px-3 bg-[#1A1A1A] rounded-xl border border-[#333]">
                <View className="flex-row items-center">
                  <CreditCard size={16} color="#60A5FA" />
                  <Text className="text-gray-400 text-xs ml-2">Card</Text>
                </View>
                <Text className="text-lg font-bold text-blue-400">
                  ${activeSplitTotals.total.toFixed(2)}
                </Text>
              </View>

              {/* Cash Payment Option */}
              <View className="flex-1 flex-row justify-between items-center py-2 px-3 bg-[#1A1A1A] rounded-xl border border-green-900/50">
                <View className="flex-row items-center">
                  <Banknote size={16} color="#10B981" />
                  <Text className="text-gray-400 text-xs ml-2">Cash</Text>
                  {cashSavings > 0.01 && (
                    <View className="ml-1 px-1.5 py-0.5 bg-green-900/30 rounded-full">
                      <Text className="text-green-400 text-[10px] font-bold">
                        -${cashSavings.toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-lg font-bold text-green-400">
                  ${activeSplitCashTotals.total.toFixed(2)}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 4. Main Item List */}
      <View className="flex-1 bg-[#1F1F1F]">
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {itemData.map((item) => {
            const isSelected = item.qtyInCurrent > 0;
            const isFullyAssignedToOthers =
              item.qtyRemaining === 0 && item.qtyInCurrent === 0;
            const canAdd = item.qtyRemaining > 0;
            const canRemove = item.qtyInCurrent > 0;

            return (
              <View
                key={item.id}
                className={`flex-row justify-between items-center p-4 border-b border-[#333] ${
                  isSelected
                    ? "bg-[#1e3a8a] border-[#2563eb]"
                    : isFullyAssignedToOthers
                      ? "bg-[#1A1A1A] opacity-40"
                      : "bg-[#262626]"
                }`}
              >
                {/* Item Info */}
                <View className="flex-1">
                  <Text
                    className={`text-lg font-semibold ${
                      isSelected
                        ? "text-white"
                        : isFullyAssignedToOthers
                          ? "text-gray-500"
                          : "text-gray-200"
                    }`}
                  >
                    {item.name}
                  </Text>
                  <Text
                    className={`text-sm mt-1 ${
                      isSelected ? "text-blue-200" : "text-gray-400"
                    }`}
                  >
                    ${item.price.toFixed(2)}
                  </Text>
                </View>

                {/* Quantity Controls */}
                <View className="items-end gap-1">
                  {isFullyAssignedToOthers ? (
                    <Text className="text-gray-500 italic text-xs">
                      Assigned to others
                    </Text>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      {/* Minus Button */}
                      <TouchableOpacity
                        onPress={() => handleRemoveFromGuest(item)}
                        disabled={!canRemove}
                        className={`w-8 h-8 rounded-full items-center justify-center ${
                          canRemove
                            ? "bg-red-600 active:bg-red-700"
                            : "bg-[#333] opacity-30"
                        }`}
                      >
                        <Minus size={16} color={canRemove ? "white" : "#666"} />
                      </TouchableOpacity>

                      {/* Quantity Badge */}
                      <View
                        className={`min-w-[36px] px-2 py-1 rounded-md items-center ${
                          isSelected ? "bg-blue-600" : "bg-[#333]"
                        }`}
                      >
                        <Text
                          className={`text-sm font-bold ${
                            isSelected ? "text-white" : "text-gray-500"
                          }`}
                        >
                          {item.qtyInCurrent}x
                        </Text>
                      </View>

                      {/* Plus Button */}
                      <TouchableOpacity
                        onPress={() => handleAddToGuest(item)}
                        disabled={!canAdd}
                        className={`w-8 h-8 rounded-full items-center justify-center ${
                          canAdd
                            ? "bg-green-600 active:bg-green-700"
                            : "bg-[#333] opacity-30"
                        }`}
                      >
                        <Plus size={16} color={canAdd ? "white" : "#666"} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Status Text */}
                  {item.qtyRemaining > 0 && !isFullyAssignedToOthers && (
                    <Text className="text-blue-400 text-xs font-medium mt-1">
                      {item.qtyRemaining} left
                    </Text>
                  )}
                  {item.qtyRemaining === 0 && isSelected && (
                    <Text className="text-green-400 text-xs font-medium mt-1">
                      ✓ All assigned
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </BottomSheetScrollView>
      </View>

      {/* 5. Footer Action: PAY ALL SPLITS */}
      <View className="p-4 bg-[#212121] border-t border-[#333]">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-gray-400 text-sm">Items Remaining</Text>
          <Text
            className={`font-bold ${
              globalRemainingItems > 0 ? "text-red-400" : "text-green-400"
            }`}
          >
            {globalRemainingItems}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleStartPayment}
          disabled={!isAllAssigned}
          className={`flex-row items-center justify-center py-4 rounded-xl gap-2 ${
            isAllAssigned
              ? "bg-blue-600 active:bg-blue-700"
              : "bg-[#333] opacity-80"
          }`}
        >
          {isAllAssigned ? (
            <Play size={20} color="white" fill="white" className="mr-1" />
          ) : (
            <Circle size={20} color="#666" className="mr-1" />
          )}
          <Text
            className={`text-lg font-bold ${
              isAllAssigned ? "text-white" : "text-gray-500"
            }`}
          >
            {isAllAssigned ? "Start Payment Flow" : "Assign All Items to Pay"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SplitByItemView;
