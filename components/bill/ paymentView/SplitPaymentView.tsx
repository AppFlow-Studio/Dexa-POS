import { useCartData } from "@/hooks/useCartData";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

type SplitOption = "Split Evenly" | "Split by Item" | "Custom Amount";
type PaymentType = "Card" | "Cash";

interface Split {
  id: number;
  amount: number;
  paymentType: PaymentType;
}

const SplitPaymentView = () => {
  const { items, subtotal, tax, total } = useCartData();

  const { close, setView } = usePaymentStore();

  const [splitOption, setSplitOption] = useState<SplitOption>("Split Evenly");
  const [numberOfPeople, setNumberOfPeople] = useState(2);
  const [splits, setSplits] = useState<Split[]>([]);

  // This effect recalculates the splits whenever the total or number of people changes
  useMemo(() => {
    const newSplits: Split[] = [];
    const amountPerPerson = total / numberOfPeople;
    for (let i = 1; i <= numberOfPeople; i++) {
      newSplits.push({
        id: i,
        amount: amountPerPerson,
        paymentType: "Card", // Default to Card
      });
    }
    setSplits(newSplits);
  }, [total, numberOfPeople]);

  const handleSetPaymentType = (splitId: number, type: PaymentType) => {
    setSplits((currentSplits) =>
      currentSplits.map((split) =>
        split.id === splitId ? { ...split, paymentType: type } : split
      )
    );
  };

  // A simplified summary of items for the bill preview
  const billSummary = items.reduce(
    (acc, item) => {
      const existing = acc.find((i) => i.name === item.name);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice += item.price * item.quantity;
      } else {
        acc.push({
          name: item.name,
          quantity: item.quantity,
          totalPrice: item.price * item.quantity,
        });
      }
      return acc;
    },
    [] as { name: string; quantity: number; totalPrice: number }[]
  );

  return (
    <>
      {/* --- Section 1: Dark Header --- */}
      <View className="bg-gray-800 p-6 rounded-t-2xl">
        <Text className="text-2xl text-white font-bold">Split Payment</Text>
        <Text className="text-gray-300 mt-1">Purchase</Text>
      </View>

      {/* --- Section 2: White Content Area --- */}
      <View className="bg-white p-6 rounded-b-2xl">
        <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
          {/* Bill Preview */}
          {billSummary.map((item) => (
            <View key={item.name} className="flex-row justify-between mb-1">
              <Text className="text-base font-semibold text-gray-800">
                {item.name}
              </Text>
              <Text className="text-base text-gray-600">
                ${item.totalPrice.toFixed(2)}
              </Text>
            </View>
          ))}

          {/* Totals Summary */}
          <View className="flex-row justify-between items-center mb-2 mt-4">
            <Text className="text-base text-gray-600">Subtotal</Text>
            <Text className="text-base text-gray-800">
              ${subtotal.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-base text-gray-600">Tax</Text>
            <Text className="text-base text-gray-800">${tax.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300">
            <Text className="text-lg font-bold text-gray-900">Total</Text>
            <Text className="text-lg font-bold text-gray-900">
              ${total.toFixed(2)}
            </Text>
          </View>

          {/* Split Options */}
          <View className="mt-6">
            <Text className="text-base font-semibold text-gray-700 mb-3">
              Split Options
            </Text>
            <View className="flex-row space-x-2">
              {["Split Evenly", "Split by Item", "Custom Amount"].map((opt) => {
                const isSelected = splitOption === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setSplitOption(opt as SplitOption)}
                    className={`py-2 px-4 rounded-lg border ${isSelected ? "border-primary-400 bg-primary-400" : "border-gray-300"}`}
                  >
                    <Text
                      className={`font-semibold ${isSelected ? "text-white" : "text-gray-600"}`}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Number of People */}
          <View className="mt-4">
            <Text className="text-base font-semibold text-gray-700 mb-3">
              Number of People:
            </Text>
            <View className="flex-row space-x-2">
              {[2, 3, 4, 5, 6, 7, 8].map((num) => {
                const isSelected = numberOfPeople === num;
                return (
                  <TouchableOpacity
                    key={num}
                    onPress={() => setNumberOfPeople(num)}
                    className={`w-10 h-10 rounded-lg border items-center justify-center ${isSelected ? "border-primary-400 bg-primary-400" : "border-gray-300"}`}
                  >
                    <Text
                      className={`font-semibold ${isSelected ? "text-white" : "text-gray-600"}`}
                    >
                      {num}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Split Details */}
          <View className="mt-4 space-y-2">
            {splits.map((split) => (
              <View key={split.id} className="flex-row items-center">
                <Text className="text-base font-semibold text-gray-700 w-20">
                  Split {split.id}:
                </Text>
                <View className="flex-row space-x-2">
                  <TouchableOpacity
                    onPress={() => handleSetPaymentType(split.id, "Card")}
                    className={`py-2 px-4 rounded-lg border ${split.paymentType === "Card" ? "border-primary-400 bg-primary-400" : "border-gray-300"}`}
                  >
                    <Text
                      className={`font-semibold ${split.paymentType === "Card" ? "text-white" : "text-gray-600"}`}
                    >
                      Card
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSetPaymentType(split.id, "Cash")}
                    className={`py-2 px-4 rounded-lg border ${split.paymentType === "Cash" ? "border-primary-400 bg-primary-400" : "border-gray-300"}`}
                  >
                    <Text
                      className={`font-semibold ${split.paymentType === "Cash" ? "text-white" : "text-gray-600"}`}
                    >
                      Cash
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* Total Split Amount */}
          <View className="flex-row justify-between items-center mt-4">
            <Text className="text-base font-semibold text-gray-700">
              Total Split
            </Text>
            <Text className="text-lg font-bold text-gray-900">
              ${total.toFixed(2)}
            </Text>
          </View>
        </ScrollView>

        {/* Actions */}
        <View className="flex-row space-x-2 mt-6 border-t border-gray-200 pt-4">
          <TouchableOpacity
            onPress={close}
            className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
          >
            <Text className="font-bold text-gray-700">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              /* TODO: Navigate to next split payment screen */
            }}
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Next Split</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

export default SplitPaymentView;
