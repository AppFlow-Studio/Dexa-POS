import { useCartStore } from "@/stores/useCartStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const CashPaymentView = () => {
  // Get totals from the cart store
  const { subtotal, tax, total } = useCartStore();
  const { close, setView } = usePaymentStore();

  // State to manage the amount tendered by the customer
  const [amountTendered, setAmountTendered] = useState("");
  // State to track the currently selected quick-select button
  const [selectedAmountId, setSelectedAmountId] = useState<
    number | "exact" | null
  >("exact");

  // Calculate change due. Ensure it's not negative.
  const changeDue = Math.max(0, parseFloat(amountTendered || "0") - total);

  // Suggested amounts for quick selection
  const suggestedAmounts = [5, 10, 15, 20, 25, 30, 35, 40, 50, 100];

  // Handler for the quick-select buttons
  const handleSelectAmount = (amount: number) => {
    setAmountTendered(amount.toFixed(2));
    setSelectedAmountId(amount);
  };

  const handleSelectExact = () => {
    setAmountTendered(total.toFixed(2));
    setSelectedAmountId("exact");
  };

  return (
    <>
      {/* --- Section 1: Dark Header --- */}
      <View className="bg-gray-800 p-6 rounded-t-2xl">
        <Text className="text-2xl text-white font-bold">Cash Payment</Text>
        <Text className="text-gray-300 mt-1">Purchase in cash</Text>
      </View>

      {/* --- Section 2: White Content Area --- */}
      <View className="bg-white p-6 rounded-b-2xl">
        {/* Totals Summary */}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-base text-gray-600">Subtotal</Text>
          <Text className="text-base text-gray-800">
            ${subtotal.toFixed(2)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-base text-gray-600">Tax</Text>
          <Text className="text-base text-gray-800">${tax.toFixed(2)}</Text>
        </View>
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-base text-gray-600">Voucher</Text>
          <Text className="text-base text-gray-400">${(0.0).toFixed(2)}</Text>
        </View>
        <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300">
          <Text className="text-lg font-bold text-gray-900">Total</Text>
          <Text className="text-lg font-bold text-gray-900">
            ${total.toFixed(2)}
          </Text>
        </View>

        {/* Amount Selection */}
        <View className="mt-6">
          <Text className="text-base font-semibold text-gray-700 mb-3">
            Select Amount
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {suggestedAmounts.map((amount) => {
              const isSelected = selectedAmountId === amount;
              return (
                <TouchableOpacity
                  key={amount}
                  onPress={() => handleSelectAmount(amount)}
                  className={`py-2 px-4 rounded-lg border ${isSelected ? "border-primary-400 bg-primary-100" : "border-gray-300"}`}
                >
                  <Text
                    className={`font-semibold ${isSelected ? "text-primary-400" : "text-gray-600"}`}
                  >
                    ${amount}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={handleSelectExact}
              className={`py-2 px-4 rounded-lg border ${selectedAmountId === "exact" ? "border-primary-400 bg-primary-400" : "border-gray-300"}`}
            >
              <Text
                className={`font-semibold ${selectedAmountId === "exact" ? "text-white" : "text-gray-600"}`}
              >
                Exact Amount
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Amount Tendered Input */}
        <View className="mt-6">
          <Text className="text-base font-semibold text-gray-700 mb-3">
            Amount Tendered
          </Text>
          <TextInput
            value={amountTendered}
            onChangeText={setAmountTendered}
            placeholder={`+ $${total.toFixed(2)}`}
            keyboardType="numeric"
            className="w-full p-4 bg-gray-100 border border-gray-200 rounded-lg text-lg text-right font-semibold"
          />
        </View>

        {/* Change Due */}
        <View className="flex-row justify-between items-center mt-6">
          <Text className="text-base font-semibold text-gray-700">
            Change Due
          </Text>
          <Text className="text-2xl font-bold text-green-600">
            ${changeDue.toFixed(2)}
          </Text>
        </View>

        {/* Actions */}
        <View className="flex-row space-x-2 mt-8">
          <TouchableOpacity
            onPress={close}
            className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
          >
            <Text className="font-bold text-gray-700">Close & Save Order</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setView("success")}
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Open Drawer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

export default CashPaymentView;
