import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const CashPaymentView = () => {
  // Get totals from the cart store
  const {
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderTotal,
    activeOrderDiscount,
  } = useOrderStore();

  const { close, setView } = usePaymentStore();

  // State to manage the amount tendered by the customer
  const [amountTendered, setAmountTendered] = useState("");
  // State to track the currently selected quick-select button
  const [selectedAmountId, setSelectedAmountId] = useState<
    number | "exact" | null
  >("exact");

  // Calculate change due. Ensure it's not negative.
  const changeDue = Math.max(
    0,
    parseFloat(amountTendered || "0") - activeOrderTotal
  );

  // Suggested amounts for quick selection
  const suggestedAmounts = [5, 10, 15, 20, 25, 30, 35, 40, 50, 100];

  // Handler for the quick-select buttons
  const handleSelectAmount = (amount: number) => {
    setAmountTendered(amount.toFixed(2));
    setSelectedAmountId(amount);
  };

  const handleSelectExact = () => {
    setAmountTendered(activeOrderTotal.toFixed(2));
    setSelectedAmountId("exact");
  };

  return (
    <View className="rounded-[36px] overflow-hidden bg-[#11111A]">
      {/* Dark Header */}
      <View className="p-6 rounded-t-[36px]">
        <Text className="text-2xl text-[#F1F1F1] font-bold">Cash Payment</Text>
        <Text className="text-[#F1F1F1] mt-1">Purchase in cash</Text>
      </View>

      {/* White Content */}
      <View className="p-6 rounded-[36px] bg-background-100">
        {/* Totals Summary */}
        <View className="space-y-2 mb-4">
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
          <View className="flex-row justify-between">
            <Text className="text-accent-500">Voucher</Text>
            <Text className="text-gray-400">${(0.0).toFixed(2)}</Text>
          </View>
        </View>

        {/* Total */}
        <View className="flex-row justify-between pt-4 border-t border-dashed border-gray-300 mb-6">
          <Text className="text-lg font-bold text-accent-500">Total</Text>
          <Text className="text-lg font-bold text-accent-500">
            ${activeOrderTotal.toFixed(2)}
          </Text>
        </View>

        {/* Amount Selection */}
        <View className="mt-6">
          <Text className="text-base font-semibold text-accent-500 mb-3">
            Select Amount
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {suggestedAmounts.map((amount) => {
              const isSelected = selectedAmountId === amount;
              return (
                <TouchableOpacity
                  key={amount}
                  onPress={() => handleSelectAmount(amount)}
                  className={`py-2 px-4 rounded-lg border ${
                    isSelected
                      ? "border-primary-400 bg-primary-100"
                      : "border-gray-300"
                  }`}
                >
                  <Text
                    className={`font-semibold ${
                      isSelected ? "text-primary-400" : "text-gray-600"
                    }`}
                  >
                    ${amount}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={handleSelectExact}
              className={`py-2 px-4 rounded-lg border ${
                selectedAmountId === "exact"
                  ? "border-primary-400 bg-primary-400"
                  : "border-gray-300"
              }`}
            >
              <Text
                className={`font-semibold ${
                  selectedAmountId === "exact" ? "text-white" : "text-gray-600"
                }`}
              >
                Exact Amount
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Amount Tendered Input */}
        <View className="mt-6">
          <Text className="text-base font-semibold text-accent-500 mb-3">
            Amount Tendered
          </Text>
          <TextInput
            value={amountTendered}
            onChangeText={setAmountTendered}
            placeholder={`+ $${activeOrderTotal.toFixed(2)}`}
            keyboardType="numeric"
            className="w-full p-4 bg-gray-100 border border-gray-200 rounded-lg text-lg text-right font-semibold text-accent-500"
          />
        </View>

        {/* Change Due */}
        <View className="flex-row justify-between items-center mt-6">
          <Text className="text-base font-semibold text-accent-500">
            Change Due
          </Text>
          <Text className="text-2xl font-bold text-green-600">
            ${changeDue.toFixed(2)}
          </Text>
        </View>

        {/* Actions */}
        <View className="border-t border-gray-200 pt-4 mt-6">
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={close}
              className="flex-1 py-3 border border-gray-300 rounded-lg"
            >
              <Text className="font-bold text-gray-700 text-center">
                Close & Save Order
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setView("success")}
              className="flex-1 py-3 bg-primary-400 rounded-lg"
            >
              <Text className="font-bold text-white text-center">
                Open Drawer
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default CashPaymentView;
