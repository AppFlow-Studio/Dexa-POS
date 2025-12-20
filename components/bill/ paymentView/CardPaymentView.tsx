import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { CheckCircle2, Wifi } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

const CardPaymentView = () => {
  const {
    activeOrderDiscount,
    activeOrderOutstandingSubtotal,
    activeOrderOutstandingTax,
    activeOrderOutstandingTotal,
    activeOrderTotal,
    activeOrderId,
  } = useOrderStore();

  const { close, handlePaymentCompletion, activeSplitId, splits } =
    usePaymentStore();
  const [status, setStatus] = useState<
    "ready" | "processing" | "rejected" | "success"
  >("ready");
  const [tipInput, setTipInput] = useState("");

  // --- LOGIC: DETERMINE AMOUNT TO PAY ---
  const activeSplit = splits.find((s) => s.id === activeSplitId);
  // Fallback to activeOrderTotal if outstandingTotal is 0 (handles async timing)
  const effectiveOutstandingTotal =
    activeOrderOutstandingTotal > 0
      ? activeOrderOutstandingTotal
      : activeOrderTotal;
  const totalToPay = activeSplit
    ? activeSplit.amount
    : effectiveOutstandingTotal;

  const tipAmount = parseFloat(tipInput) || 0;
  const grandTotal = totalToPay + tipAmount;

  // Logic: Simulate terminal interaction
  useEffect(() => {
    if (status === "processing") {
      // Simulate card read time
      const timer = setTimeout(() => setStatus("success"), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Logic: Handle Success
  useEffect(() => {
    if (status === "success" && activeOrderId) {
      // Use central handler instead of direct store call
      // Pass the tip amount here
      handlePaymentCompletion("Card", tipAmount, {
        terminalType: "manual", // Default for now
        authorizationCode: "AUTH" + Math.floor(Math.random() * 10000),
      });
    }
  }, [status, activeOrderId, handlePaymentCompletion, tipAmount]);

  const handleChargeCard = () => {
    setStatus("processing");
  };

  return (
    <View className="flex-1 bg-[#212121]">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "space-between",
          padding: 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Section: Status Indicator */}
        <View className="items-center justify-center flex-1">
          {/* READY STATE: Tip Input */}
          {status === "ready" && (
            <View className="w-full max-w-sm">
              <View className="items-center mb-8">
                <Text className="text-gray-400 text-lg mb-2">Total Due</Text>
                <Text className="text-5xl font-bold text-white mb-8">
                  ${totalToPay.toFixed(2)}
                </Text>

                <Text className="text-gray-400 mb-2 font-medium self-start w-full">
                  Add Tip
                </Text>
                <View className="flex-row items-center bg-[#2A2A2A] border border-[#333] rounded-xl px-4 h-16 w-full mb-8">
                  <Text className="text-gray-400 text-xl mr-2">$</Text>
                  <BottomSheetTextInput
                    value={tipInput}
                    onChangeText={setTipInput}
                    placeholder="0.00"
                    keyboardType="numeric"
                    placeholderTextColor="#525252"
                    style={{
                      flex: 1,
                      fontSize: 24,
                      fontWeight: "bold",
                      color: "white",
                      height: "100%",
                    }}
                  />
                </View>

                <View className="flex-row justify-between w-full border-t border-[#333] pt-4">
                  <Text className="text-gray-300 text-xl">Grand Total:</Text>
                  <Text className="text-white text-xl font-bold">
                    ${grandTotal.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* PROCESSING / SUCCESS STATES */}
          {(status === "processing" || status === "success") && (
            <View className="mb-8">
              {status === "processing" && (
                <Animated.View entering={FadeIn} className="items-center">
                  <View className="w-24 h-24 bg-blue-600/10 rounded-full items-center justify-center mb-4 border-2 border-blue-500/20">
                    <ActivityIndicator size="large" color="#3B82F6" />
                  </View>
                  <View className="flex-row items-center gap-2 bg-[#2A2A2A] px-4 py-2 rounded-full border border-[#333]">
                    <Wifi size={16} color="#10B981" />
                    <Text className="text-gray-400 font-medium text-sm">
                      Terminal Connected
                    </Text>
                  </View>
                </Animated.View>
              )}

              {status === "success" && (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  className="items-center"
                >
                  <View className="w-24 h-24 bg-green-500/10 rounded-full items-center justify-center mb-4 border-2 border-green-500/20">
                    <CheckCircle2 size={48} color="#10B981" />
                  </View>
                  <Text className="text-green-400 font-bold text-lg">
                    Approved
                  </Text>
                </Animated.View>
              )}

              <View className="mt-8 items-center">
                <Text className="text-3xl font-bold text-white mb-2 text-center">
                  {status === "processing"
                    ? "Present Card"
                    : "Payment Successful"}
                </Text>
                <Text className="text-gray-400 text-lg text-center">
                  {status === "processing"
                    ? `Charging $${grandTotal.toFixed(2)}`
                    : "Transaction completed"}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Bottom Section: Receipt Details & Actions */}
        <Animated.View entering={FadeInDown.delay(200)} className="w-full">
          {/* Receipt Breakdown Card */}
          {/* Only show simplified breakdown or nothing in ready state if unnecessary, keeping consistent for now */}
          {status !== "ready" && (
            <View className="bg-[#2A2A2A] p-5 rounded-2xl border border-[#333333] mb-6">
              {activeSplit ? (
                <View className="flex-row justify-between">
                  <Text className="text-gray-400 text-base">
                    {activeSplit.customerName} Share
                  </Text>
                  <Text className="text-white text-base font-medium">
                    ${activeSplit.amount.toFixed(2)}
                  </Text>
                </View>
              ) : (
                <>
                  <View className="flex-row justify-between mb-3">
                    <Text className="text-gray-400 text-base">Subtotal</Text>
                    <Text className="text-white text-base font-medium">
                      ${activeOrderOutstandingSubtotal.toFixed(2)}
                    </Text>
                  </View>

                  {activeOrderDiscount > 0 && (
                    <View className="flex-row justify-between mb-3">
                      <Text className="text-green-500/80 text-base">
                        Discount
                      </Text>
                      <Text className="text-green-500 font-medium text-base">
                        -${activeOrderDiscount.toFixed(2)}
                      </Text>
                    </View>
                  )}

                  <View className="flex-row justify-between pt-3 border-t border-[#404040]">
                    <Text className="text-gray-400 text-base">Tax</Text>
                    <Text className="text-white text-base font-medium">
                      ${activeOrderOutstandingTax.toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
              {tipAmount > 0 && (
                <View className="flex-row justify-between pt-3 border-t border-[#404040] mt-3">
                  <Text className="text-gray-400 text-base">Tip</Text>
                  <Text className="text-white text-base font-medium">
                    ${tipAmount.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          {status === "ready" && (
            <TouchableOpacity
              onPress={handleChargeCard}
              className="w-full py-4 bg-blue-600 rounded-xl mb-4 active:bg-blue-700 items-center"
            >
              <Text className="text-white font-bold text-lg">
                Charge Card ${grandTotal.toFixed(2)}
              </Text>
            </TouchableOpacity>
          )}

          {(status === "processing" || status === "ready") && (
            <TouchableOpacity
              onPress={close}
              className="w-full py-4 bg-[#2A2A2A] border border-[#404040] rounded-xl active:bg-[#333]"
            >
              <Text className="text-lg font-bold text-gray-300 text-center">
                Cancel Transaction
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
};

export default CardPaymentView;
