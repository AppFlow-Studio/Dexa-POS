import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { CheckCircle2, Wifi } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

const CardPaymentView = () => {
  const {
    activeOrderDiscount,
    activeOrderOutstandingSubtotal,
    activeOrderOutstandingTax,
    activeOrderOutstandingTotal,
    activeOrderId,
    addPaymentToOrder,
  } = useOrderStore();

  const { close, setView } = usePaymentStore();
  const [status, setStatus] = useState<"processing" | "rejected" | "success">(
    "processing"
  );

  // Logic: Simulate terminal interaction
  useEffect(() => {
    // Simulate card read time
    const timer = setTimeout(() => setStatus("success"), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Logic: Handle Success
  useEffect(() => {
    if (status === "success" && activeOrderId) {
      addPaymentToOrder({
        orderId: activeOrderId,
        amount: activeOrderOutstandingTotal,
        method: "Card",
      });
      // Slight delay to show the green checkmark before switching views
      const timer = setTimeout(() => setView("success"), 1500);
      return () => clearTimeout(timer);
    }
  }, [
    status,
    activeOrderId,
    activeOrderOutstandingTotal,
    addPaymentToOrder,
    setView,
  ]);

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="flex-1 justify-between p-4">
        {/* Top Section: Status Indicator */}
        <View className="items-center justify-center flex-1">
          {/* Animated Status Icon */}
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
          </View>

          {/* Main Status Text */}
          <Text className="text-3xl font-bold text-white mb-2 text-center">
            {status === "processing" ? "Present Card" : "Payment Successful"}
          </Text>
          <Text className="text-gray-400 text-lg text-center mb-8">
            {status === "processing"
              ? "Tap, insert, or swipe on the terminal"
              : "Transaction completed successfully"}
          </Text>

          {/* Big Amount Display */}
          <View className="items-center mb-8">
            <Text className="text-gray-500 font-medium mb-1">TOTAL AMOUNT</Text>
            <Text className="text-5xl font-bold text-white">
              ${activeOrderOutstandingTotal.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Bottom Section: Receipt Details & Actions */}
        <Animated.View entering={FadeInDown.delay(200)} className="w-full">
          {/* Receipt Breakdown Card */}
          <View className="bg-[#2A2A2A] p-5 rounded-2xl border border-[#333333] mb-6">
            <View className="flex-row justify-between mb-3">
              <Text className="text-gray-400 text-base">Subtotal</Text>
              <Text className="text-white text-base font-medium">
                ${activeOrderOutstandingSubtotal.toFixed(2)}
              </Text>
            </View>

            {activeOrderDiscount > 0 && (
              <View className="flex-row justify-between mb-3">
                <Text className="text-green-500/80 text-base">Discount</Text>
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
          </View>

          {/* Cancel Button (Only show while processing) */}
          {status === "processing" && (
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
      </View>
    </View>
  );
};

export default CardPaymentView;
