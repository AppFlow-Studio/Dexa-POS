import { colors } from "@/lib/theme";
import { CartItem } from "@/lib/types";
import {
  calculateItemEffectiveCashPrice,
  useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
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
  isCash: boolean = false,
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
  masterItems: CartItem[], // Original order items to look up original quantities
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
      false,
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
  masterItems: CartItem[], // Original order items to look up original quantities
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
      true,
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
  const taxRatesMap = useStoreSettingsStore((state) => state.taxRatesMap);

  const splits = usePaymentStore((s) => s.splits);
  const addSplit = usePaymentStore((s) => s.addSplit);
  const removeSplit = usePaymentStore((s) => s.removeSplit);
  const assignItemToSplit = usePaymentStore((s) => s.assignItemToSplit);
  const unassignItemFromSplit = usePaymentStore((s) => s.unassignItemFromSplit);
  const updateSplitCustomerName = usePaymentStore((s) => s.updateSplitCustomerName);
  const setView = usePaymentStore((s) => s.setView);
  const startSplitPaymentFlow = usePaymentStore((s) => s.startSplitPaymentFlow);
  const resetSplits = usePaymentStore((s) => s.resetSplits);

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
    [ordersById, activeOrderId],
  );

  // Filter out voided items - they should not be included in splits
  const masterItems = useMemo(
    () => (activeOrder?.items || []).filter((item) => !item.is_voided),
    [activeOrder?.items],
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
        masterItems, // Pass master items to look up original quantities/discounts
      )
    : { subtotal: 0, tax: 0, total: 0 };

  // Calculate split totals with tax (CASH pricing)
  // Uses hybrid approach: DB values for full quantities, proportional for partial
  const activeSplitCashTotals = activeSplit
    ? calculateSplitCashTax(
        activeSplit.items,
        taxRatesMap,
        masterItems, // Pass master items to look up original quantities/discounts
      )
    : { subtotal: 0, tax: 0, total: 0 };

  // Calculate savings when paying cash vs card
  const cashSavings = Math.max(
    0,
    activeSplitTotals.total - activeSplitCashTotals.total,
  );

  // Calculate global remaining items to control button state
  const globalRemainingItems = itemData.reduce(
    (acc, item) => acc + item.qtyRemaining,
    0,
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
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity
          onPress={handleGoBack}
          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginRight: 10 }}
        >
          <ArrowLeft size={16} color={colors.label} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Split by Item</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>Assign items to guests</Text>
        </View>
      </View>

      {/* Guest Tabs */}
      <View style={{ height: 70, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, alignItems: "center" }}
        >
          <TouchableOpacity
            onPress={handleAddGuest}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, gap: 6 }}
          >
            <Plus size={16} color={colors.teal} />
            <Text style={{ color: colors.teal, fontWeight: "600", fontSize: 13 }}>Add</Text>
          </TouchableOpacity>

          {splits.map((split) => {
            const isActive = split.id === activeSplitId;
            return (
              <TouchableOpacity
                key={split.id}
                onPress={() => setActiveSplitId(split.id)}
                style={{
                  flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderRadius: 20, borderWidth: 1, gap: 6,
                  backgroundColor: isActive ? `${colors.teal}15` : colors.panel,
                  borderColor: isActive ? colors.teal : colors.border,
                }}
              >
                <User size={14} color={isActive ? colors.teal : colors.label} />
                <Text style={{ fontWeight: "600", fontSize: 13, color: isActive ? colors.heading : colors.muted }}>
                  {split.customerName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Active Guest Summary */}
      {activeSplit && (
        <View style={{ padding: 16, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <View>
              <TextInput
                style={{ fontSize: 20, fontWeight: "700", color: colors.heading, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 4, minWidth: 150 }}
                value={activeSplit.customerName}
                onChangeText={(t) => updateSplitCustomerName(activeSplit.id, t)}
                placeholderTextColor={colors.muted}
              />
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Tap items below to assign</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 11 }}>Subtotal:</Text>
                <Text style={{ color: colors.label, fontSize: 13 }}>${activeSplitTotals.subtotal.toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 11 }}>Tax:</Text>
                <Text style={{ color: colors.label, fontSize: 13 }}>${activeSplitTotals.tax.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {activeSplit.items.length > 0 && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.screen, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <CreditCard size={15} color={colors.teal} />
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Card</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.teal }}>${activeSplitTotals.total.toFixed(2)}</Text>
              </View>

              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.screen, borderRadius: 12, borderWidth: 1, borderColor: `${colors.success}40` }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Banknote size={15} color={colors.success} />
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Cash</Text>
                  {cashSavings > 0.01 && (
                    <View style={{ marginLeft: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${colors.success}20`, borderRadius: 10 }}>
                      <Text style={{ color: colors.success, fontSize: 10, fontWeight: "700" }}>-${cashSavings.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.success }}>${activeSplitCashTotals.total.toFixed(2)}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Item List */}
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {itemData.map((item) => {
            const isSelected = item.qtyInCurrent > 0;
            const isFullyAssignedToOthers = item.qtyRemaining === 0 && item.qtyInCurrent === 0;
            const canAdd = item.qtyRemaining > 0;
            const canRemove = item.qtyInCurrent > 0;
            return (
              <View
                key={item.id}
                style={{
                  flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                  padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
                  backgroundColor: isSelected ? `${colors.teal}15` : isFullyAssignedToOthers ? colors.screen : colors.panel,
                  opacity: isFullyAssignedToOthers ? 0.4 : 1,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: isSelected ? colors.heading : isFullyAssignedToOthers ? colors.muted : colors.label }}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 13, marginTop: 2, color: isSelected ? colors.teal : colors.muted }}>
                    ${item.price.toFixed(2)}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  {isFullyAssignedToOthers ? (
                    <Text style={{ color: colors.muted, fontSize: 11, fontStyle: "italic" }}>Assigned to others</Text>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleRemoveFromGuest(item)}
                        disabled={!canRemove}
                        style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: canRemove ? colors.danger : colors.panel, opacity: canRemove ? 1 : 0.3 }}
                      >
                        <Minus size={14} color={canRemove ? "#fff" : colors.muted} />
                      </TouchableOpacity>

                      <View style={{ minWidth: 36, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignItems: "center", backgroundColor: isSelected ? colors.teal : colors.panel }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: isSelected ? "#000" : colors.muted }}>
                          {item.qtyInCurrent}x
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => handleAddToGuest(item)}
                        disabled={!canAdd}
                        style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: canAdd ? colors.success : colors.panel, opacity: canAdd ? 1 : 0.3 }}
                      >
                        <Plus size={14} color={canAdd ? "#fff" : colors.muted} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {item.qtyRemaining > 0 && !isFullyAssignedToOthers && (
                    <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "600" }}>{item.qtyRemaining} left</Text>
                  )}
                  {item.qtyRemaining === 0 && isSelected && (
                    <Text style={{ color: colors.success, fontSize: 11, fontWeight: "600" }}>✓ All assigned</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Footer */}
      <View style={{ padding: 16, backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Items Remaining</Text>
          <Text style={{ fontWeight: "700", fontSize: 15, color: globalRemainingItems > 0 ? colors.danger : colors.success }}>
            {globalRemainingItems}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleStartPayment}
          disabled={!isAllAssigned}
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 8, gap: 6,
            backgroundColor: isAllAssigned ? colors.teal : colors.panel,
            borderWidth: isAllAssigned ? 0 : 1, borderColor: colors.border,
            opacity: isAllAssigned ? 1 : 0.6,
          }}
        >
          {isAllAssigned
            ? <Play size={15} color="#000" fill="#000" />
            : <Circle size={15} color={colors.muted} />
          }
          <Text style={{ fontSize: 13, fontWeight: "700", color: isAllAssigned ? "#000" : colors.muted }}>
            {isAllAssigned ? "Start Payment Flow" : "Assign All Items to Pay"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SplitByItemView;
