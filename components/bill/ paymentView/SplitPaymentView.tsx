import { useOrderStore } from "@/stores/useOrderStore";
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
  const {
    activeOrderId,
    orders,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderTotal,
    activeOrderDiscount,
  } = useOrderStore();

  const { close, setView } = usePaymentStore();

  const [splitOption, setSplitOption] = useState<SplitOption>("Split Evenly");
  const [numberOfPeople, setNumberOfPeople] = useState(2);
  const [splits, setSplits] = useState<Split[]>([]);

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const items = activeOrder?.items || [];

  // This effect recalculates the splits whenever the total or number of people changes
  useMemo(() => {
    const newSplits: Split[] = [];
    const amountPerPerson = activeOrderTotal / numberOfPeople;
    for (let i = 1; i <= numberOfPeople; i++) {
      newSplits.push({
        id: i,
        amount: amountPerPerson,
        paymentType: "Card", // Default to Card
      });
    }
    setSplits(newSplits);
  }, [activeOrderTotal, numberOfPeople]);

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
    <View className="rounded-[36px] overflow-hidden bg-[#11111A]">
      {/* Dark Header */}
      <View className="p-6 rounded-t-[36px]">
        <Text className="text-2xl text-[#F1F1F1] font-bold">Split Payment</Text>
        <Text className="text-[#F1F1F1] mt-1">Purchase</Text>
      </View>

      {/* White Content */}
      <View className="p-6 rounded-[36px] bg-background-100">
        <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
          {/* Bill Preview */}
          {billSummary.map((item) => (
            <View key={item.name} className="flex-row justify-between mb-1">
              <Text className="text-base font-semibold text-accent-500">
                {item.name}
              </Text>
              <Text className="text-base text-accent-500">
                ${item.totalPrice.toFixed(2)}
              </Text>
            </View>
          ))}

          {/* Totals Summary */}
          <View className="space-y-2 mb-4 mt-4">
            <View className="flex-row justify-between">
              <Text className="text-accent-500">Subtotal</Text>
              <Text className="text-accent-500">
                ${activeOrderSubtotal.toFixed(2)}
              </Text>
            </View>
            {activeOrderDiscount > 0 && (
              <View className="flex-row justify-between">
                <Text className="text-green-600">Discount</Text>
                <Text className="text-green-600">
                  -${activeOrderDiscount.toFixed(2)}
                </Text>
              </View>
            )}
            <View className="flex-row justify-between">
              <Text className="text-accent-500">Tax</Text>
              <Text className="text-accent-500">
                ${activeOrderTax.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Total */}
          <View className="flex-row justify-between pt-4 border-t border-dashed border-gray-300 mb-6">
            <Text className="text-lg font-bold text-accent-500">Total</Text>
            <Text className="text-lg font-bold text-accent-500">
              ${activeOrderTotal.toFixed(2)}
            </Text>
          </View>

          {/* Split Options */}
          <View className="mt-6">
            <Text className="text-base font-semibold text-accent-500 mb-3">
              Split Options
            </Text>
            <View className="flex-row gap-2">
              {["Split Evenly", "Split by Item", "Custom Amount"].map((opt) => {
                const isSelected = splitOption === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setSplitOption(opt as SplitOption)}
                    className={`py-2 px-4 rounded-lg border ${
                      isSelected
                        ? "border-primary-400 bg-primary-400"
                        : "border-gray-300"
                    }`}
                  >
                    <Text
                      className={`font-semibold ${
                        isSelected ? "text-white" : "text-gray-600"
                      }`}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Number of People */}
          <View className="mt-6">
            <Text className="text-base font-semibold text-accent-500 mb-3">
              Number of People:
            </Text>
            <View className="flex-row gap-2">
              {[2, 3, 4, 5, 6, 7, 8].map((num) => {
                const isSelected = numberOfPeople === num;
                return (
                  <TouchableOpacity
                    key={num}
                    onPress={() => setNumberOfPeople(num)}
                    className={`w-10 h-10 rounded-lg border items-center justify-center ${
                      isSelected
                        ? "border-primary-400 bg-primary-400"
                        : "border-gray-300"
                    }`}
                  >
                    <Text
                      className={`font-semibold ${
                        isSelected ? "text-white" : "text-gray-600"
                      }`}
                    >
                      {num}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Split Details */}
          <View className="mt-6 space-y-4">
            {splits.map((split) => (
              <View key={split.id} className="flex-row items-center">
                <Text className="text-base font-semibold text-accent-500 w-20">
                  Split {split.id}:
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => handleSetPaymentType(split.id, "Card")}
                    className={`py-2 px-4 rounded-lg border ${
                      split.paymentType === "Card"
                        ? "border-primary-400 bg-primary-400"
                        : "border-gray-300"
                    }`}
                  >
                    <Text
                      className={`font-semibold ${
                        split.paymentType === "Card"
                          ? "text-white"
                          : "text-gray-600"
                      }`}
                    >
                      Card
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSetPaymentType(split.id, "Cash")}
                    className={`py-2 px-4 rounded-lg border ${
                      split.paymentType === "Cash"
                        ? "border-primary-400 bg-primary-400"
                        : "border-gray-300"
                    }`}
                  >
                    <Text
                      className={`font-semibold ${
                        split.paymentType === "Cash"
                          ? "text-white"
                          : "text-gray-600"
                      }`}
                    >
                      Cash
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* Total Split Amount */}
          <View className="flex-row justify-between items-center mt-6">
            <Text className="text-base font-semibold text-accent-500">
              Total Split
            </Text>
            <Text className="text-lg font-bold text-accent-500">
              ${activeOrderTotal.toFixed(2)}
            </Text>
          </View>
        </ScrollView>

        {/* Actions */}
        <View className="flex-row gap-2 mt-6 border-t border-gray-200 pt-4">
          <TouchableOpacity
            onPress={() => {
              setView("success");
            }}
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Next Split</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default SplitPaymentView;
