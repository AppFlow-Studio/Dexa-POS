import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowLeft, Banknote, Delete, DollarSign } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const CashPaymentView = () => {
  const { activeOrderId, activeOrderOutstandingTotal, addPaymentToOrder } =
    useOrderStore();
  const { close, setView } = usePaymentStore();

  const [amountTendered, setAmountTendered] = useState("");

  const total = activeOrderOutstandingTotal;
  const tendered = parseFloat(amountTendered) || 0;
  const changeDue = tendered - total;
  const isSufficient = tendered >= total;

  // Generate smart bill suggestions based on the total
  const suggestions = useMemo(() => {
    const bills = [10, 20, 50, 100];
    // Filter bills that are relevant (e.g. don't show $10 if total is $80)
    // But always show the next couple of tiers up
    return bills.filter((bill) => bill >= total || bill === 100 || bill === 50);
  }, [total]);

  const handleSelectAmount = (amount: number) => {
    setAmountTendered(amount.toString());
  };

  const handleSelectExact = () => {
    setAmountTendered(total.toFixed(2));
  };

  const handleProcessCashPayment = () => {
    if (activeOrderId && total > 0) {
      addPaymentToOrder({
        orderId: activeOrderId,
        amount: total, // We record the sale amount, not the tendered amount usually, or handle change logic in backend
        method: "Cash",
      });
      setView("success");
    } else {
      setView("success");
    }
  };

  const handleBack = () => {
    setView("payment-method-selection");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#212121]"
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="items-center py-6">
          <View className="w-16 h-16 bg-green-900/20 rounded-full items-center justify-center mb-3">
            <Banknote size={32} color="#10B981" />
          </View>
          <Text className="text-2xl font-bold text-white">Cash Payment</Text>
          <Text className="text-gray-400">
            Enter amount received from customer
          </Text>
        </View>

        {/* Main Card */}
        <View className="mx-4 bg-[#2A2A2A] rounded-2xl border border-[#333] overflow-hidden">
          {/* Top Section: Amount Due */}
          <View className="p-6 items-center border-b border-[#333]">
            <Text className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-2">
              Total Due
            </Text>
            <Text className="text-4xl font-bold text-white">
              ${total.toFixed(2)}
            </Text>
          </View>

          {/* Middle Section: Input */}
          <View className="p-4 bg-[#262626]">
            <Text className="text-gray-400 mb-2 font-medium">
              Amount Received
            </Text>
            <View className="flex-row items-center bg-[#1A1A1A] border border-[#404040] rounded-xl px-4 h-16">
              <DollarSign size={20} color="#9CA3AF" />
              <TextInput
                value={amountTendered}
                onChangeText={setAmountTendered}
                placeholder="0.00"
                keyboardType="numeric"
                className="flex-1 text-2xl font-bold text-white ml-2 h-full"
                placeholderTextColor="#525252"
                autoFocus={false}
              />
              {amountTendered.length > 0 && (
                <TouchableOpacity onPress={() => setAmountTendered("")}>
                  <Delete size={20} color="#6B7280" />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Suggestions Grid */}
            <View className="flex-row flex-wrap gap-2 mt-4">
              <TouchableOpacity
                onPress={handleSelectExact}
                className="flex-grow bg-[#333] border border-[#404040] py-3 px-4 rounded-lg active:bg-[#404040]"
              >
                <Text className="text-blue-400 font-bold text-center">
                  Exact
                </Text>
              </TouchableOpacity>

              {suggestions.map((bill) => (
                <TouchableOpacity
                  key={bill}
                  onPress={() => handleSelectAmount(bill)}
                  className="flex-grow bg-[#333] border border-[#404040] py-3 px-4 rounded-lg active:bg-[#404040]"
                >
                  <Text className="text-white font-bold text-center">
                    ${bill}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Bottom Section: Change Calculation */}
          <View
            className={`p-6 flex-row justify-between items-center ${isSufficient ? "bg-green-900/10" : "bg-[#2A2A2A]"}`}
          >
            <Text className="text-lg font-medium text-gray-300">
              Change Due
            </Text>
            <Text
              className={`text-3xl font-bold ${isSufficient ? "text-green-400" : "text-gray-500"}`}
            >
              ${changeDue > 0 ? changeDue.toFixed(2) : "0.00"}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View className="absolute bottom-0 left-0 right-0 bg-[#212121] pt-2 pb-4 border-t border-[#333]">
        <View className="flex-row gap-4 px-4">
          <TouchableOpacity
            onPress={handleBack}
            className="flex-1 py-4 bg-[#2A2A2A] rounded-xl border border-[#404040] flex-row items-center justify-center active:bg-[#333]"
          >
            <ArrowLeft size={20} color="#D1D5DB" className="mr-2" />
            <Text className="text-gray-300 font-semibold text-lg">Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleProcessCashPayment}
            disabled={!isSufficient && total > 0}
            className={`flex-[2] py-4 rounded-xl flex-row items-center justify-center shadow-sm 
              ${isSufficient || total === 0 ? "bg-blue-600 active:bg-blue-700" : "bg-[#333] border border-[#404040]"}`}
          >
            <Text
              className={`font-bold text-lg ${isSufficient || total === 0 ? "text-white" : "text-gray-500"}`}
            >
              {total === 0 ? "Complete Order" : "Finalize Payment"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default CashPaymentView;
