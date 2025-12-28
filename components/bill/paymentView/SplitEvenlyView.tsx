import { useOrderStore } from "@/stores/useOrderStore";
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
  const { setView, splitEvenly, startSplitPaymentFlow, resetSplits } =
    usePaymentStore();
  const {
    activeOrderOutstandingTotal,
    activeOrderTotal,
    activeOrderOutstandingCash,
    activeOrderTotalCash,
    // Tax breakdown for display
    activeOrderOutstandingSubtotal,
    activeOrderOutstandingTax,
    activeOrderSubtotal,
    activeOrderTax,
  } = useOrderStore();

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
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-[#333] shrink-0">
        <TouchableOpacity
          onPress={handleGoBack}
          className="p-2 bg-[#333] rounded-lg mr-4"
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
        <View className="flex-1 bg-[#2A2A2A] rounded-3xl border border-[#333] justify-center items-center">
          <View className="items-center">
            <View className="w-16 h-16 bg-blue-900/20 rounded-full items-center justify-center mb-6">
              <Users size={32} color="#60A5FA" />
            </View>
            <Text className="text-xl font-semibold text-gray-300 mb-8">
              Number of People
            </Text>

            <View className="flex-row items-center gap-8">
              <TouchableOpacity
                onPress={handleDecrement}
                className={`w-20 h-20 rounded-full border-2 items-center justify-center ${numberOfPeople <= 2
                  ? "border-[#444] bg-[#222]"
                  : "border-gray-500 bg-[#333]"
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
                className="w-20 h-20 rounded-full border-2 border-gray-500 bg-[#333] items-center justify-center"
              >
                <Plus size={36} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* RIGHT: Financials & Action (Result) */}
        <View className="flex-1 justify-between">
          {/* Summary Card */}
          <View className="bg-[#262626] rounded-3xl border border-[#333] p-8 flex-1 justify-center mb-6">
            {/* Total Bill */}
            <View className="flex-row justify-between items-end mb-6 pb-6 border-b border-[#333]">
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
              <View className="flex-row justify-between items-center mb-4 pb-4 border-b border-[#333]">
                <Text className="text-gray-500 text-sm">Tax</Text>
                <Text className="text-gray-300 text-lg">
                  ${taxPerPerson.toFixed(2)}
                </Text>
              </View>

              {/* Dual Pricing Display - Card vs Cash */}
              <View className="mb-4">
                {/* Card Payment Option */}
                <View className="flex-row justify-between items-center py-3 px-4 bg-[#1A1A1A] rounded-xl mb-2 border border-[#333]">
                  <View className="flex-row items-center">
                    <CreditCard size={20} color="#60A5FA" />
                    <Text className="text-gray-300 font-medium ml-3">
                      Card Payment
                    </Text>
                  </View>
                  <Text className="text-2xl font-bold text-blue-400">
                    ${cardAmountPerPerson.toFixed(2)}
                  </Text>
                </View>

                {/* Cash Payment Option */}
                <View className="flex-row justify-between items-center py-3 px-4 bg-[#1A1A1A] rounded-xl border border-green-900/50">
                  <View className="flex-row items-center">
                    <Banknote size={20} color="#10B981" />
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
            className="w-full py-5 bg-blue-600 rounded-2xl flex-row items-center justify-center shadow-lg shadow-blue-900/20 active:bg-blue-700"
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
