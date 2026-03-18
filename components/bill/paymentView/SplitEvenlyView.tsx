import { colors } from "@/lib/theme";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { usePaymentStore } from "@/stores/usePaymentStore";
import {
  ArrowLeft,
  Banknote,
  Check,
  CreditCard,
  Minus,
  Plus,
  Users,
} from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const SplitEvenlyView = () => {
  const setView = usePaymentStore((s) => s.setView);
  const splitEvenly = usePaymentStore((s) => s.splitEvenly);
  const startSplitPaymentFlow = usePaymentStore((s) => s.startSplitPaymentFlow);
  const resetSplits = usePaymentStore((s) => s.resetSplits);
  const orderTotals = useActiveOrderTotals();
  const activeOrderOutstandingTotal = orderTotals?.amountDue ?? 0;
  const activeOrderTotal = orderTotals?.total ?? 0;
  const activeOrderOutstandingCash = orderTotals?.cashAmountDue ?? 0;
  const activeOrderTotalCash = orderTotals?.cashTotal ?? 0;
  const activeOrderOutstandingSubtotal = orderTotals?.outstandingSubtotal ?? 0;
  const activeOrderOutstandingTax = orderTotals?.outstandingTax ?? 0;
  const activeOrderSubtotal = orderTotals?.subtotal ?? 0;
  const activeOrderTax = orderTotals?.tax ?? 0;

  const [numberOfPeople, setNumberOfPeople] = useState(2);

  // Card pricing: Fallback to activeOrderTotal if outstandingTotal is 0 (handles async timing)
  const effectiveCardTotal =
    activeOrderOutstandingTotal > 0
      ? activeOrderOutstandingTotal
      : activeOrderTotal;

  // Cash pricing: Fallback to activeOrderTotalCash if outstandingCash is 0
  const effectiveCashTotal =
    activeOrderOutstandingCash > 0
      ? activeOrderOutstandingCash
      : activeOrderTotalCash;

  // Subtotal and Tax: Fallback to full amounts if outstanding is 0
  const effectiveSubtotal =
    activeOrderOutstandingSubtotal > 0
      ? activeOrderOutstandingSubtotal
      : activeOrderSubtotal;
  const effectiveTax =
    activeOrderOutstandingTax > 0
      ? activeOrderOutstandingTax
      : activeOrderTax;

  // Calculate per-person amounts for both pricing models
  const cardAmountPerPerson = effectiveCardTotal / numberOfPeople;
  const cashAmountPerPerson = effectiveCashTotal / numberOfPeople;

  // Calculate per-person breakdown (subtotal, tax, total)
  const subtotalPerPerson = effectiveSubtotal / numberOfPeople;
  const taxPerPerson = effectiveTax / numberOfPeople;

  // Calculate savings when paying cash vs card
  const cashSavingsPerPerson = Math.max(0, cardAmountPerPerson - cashAmountPerPerson);

  // For display, use card pricing as default (matches existing UX)
  const effectiveTotal = effectiveCardTotal;
  const amountPerPerson = cardAmountPerPerson;

  const handleIncrement = () => {
    if (numberOfPeople < 20) setNumberOfPeople((p) => p + 1);
  };

  const handleDecrement = () => {
    if (numberOfPeople > 2) setNumberOfPeople((p) => p - 1);
  };

  const handleGoBack = () => {
    resetSplits();
    setView("split-options");
  };

  const handleConfirmSplit = () => {
    // 1. Logic: Create the splits in the store with both card and cash amounts
    splitEvenly(numberOfPeople, cardAmountPerPerson, cashAmountPerPerson);

    // 2. Flow: Start paying for Guest 1 immediately
    startSplitPaymentFlow("split-evenly");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity
          onPress={handleGoBack}
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginRight: 14 }}
        >
          <ArrowLeft size={18} color={colors.label} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.heading }}>Split Evenly</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>Divide the total bill equally.</Text>
        </View>
      </View>

      {/* Main Content */}
      <View style={{ flex: 1, flexDirection: "row", padding: 20, gap: 16 }}>
        {/* LEFT: Controls */}
        <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 20, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" }}>
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${colors.teal}15`, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              <Users size={30} color={colors.teal} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.label, marginBottom: 28 }}>Number of People</Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 28 }}>
              <TouchableOpacity
                onPress={handleDecrement}
                disabled={numberOfPeople <= 2}
                style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: numberOfPeople <= 2 ? colors.border : colors.label, backgroundColor: colors.screen, opacity: numberOfPeople <= 2 ? 0.4 : 1 }}
              >
                <Minus size={32} color={numberOfPeople <= 2 ? colors.muted : colors.heading} />
              </TouchableOpacity>

              <Text style={{ fontSize: 80, fontWeight: "700", color: colors.heading, width: 100, textAlign: "center" }}>{numberOfPeople}</Text>

              <TouchableOpacity
                onPress={handleIncrement}
                style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.label, backgroundColor: colors.screen }}
              >
                <Plus size={32} color={colors.heading} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* RIGHT: Summary & Action */}
        <View style={{ flex: 1, justifyContent: "space-between" }}>
          <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24, justifyContent: "center", marginBottom: 16 }}>
            {/* Total Bill */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "500" }}>Total Bill</Text>
              <Text style={{ fontSize: 26, fontWeight: "700", color: colors.label }}>${effectiveTotal.toFixed(2)}</Text>
            </View>

            {/* Per Person */}
            <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "500", marginBottom: 14 }}>Per Person Breakdown</Text>

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Subtotal</Text>
              <Text style={{ color: colors.label, fontSize: 15 }}>${subtotalPerPerson.toFixed(2)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Tax</Text>
              <Text style={{ color: colors.label, fontSize: 15 }}>${taxPerPerson.toFixed(2)}</Text>
            </View>

            {/* Card vs Cash */}
            <View style={{ gap: 8, marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.screen, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <CreditCard size={18} color={colors.teal} />
                  <Text style={{ color: colors.label, fontWeight: "500" }}>Card Payment</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: "700", color: colors.teal }}>${cardAmountPerPerson.toFixed(2)}</Text>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.screen, borderRadius: 12, borderWidth: 1, borderColor: `${colors.success}40` }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Banknote size={18} color={colors.success} />
                  <Text style={{ color: colors.label, fontWeight: "500" }}>Cash Payment</Text>
                  {cashSavingsPerPerson > 0 && (
                    <View style={{ marginLeft: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: `${colors.success}20`, borderRadius: 10 }}>
                      <Text style={{ color: colors.success, fontSize: 11, fontWeight: "700" }}>SAVE ${cashSavingsPerPerson.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 20, fontWeight: "700", color: colors.success }}>${cashAmountPerPerson.toFixed(2)}</Text>
              </View>
            </View>

            <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center" }}>Each guest can choose their payment method</Text>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            onPress={handleConfirmSplit}
            style={{ width: "100%", paddingVertical: 18, backgroundColor: colors.teal, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
          >
            <Check size={22} color="#000" />
            <Text style={{ fontWeight: "700", fontSize: 18, color: "#000" }}>
              Create {numberOfPeople} Splits
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default SplitEvenlyView;
