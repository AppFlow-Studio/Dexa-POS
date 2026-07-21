import { useUiScale } from "@/lib/uiScale";
import { payableQuantity } from "@/lib/payableQuantity";
import { colors } from "@/lib/theme";
import { CartItem } from "@/lib/types";
import { aggregateTaxByCategory, round2 } from '@/utils/money';
import {
  calculateItemEffectiveCashPrice,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useSeatingStore } from "@/stores/useSeatingStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  ArrowLeft,
  Banknote,
  Check,
  Circle,
  CreditCard,
  Minus,
  Play,
  Plus,
  Trash2,
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

  // Calculate subtotal dynamically
  const grossSubtotal = unitPrice * splitQuantity;

  // Apply proportional discount if there's an order-level discount
  if (originalQuantity > 0 && originalDiscount > 0) {
    const perUnitDiscount = originalDiscount / originalQuantity;
    const itemDiscountAmount =
      round2(perUnitDiscount * splitQuantity);
    return {
      subtotal: round2(grossSubtotal - itemDiscountAmount),
      discountAmount: itemDiscountAmount,
    };
  }

  // No order-level discount - just return gross subtotal
  return {
    subtotal: round2(grossSubtotal),
    discountAmount: 0,
  };
}

// Helper function to calculate tax for split items using CARD pricing
function calculateSplitTax(
  items: CartItem[],
  taxRatesMap: Record<string, number>,
  masterItems: CartItem[],
): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  const taxLines: Array<{
    netSubtotal: number;
    taxCategory?: string | null;
    isTaxExempt?: boolean;
  }> = [];

  const originalItemsMap = new Map(masterItems.map((item) => [item.id, item]));

  for (const item of items) {
    const originalItem = originalItemsMap.get(item.id);
    const { subtotal: itemSubtotal } = getItemDiscountedValues(
      item,
      originalItem,
      false,
    );
    subtotal += itemSubtotal;
    taxLines.push({
      netSubtotal: itemSubtotal,
      taxCategory: item.tax_category,
      isTaxExempt: item.is_tax_exempt,
    });
  }

  subtotal = round2(subtotal);
  // v6: aggregate tax per rate group (round once per group), matches server.
  const tax = aggregateTaxByCategory(taxLines, taxRatesMap);
  const total = round2(subtotal + tax);

  return { subtotal, tax, total };
}

// Helper function to calculate tax for split items using CASH pricing
function calculateSplitCashTax(
  items: CartItem[],
  taxRatesMap: Record<string, number>,
  masterItems: CartItem[],
): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  const taxLines: Array<{
    netSubtotal: number;
    taxCategory?: string | null;
    isTaxExempt?: boolean;
  }> = [];

  const originalItemsMap = new Map(masterItems.map((item) => [item.id, item]));

  for (const item of items) {
    const originalItem = originalItemsMap.get(item.id);
    const { subtotal: itemSubtotal } = getItemDiscountedValues(
      item,
      originalItem,
      true,
    );
    subtotal += itemSubtotal;
    taxLines.push({
      netSubtotal: itemSubtotal,
      taxCategory: item.tax_category,
      isTaxExempt: item.is_tax_exempt,
    });
  }

  subtotal = round2(subtotal);
  // v6: aggregate tax per rate group on the cash base (round once per group).
  const tax = aggregateTaxByCategory(taxLines, taxRatesMap);
  const total = round2(subtotal + tax);

  return { subtotal, tax, total };
}

const SplitByItemView = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const activeOrderOutstandingTotal = useOrderStore(
    (state) => state.activeOrderOutstandingTotal,
  );
  const activeOrderOutstandingCash = useOrderStore(
    (state) => state.activeOrderOutstandingCash,
  );
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

  // Initialize guests
  useEffect(() => {
    if (splits.length > 0) {
      if (!activeSplitId && splits.length > 0) {
        setActiveSplitId(splits[0].id);
      }
      return;
    }

    const orderId = activeOrderId;
    const seatingState = orderId
      ? useSeatingStore.getState().getForOrder(orderId)
      : null;
    const itemSeatMap = seatingState?.itemSeatMap ?? {};

    const hasSeatInfo =
      Object.keys(itemSeatMap).length > 0 ||
      masterItems.some(
        (item) => item.seatNumber !== undefined && item.seatNumber !== null,
      );

    if (!hasSeatInfo) {
      addSplit("Guest 1");
      return;
    }

    const seatGroups: Record<string, CartItem[]> = {};
    for (const item of masterItems) {
      const seat = item.seatNumber ?? itemSeatMap[item.id] ?? null;
      const key = seat === null ? "shared" : String(seat);
      if (!seatGroups[key]) seatGroups[key] = [];
      seatGroups[key].push(item);
    }

    const seatKeys = Object.keys(seatGroups);
    const numbered = seatKeys.filter(k => k !== "shared").map(Number).sort((a, b) => a - b);
    const sorted: string[] = numbered.map(String);
    if (seatGroups["shared"]) sorted.push("shared");

    if (sorted.length === 0) {
      addSplit("Guest 1");
      return;
    }

    const newSplits = sorted.map((key, idx) => {
      const name = key === "shared" ? "Shared" : `Seat ${key}`;
      const items = seatGroups[key]
        .filter(item => payableQuantity(item) > 0)
        .map(item => ({
          ...item,
          quantity: payableQuantity(item),
        }));
      return {
        id: `split_${Date.now()}_${idx}`,
        customerName: name,
        items,
        amount: 0,
        status: "pending" as const,
      };
    }).filter(split => split.items.length > 0);

    if (newSplits.length === 0) {
      addSplit("Guest 1");
      return;
    }

    usePaymentStore.setState({ splits: newSplits, isDirty: true });
    setActiveSplitId(newSplits[0].id);
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

  const activeOrder = useActiveOrder();

  const masterItems = useMemo(
    () => (activeOrder?.items || []).filter(
      (item) => !item.is_voided && payableQuantity(item) > 0
    ),
    [activeOrder?.items],
  );

  const itemData = useMemo(() => {
    return masterItems.map((item) => {
      const unpaidQty = payableQuantity(item);
      const currentSplit = splits.find((s) => s.id === activeSplitId);
      const qtyInCurrent =
        currentSplit?.items.find((i) => i.id === item.id)?.quantity || 0;

      let totalAssigned = 0;
      splits.forEach((s) => {
        const found = s.items.find((i) => i.id === item.id);
        if (found) totalAssigned += found.quantity;
      });

      const qtyRemaining = unpaidQty - totalAssigned;

      return {
        ...item,
        qtyInCurrent,
        qtyRemaining,
        totalAssigned,
        isFullyAssigned: unpaidQty === totalAssigned,
      };
    });
  }, [masterItems, splits, activeSplitId]);

  const activeSplit = splits.find((s) => s.id === activeSplitId);

  const allItemsCardTotals = calculateSplitTax(
    masterItems,
    taxRatesMap,
    masterItems,
  );
  const allItemsCashTotals = calculateSplitCashTax(
    masterItems,
    taxRatesMap,
    masterItems,
  );
  const cardRemainder = Math.max(
    0,
    activeOrderOutstandingTotal - allItemsCardTotals.total,
  );
  const cashRemainder = Math.max(
    0,
    activeOrderOutstandingCash - allItemsCashTotals.total,
  );
  const activeSplitItemTotals = activeSplit
    ? calculateSplitTax(
        activeSplit.items,
        taxRatesMap,
        masterItems,
      )
    : { subtotal: 0, tax: 0, total: 0 };
  const activeSplitCashItemTotals = activeSplit
    ? calculateSplitCashTax(
        activeSplit.items,
        taxRatesMap,
        masterItems,
      )
    : { subtotal: 0, tax: 0, total: 0 };
  const activeSplitRatio =
    allItemsCardTotals.total > 0
      ? activeSplitItemTotals.total / allItemsCardTotals.total
      : 0;

  const activeSplitTotals = {
    ...activeSplitItemTotals,
    total: round2(activeSplitItemTotals.total + cardRemainder * activeSplitRatio),
  };

  const activeSplitCashTotals = {
    ...activeSplitCashItemTotals,
    total: round2(activeSplitCashItemTotals.total + cashRemainder * activeSplitRatio),
  };

  const splitTotalsMap = useMemo(() => {
    const map: Record<string, { total: number }> = {};
    for (const split of splits) {
      const { total } = calculateSplitTax(split.items, taxRatesMap, masterItems);
      map[split.id] = {
        total: round2(
          total +
            cardRemainder *
              (allItemsCardTotals.total > 0
                ? total / allItemsCardTotals.total
                : 0),
        ),
      };
    }
    return map;
  }, [
    splits,
    taxRatesMap,
    masterItems,
    cardRemainder,
    allItemsCardTotals.total,
  ]);

  const cashSavings = Math.max(
    0,
    activeSplitTotals.total - activeSplitCashTotals.total,
  );

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
    if (activeOrder?.split_payment_path) {
      setView("payment-method-selection");
    } else {
      setView("split-options");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: s(14), paddingVertical: s(12), borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity
          onPress={handleGoBack}
          style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: `${colors.teal}10`, alignItems: "center", justifyContent: "center", marginRight: s(10) }}
        >
          <ArrowLeft size={s(16)} color={colors.teal} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}>Split by Items</Text>
          <Text style={{ fontSize: s(11), color: colors.muted }}>Assign items to each guest.</Text>
        </View>
      </View>

      {/* Main Content: Left-Right Split */}
      <View style={{ flex: 1, flexDirection: "row" }}>

        {/* LEFT PANEL — Guest List (30%) */}
        <View style={{ width: "30%", backgroundColor: colors.screen, borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: s(10), paddingVertical: s(10) }}>
          {/* Add Guest Button (pinned) */}
          <TouchableOpacity
            onPress={handleAddGuest}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: s(10), marginBottom: s(10), borderRadius: s(8), borderWidth: 1, borderColor: `${colors.teal}40`, backgroundColor: `${colors.teal}15`, gap: s(6) }}
          >
            <Plus size={s(15)} color={colors.teal} />
            <Text style={{ color: colors.teal, fontWeight: "700", fontSize: s(12) }}>Add Guest</Text>
          </TouchableOpacity>

          {/* Guest Cards (scrollable) */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {splits.map((split) => {
              const isActive = split.id === activeSplitId;
              const splitTotal = splitTotalsMap[split.id]?.total ?? 0;
              const itemCount = split.items.reduce((sum, i) => sum + i.quantity, 0);
              return (
                <TouchableOpacity
                  key={split.id}
                  onPress={() => setActiveSplitId(split.id)}
                  style={{
                    paddingVertical: s(10), paddingHorizontal: s(10), marginBottom: s(8), borderRadius: s(10), backgroundColor: isActive ? `${colors.teal}20` : colors.panel,
                    borderWidth: 1, borderColor: isActive ? `${colors.teal}50` : colors.border,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: s(6), marginBottom: s(4) }}>
                        <User size={s(13)} color={isActive ? colors.teal : colors.label} />
                        <Text style={{ fontWeight: "700", fontSize: s(12), color: colors.heading }} numberOfLines={1}>
                          {split.customerName}
                        </Text>
                      </View>
                      <Text style={{ color: colors.muted, fontSize: s(10), marginLeft: s(19) }}>
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                      </Text>
                    </View>
                    {splits.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeSplit(split.id)}
                        hitSlop={{ top: s(8), bottom: s(8), left: s(8), right: s(8) }}
                      >
                        <Trash2 size={s(14)} color={colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={{ fontSize: s(14), fontWeight: "700", color: isActive ? colors.teal : colors.heading, marginTop: s(6) }}>
                    ${splitTotal.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* RIGHT PANEL — Items + Summary + Action (70%) */}
        <View style={{ width: "70%", flex: 1 }}>

          {/* Paid summary banner */}
          {(activeOrder?.amount_paid ?? 0) > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: s(14), paddingVertical: s(9), backgroundColor: `${colors.success}10`, borderBottomWidth: 1, borderBottomColor: `${colors.success}40` }}>
              <Text style={{ fontSize: s(11), color: colors.success, fontWeight: "600" }}>
                ${(activeOrder?.amount_paid ?? 0).toFixed(2)} already paid. Showing remaining unpaid items.
              </Text>
            </View>
          )}

          {/* Active Guest Header (pinned) */}
          {activeSplit && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: s(14), paddingVertical: s(12), backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={{ fontSize: s(14), fontWeight: "700", color: colors.heading, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: s(8), paddingHorizontal: s(10), paddingVertical: s(6), marginBottom: s(4), minWidth: s(150) }}
                  value={activeSplit.customerName}
                  onChangeText={(t) => updateSplitCustomerName(activeSplit.id, t)}
                  placeholderTextColor={colors.muted}
                />
                <Text style={{ color: colors.muted, fontSize: s(10) }}>Tap items to assign</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: s(4) }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
                  <Text style={{ color: colors.muted, fontSize: s(11) }}>Subtotal:</Text>
                  <Text style={{ color: colors.heading, fontSize: s(12), fontWeight: "700" }}>${activeSplitTotals.subtotal.toFixed(2)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
                  <Text style={{ color: colors.muted, fontSize: s(11) }}>Tax:</Text>
                  <Text style={{ color: colors.heading, fontSize: s(12), fontWeight: "700" }}>${activeSplitTotals.tax.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Item List (scrollable) */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: s(8), paddingBottom: s(16) }}>
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
                    paddingHorizontal: s(12), paddingVertical: s(10), marginHorizontal: s(12), marginBottom: s(8), borderRadius: s(10), borderWidth: 1,
                    backgroundColor: isSelected ? `${colors.teal}10` : isFullyAssignedToOthers ? colors.screen : colors.panel,
                    borderColor: isSelected ? `${colors.teal}40` : colors.border,
                    opacity: isFullyAssignedToOthers ? 0.5 : 1,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: s(13), fontWeight: "700", color: isSelected ? colors.teal : isFullyAssignedToOthers ? colors.muted : colors.heading }}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: s(11), marginTop: s(2), color: colors.muted }}>
                      ${item.price.toFixed(2)}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: s(4) }}>
                    {isFullyAssignedToOthers ? (
                      <Text style={{ color: colors.muted, fontSize: s(10) }}>Assigned</Text>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
                        <TouchableOpacity
                          onPress={() => handleRemoveFromGuest(item)}
                          disabled={!canRemove}
                          style={{ width: s(26), height: s(26), borderRadius: s(13), alignItems: "center", justifyContent: "center", backgroundColor: canRemove ? colors.danger : colors.card, opacity: canRemove ? 1 : 0.5 }}
                        >
                          <Minus size={s(11)} color={canRemove ? colors.onSolid : colors.muted} />
                        </TouchableOpacity>

                        <View style={{ minWidth: s(30), paddingHorizontal: s(6), paddingVertical: s(2), borderRadius: s(6), alignItems: "center", backgroundColor: isSelected ? colors.teal : colors.card }}>
                          <Text style={{ fontSize: s(10), fontWeight: "700", color: isSelected ? colors.onSolid : colors.label }}>
                            {item.qtyInCurrent}x
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => handleAddToGuest(item)}
                          disabled={!canAdd}
                          style={{ width: s(26), height: s(26), borderRadius: s(13), alignItems: "center", justifyContent: "center", backgroundColor: colors.teal, opacity: canAdd ? 1 : 0.4 }}
                        >
                          <Plus size={s(11)} color={colors.onSolid} />
                        </TouchableOpacity>
                      </View>
                    )}

                    {item.qtyRemaining > 0 && !isFullyAssignedToOthers && (
                      <Text style={{ color: colors.teal, fontSize: s(10), fontWeight: "600" }}>{item.qtyRemaining} left</Text>
                    )}
                    {item.qtyRemaining === 0 && isSelected && (
                      <Check size={s(16)} color={colors.success} />
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Card/Cash Totals Strip */}
          {activeSplit && activeSplit.items.length > 0 && (
            <View style={{ flexDirection: "row", gap: s(10), paddingHorizontal: s(12), paddingVertical: s(10), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.panel }}>
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: s(10), paddingHorizontal: s(12), backgroundColor: colors.screen, borderRadius: s(10), borderWidth: 1, borderColor: `${colors.teal}40` }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
                  <CreditCard size={s(14)} color={colors.teal} />
                  <Text style={{ color: colors.muted, fontSize: s(11) }}>Card</Text>
                </View>
                <Text style={{ fontSize: s(14), fontWeight: "700", color: colors.teal }}>${activeSplitTotals.total.toFixed(2)}</Text>
              </View>

              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: s(10), paddingHorizontal: s(12), backgroundColor: colors.screen, borderRadius: s(10), borderWidth: 1, borderColor: `${colors.success}40` }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
                  <Banknote size={s(14)} color={colors.success} />
                  <Text style={{ color: colors.muted, fontSize: s(11) }}>Cash</Text>
                  {cashSavings > 0.01 && (
                    <View style={{ marginLeft: s(4), paddingHorizontal: s(5), paddingVertical: s(2), backgroundColor: `${colors.success}20`, borderRadius: s(8) }}>
                      <Text style={{ color: colors.success, fontSize: s(9), fontWeight: "700" }}>-${cashSavings.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: s(14), fontWeight: "700", color: colors.success }}>${activeSplitCashTotals.total.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Footer */}
          <View style={{ paddingHorizontal: s(12), paddingVertical: s(10), backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: s(10) }}>
              <Text style={{ color: colors.muted, fontSize: s(12) }}>Items Remaining</Text>
              <Text style={{ fontWeight: "700", fontSize: s(16), color: globalRemainingItems > 0 ? colors.danger : colors.success }}>
                {globalRemainingItems}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleStartPayment}
              disabled={!isAllAssigned}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: s(10), borderRadius: s(8), gap: s(6),
                backgroundColor: isAllAssigned ? colors.teal : colors.screen,
                borderWidth: isAllAssigned ? 0 : 1, borderColor: colors.border,
                opacity: isAllAssigned ? 1 : 0.6,
              }}
            >
              {isAllAssigned
                ? <Play size={s(13)} color={colors.onSolid} fill={colors.onSolid} />
                : <Circle size={s(13)} color={colors.muted} />
              }
              <Text style={{ fontSize: s(13), fontWeight: "700", color: isAllAssigned ? colors.onSolid : colors.muted }}>
                {isAllAssigned ? "Start Payment" : "Assign All Items"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default SplitByItemView;