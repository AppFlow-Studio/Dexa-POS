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
    <View className="flex-1 bg-panel">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-border shrink-0">
        <TouchableOpacity
          onPress={handleGoBack}
          className="p-2 bg-surface rounded-lg mr-4"
        >
          <ArrowLeft size={20} color="white" />
        </TouchableOpacity>
        <View>
          <Text className="text-2xl font-bold text-white">Split Evenly</Text>
          <Text className="text-gray-400">Divide the total bill equally.</Text>
        </View>
      </View>

      {/* Main Content - Side by Side Layout */}
      <View className="flex-1 flex-row p-6 gap-6">
        {/* LEFT: Controls (Input) */}
        <View className="flex-1 bg-surface rounded-3xl border border-border justify-center items-center">
          <View className="items-center">
            <View className="w-16 h-16 bg-teal/10 rounded-full items-center justify-center mb-6">
              <Users size={32} color={colors.teal} />
            </View>
            <Text className="text-xl font-semibold text-gray-300 mb-8">
              Number of People
            </Text>

            <View className="flex-row items-center gap-8">
              <TouchableOpacity
                onPress={handleDecrement}
                className={`w-20 h-20 rounded-full border-2 items-center justify-center ${numberOfPeople <= 2
                  ? "border-border bg-[#222]"
                  : "border-gray-500 bg-surface"
                  }`}
                disabled={numberOfPeople <= 2}
              >
                <Minus
                  size={36}
                  color={numberOfPeople <= 2 ? "#555" : "white"}
                />
              </TouchableOpacity>

              <Text className="text-8xl font-bold text-white w-32 text-center">
                {numberOfPeople}
              </Text>

              <TouchableOpacity
                onPress={handleIncrement}
                className="w-20 h-20 rounded-full border-2 border-gray-500 bg-surface items-center justify-center"
              >
                <Plus size={36} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* RIGHT: Financials & Action (Result) */}
        <View className="flex-1 justify-between">
          {/* Summary Card */}
          <View className="bg-surface rounded-3xl border border-border p-8 flex-1 justify-center mb-6">
            {/* Total Bill */}
            <View className="flex-row justify-between items-end mb-6 pb-6 border-b border-border">
              <Text className="text-gray-400 font-medium text-lg">
                Total Bill
              </Text>
              <Text className="text-3xl font-bold text-gray-300">
                ${effectiveTotal.toFixed(2)}
              </Text>
            </View>

            {/* Per Person Breakdown */}
            <View>
              <Text className="text-gray-400 font-medium text-lg mb-4">
                Per Person Breakdown
              </Text>

              {/* Subtotal per person */}
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-gray-500 text-sm">Subtotal</Text>
                <Text className="text-gray-300 text-lg">
                  ${subtotalPerPerson.toFixed(2)}
                </Text>
              </View>

              {/* Tax per person */}
              <View className="flex-row justify-between items-center mb-4 pb-4 border-b border-border">
                <Text className="text-gray-500 text-sm">Tax</Text>
                <Text className="text-gray-300 text-lg">
                  ${taxPerPerson.toFixed(2)}
                </Text>
              </View>

              {/* Dual Pricing Display - Card vs Cash */}
              <View className="mb-4">
                {/* Card Payment Option */}
                <View className="flex-row justify-between items-center py-3 px-4 bg-panel rounded-xl mb-2 border border-border">
                  <View className="flex-row items-center">
                    <CreditCard size={20} color={colors.teal} />
                    <Text className="text-gray-300 font-medium ml-3">
                      Card Payment
                    </Text>
                  </View>
                  <Text className="text-2xl font-bold text-teal">
                    ${cardAmountPerPerson.toFixed(2)}
                  </Text>
                </View>

                {/* Cash Payment Option */}
                <View className="flex-row justify-between items-center py-3 px-4 bg-panel rounded-xl border border-green-900/50">
                  <View className="flex-row items-center">
                    <Banknote size={20} color={colors.success} />
                    <Text className="text-gray-300 font-medium ml-3">
                      Cash Payment
                    </Text>
                    {cashSavingsPerPerson > 0 && (
                      <View className="ml-2 px-2 py-0.5 bg-green-900/30 rounded-full">
                        <Text className="text-green-400 text-xs font-bold">
                          SAVE ${cashSavingsPerPerson.toFixed(2)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-2xl font-bold text-green-400">
                    ${cashAmountPerPerson.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Info text */}
              <Text className="text-gray-500 text-xs text-center">
                Each guest can choose their payment method
              </Text>
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            onPress={handleConfirmSplit}
            className="w-full py-5 bg-teal rounded-2xl flex-row items-center justify-center shadow-lg shadow-teal/20 active:bg-teal/80"
          >
            <Check size={24} color="white" className="mr-3" />
            <Text className="font-bold text-xl text-white">
              Create {numberOfPeople} Splits
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default SplitEvenlyView;
