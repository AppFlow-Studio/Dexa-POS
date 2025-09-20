import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const CashPaymentView = () => {
  const {
    activeOrderDiscount,
    activeOrderOutstandingSubtotal,
    activeOrderOutstandingTax,
    activeOrderOutstandingTotal,
  } = useOrderStore();
  const { close, setView } = usePaymentStore();

  const [amountTendered, setAmountTendered] = useState("");
  const [selectedAmountId, setSelectedAmountId] = useState<
    number | "exact" | null
  >(null);

  const changeDue =
    parseFloat(amountTendered || "0") - activeOrderOutstandingTotal;
  const suggestedAmounts = [5, 10, 15, 20, 25, 30, 35, 40, 50, 100];

  const handleSelectAmount = (amount: number) => {
    setAmountTendered(amount.toFixed(2));
    setSelectedAmountId(amount);
  };

  const handleSelectExact = () => {
    setAmountTendered(activeOrderOutstandingTotal.toFixed(2));
    setSelectedAmountId("exact");
  };

  return (
    <View className="rounded-2xl overflow-hidden bg-[#212121] border border-gray-700 w-[600px]">
      {/* Dark Header */}
      <View className="p-8">
        <Text className="text-3xl text-white font-bold text-center">
          Cash Payment
        </Text>
      </View>

      {/* Dark Content */}
      <View className="p-8 bg-[#303030] rounded-b-2xl">
        {/* Total */}
        <View className="flex-row justify-between pt-4 border-t border-dashed border-gray-600 mb-6">
          <Text className="text-3xl font-bold text-white">Total</Text>
          <Text className="text-3xl font-bold text-white">
            ${activeOrderOutstandingTotal.toFixed(2)}
          </Text>
        </View>

        {/* Amount Selection */}
        <View>
          <Text className="text-2xl font-semibold text-gray-300 mb-3">
            Select Amount
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {suggestedAmounts.map((amount) => {
              const isSelected = selectedAmountId === amount;
              return (
                <TouchableOpacity
                  key={amount}
                  onPress={() => handleSelectAmount(amount)}
                  className={`py-3 px-6 rounded-lg border ${isSelected ? "border-blue-500 bg-blue-900/30" : "border-gray-600"}`}
                >
                  <Text
                    className={`text-xl font-semibold ${isSelected ? "text-blue-400" : "text-gray-300"}`}
                  >
                    ${amount}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={handleSelectExact}
              className={`py-3 px-6 rounded-lg border ${selectedAmountId === "exact" ? "border-blue-500 bg-blue-600" : "border-gray-600"}`}
            >
              <Text
                className={`text-xl font-semibold ${selectedAmountId === "exact" ? "text-white" : "text-gray-300"}`}
              >
                Exact Amount
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Amount Tendered Input */}
        <View className="mt-6">
          <Text className="text-2xl font-semibold text-gray-300 mb-3">
            Amount Tendered
          </Text>
          <TextInput
            value={amountTendered}
            onChangeText={(text) => {
              setAmountTendered(text);
              setSelectedAmountId(null); // Deselect quick buttons when typing manually
            }}
            placeholder={`${activeOrderOutstandingTotal.toFixed(2)}`}
            keyboardType="numeric"
            className="w-full px-6 py-4 bg-[#212121] border border-gray-600 rounded-lg text-3xl text-right font-semibold text-white"
            placeholderTextColor="#6B7280"
          />
        </View>

        {/* Change Due */}
        <View className="flex-row justify-between items-center mt-6">
          <Text className="text-2xl font-semibold text-gray-300">
            Change Due
          </Text>
          <Text
            className={`text-4xl font-bold ${changeDue >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            ${changeDue.toFixed(2)}
          </Text>
        </View>

        {/* Actions */}
        <View className="border-t border-gray-700 pt-6 mt-6">
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={close}
              className="flex-1 py-4 bg-[#303030] border border-gray-600 rounded-xl items-center"
            >
              <Text className="text-2xl font-bold text-white text-center">
                Close & Save
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setView("success")}
              className="flex-1 py-4 bg-blue-600 rounded-xl items-center"
            >
              <Text className="text-2xl font-bold text-white text-center">
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
