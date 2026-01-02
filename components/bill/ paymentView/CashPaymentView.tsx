import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowLeft, Banknote, Delete, DollarSign } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const CashPaymentView = () => {
  const { activeOrderOutstandingCash, activeOrderTotalCash } = useOrderStore();
  // console.log("activeOrderOutstandingCash", activeOrderOutstandingCash);
  const { close, setView, activeSplitId, splits, handlePaymentCompletion } =
    usePaymentStore();

  const [amountTendered, setAmountTendered] = useState("");
  const [tipInput, setTipInput] = useState("");
  const [selectedTipPreset, setSelectedTipPreset] = useState<number | null>(
    null
  );

  const TIP_PRESETS = [18, 20, 25];

  // --- LOGIC: DETERMINE AMOUNT TO PAY (CASH PRICING) ---
  const activeSplit = splits.find((s) => s.id === activeSplitId);
  // For cash payments, use cash outstanding total (unpaid items at cash prices)
  // Fallback to cash total if outstanding is 0 (handles async timing or fully paid orders)
  // console.log("activeOrderOutstandingCash", activeOrderOutstandingCash);
  const effectiveOutstandingCash =
    activeOrderOutstandingCash > 0
      ? activeOrderOutstandingCash
      : activeOrderTotalCash;
  // console.log("effectiveOutstandingCash", effectiveOutstandingCash);


  // For split payments, prefer cashAmount (cash pricing) over amount (card pricing)
  // This ensures cash payments use the correct discounted cash price
  const total = activeSplit
    ? (activeSplit.cashAmount ?? activeSplit.amount)
    : effectiveOutstandingCash;
    // console.log("total", total);

  const tipAmount = parseFloat(tipInput) || 0;
  const grandTotal = total + tipAmount; // Total including tip
  const tendered = parseFloat(amountTendered) || 0;
  const changeDue = tendered - grandTotal; // Change is after tip
  const isSufficient = tendered >= grandTotal;

  // Generate smart bill suggestions based on grand total
  const suggestions = useMemo(() => {
    const bills = [10, 20, 50, 100];
    return bills.filter(
      (bill) => bill >= grandTotal || bill === 100 || bill === 50
    );
  }, [grandTotal]);

  const handleSelectAmount = (amount: number) => {
    setAmountTendered(amount.toString());
  };

  const handleSelectExact = () => {
    setAmountTendered(total.toFixed(2));
  };

  const handleTipPreset = (percentage: number) => {
    const calculatedTip = (percentage / 100) * total;
    setTipInput(calculatedTip.toFixed(2));
    setSelectedTipPreset(percentage);
  };

  const handleTipInputChange = (value: string) => {
    // Only allow valid currency format (numbers and one decimal point)
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      setTipInput(value);
      setSelectedTipPreset(null); // Clear preset when manually typing
    }
  };

  const handleProcessCashPayment = () => {
    // Use the central handler to manage splits loop
    const tipAmount = parseFloat(tipInput) || 0;
    const amountTenderedNum = parseFloat(amountTendered) || 0;
    handlePaymentCompletion("Cash", tipAmount, {
      amountTendered: amountTenderedNum,
      isCashPriced: true, // Explicit cash pricing for dual-price compliance
    });
  };

  const handleBack = () => {
    setView("payment-method-selection");
  };

  return (
    <View className="flex-1 bg-[#212121]">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="items-center py-6 pt-2">
          <View className="w-16 h-16 bg-green-900/20 rounded-full items-center justify-center mb-3">
            <Banknote size={32} color="#10B981" />
          </View>
          <Text className="text-2xl font-bold text-white">Cash Payment</Text>
          <Text className="text-gray-400">
            {activeSplit
              ? `Payment for ${activeSplit.customerName}`
              : "Enter amount received"}
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

          {/* Tip Section */}
          <View className="p-4 bg-[#262626] border-t border-[#333]">
            <Text className="text-gray-400 mb-2 font-medium">Tip Amount</Text>
            {/* Preset Tip Buttons */}
            <View className="flex-row gap-2 mb-3">
              {TIP_PRESETS.map((percent) => (
                <TouchableOpacity
                  key={percent}
                  onPress={() => handleTipPreset(percent)}
                  className={`flex-1 py-2 rounded-xl border ${selectedTipPreset === percent
                    ? "bg-blue-600 border-blue-500"
                    : "bg-[#333] border-[#404040]"
                    }`}
                >
                  <Text
                    className={`text-center font-bold ${selectedTipPreset === percent
                      ? "text-white"
                      : "text-gray-300"
                      }`}
                  >
                    {percent}%
                  </Text>
                  <Text
                    className={`text-center text-xs mt-1 ${selectedTipPreset === percent
                      ? "text-blue-200"
                      : "text-gray-500"
                      }`}
                  >
                    ${((percent / 100) * total).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Custom Tip Input */}
            <View className="flex-row items-center bg-[#1A1A1A] border border-[#404040] rounded-xl px-4 h-16">
              <DollarSign size={20} color="#9CA3AF" />
              <TextInput
                value={tipInput}
                onChangeText={handleTipInputChange}
                placeholder="0.00"
                keyboardType="numeric"
                className="flex-1 text-2xl font-bold text-white ml-2 h-full"
                placeholderTextColor="#525252"
              />
            </View>
          </View>

          {/* Grand Total Section - Shows when tip is added */}
          <View className="p-4 bg-[#1A1A1A] border-t border-[#333]">
            <View className="flex-row justify-between items-center">
              <Text className="text-gray-400 text-sm">Bill Total</Text>
              <Text className="text-gray-400 text-sm">${total.toFixed(2)}</Text>
            </View>
            {tipAmount > 0 && (
              <View className="flex-row justify-between items-center mt-1">
                <Text className="text-green-400 text-sm">+ Tip</Text>
                <Text className="text-green-400 text-sm">
                  ${tipAmount.toFixed(2)}
                </Text>
              </View>
            )}
            <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-[#333]">
              <Text className="text-white font-bold text-lg">Grand Total</Text>
              <Text className="text-blue-400 font-bold text-2xl">
                ${grandTotal.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Bottom Section: Change Calculation */}
          <View
            className={`p-6 flex-row justify-between items-center ${isSufficient ? "bg-green-900/10" : "bg-[#2A2A2A]"
              }`}
          >
            <Text className="text-lg font-medium text-gray-300">
              Change Due
            </Text>
            <Text
              className={`text-3xl font-bold ${isSufficient ? "text-green-400" : "text-gray-500"
                }`}
            >
              ${changeDue > 0 ? changeDue.toFixed(2) : "0.00"}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View className="absolute bottom-0 left-0 right-0 bg-[#212121] pt-2 pb-10 border-t border-[#333]">
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
              ${isSufficient || total === 0
                ? "bg-blue-600 active:bg-blue-700"
                : "bg-[#333] border border-[#404040]"
              }`}
          >
            <Text
              className={`font-bold text-lg ${isSufficient || total === 0 ? "text-white" : "text-gray-500"
                }`}
            >
              {total === 0 ? "Complete Order" : "Finalize Payment"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default CashPaymentView;
