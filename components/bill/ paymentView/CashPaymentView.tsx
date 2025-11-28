import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useState } from "react";
import {
  KeyboardAvoidingView, // <--- Imported
  Platform, // <--- Imported
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const CashPaymentView = () => {
  const {
    activeOrderId, // Get activeOrderId
    activeOrderDiscount,
    activeOrderOutstandingSubtotal,
    activeOrderOutstandingTax,
    activeOrderOutstandingTotal,
    addPaymentToOrder, // Get addPaymentToOrder
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

  const handleProcessCashPayment = () => {
    if (activeOrderId && activeOrderOutstandingTotal > 0) {
      addPaymentToOrder({
        orderId: activeOrderId,
        amount: activeOrderOutstandingTotal,
        method: "Cash",
      });
      setView("success");
    } else {
      // If there's nothing to pay or no active order, still go to success view,
      // but a toast or other feedback might be appropriate in a real app.
      setView("success");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="rounded-2xl overflow-hidden bg-[#212121] border border-gray-700 w-[550px]"
    >
      {/* Dark Header */}
      <View className="p-4">
        <Text className="text-2xl text-white font-bold text-center">
          Cash Payment
        </Text>
      </View>

      {/* Dark Content */}
      <View className="p-4 bg-[#303030] rounded-b-2xl">
        {/* Totals Summary */}
        <View className="gap-y-2 mb-4">
          {/* ... (Subtotal, Discount, Tax are not directly shown in cash view now, but if you want to add them here, they're from useOrderStore) */}
          <View className="flex-row justify-between">
            <Text className="text-lg text-gray-300">Subtotal</Text>
            <Text className="text-lg text-white">
              ${activeOrderOutstandingSubtotal.toFixed(2)}
            </Text>
          </View>
          {activeOrderDiscount > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-lg text-green-400">Discount</Text>
              <Text className="text-lg text-green-400">
                -${activeOrderDiscount.toFixed(2)}
              </Text>
            </View>
          )}
          <View className="flex-row justify-between">
            <Text className="text-lg text-gray-300">Tax</Text>
            <Text className="text-lg text-white">
              ${activeOrderOutstandingTax.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Total */}
        <View className="flex-row justify-between pt-4 border-t border-dashed border-gray-600 mb-4">
          <Text className="text-2xl font-bold text-white">Total</Text>
          <Text className="text-2xl font-bold text-white">
            ${activeOrderOutstandingTotal.toFixed(2)}
          </Text>
        </View>

        {/* Amount Selection */}
        <View>
          <Text className="text-lg font-semibold text-gray-300 mb-2">
            Select Amount
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {suggestedAmounts.map((amount) => {
              const isSelected = selectedAmountId === amount;
              return (
                <TouchableOpacity
                  key={amount}
                  onPress={() => handleSelectAmount(amount)}
                  className={`py-2 px-4 rounded-lg border ${
                    isSelected
                      ? "border-blue-500 bg-blue-900/30"
                      : "border-gray-600"
                  }`}
                >
                  <Text
                    className={`text-lg font-semibold ${
                      isSelected ? "text-blue-400" : "text-gray-300"
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
                  ? "border-blue-500 bg-blue-600"
                  : "border-gray-600"
              }`}
            >
              <Text
                className={`text-lg font-semibold ${
                  selectedAmountId === "exact" ? "text-white" : "text-gray-300"
                }`}
              >
                Exact Amount
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Amount Tendered Input */}
        <View className="mt-4">
          <Text className="text-lg font-semibold text-gray-300 mb-2">
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
            className="w-full px-4 py-3 bg-[#212121] border border-gray-600 rounded-lg text-2xl text-right font-semibold text-white h-16"
            placeholderTextColor="#6B7280"
          />
        </View>

        {/* Change Due */}
        <View className="flex-row justify-between items-center mt-4">
          <Text className="text-lg font-semibold text-gray-300">
            Change Due
          </Text>
          <Text
            className={`text-3xl font-bold ${
              changeDue >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            ${changeDue.toFixed(2)}
          </Text>
        </View>

        {/* Actions */}
        <View className="border-t border-gray-700 pt-4 mt-4">
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={close}
              className="flex-1 py-3 bg-[#303030] border border-gray-600 rounded-xl items-center"
            >
              <Text className="text-lg font-bold text-white text-center">
                Close & Save
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleProcessCashPayment} // Use the new handler
              className="flex-1 py-3 bg-blue-600 rounded-xl items-center"
            >
              <Text className="text-lg font-bold text-white text-center">
                Open Drawer
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default CashPaymentView;
