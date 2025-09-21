import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const CardPaymentView = () => {
  const {
    activeOrderDiscount,
    activeOrderOutstandingSubtotal,
    activeOrderOutstandingTax,
    activeOrderOutstandingTotal,
  } = useOrderStore();

  const { close, setView } = usePaymentStore();
  const [status, setStatus] = useState<"processing" | "rejected" | "success">(
    "processing"
  );

  useEffect(() => {
    const timer = setTimeout(() => setStatus("success"), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => setView("success"), 1000);
      return () => clearTimeout(timer);
    }
  }, [status, setView]);

  const statusColors = {
    processing: "bg-yellow-100", // Will be dark themed
    rejected: "bg-red-100",
    success: "bg-green-100",
  };

  const statusTextColors = {
    processing: "text-yellow-800",
    rejected: "text-red-800",
    success: "text-green-800",
  };

  return (
    <View className="rounded-2xl overflow-hidden bg-[#212121] border border-gray-700 w-[600px]">
      {/* Dark Header */}
      <View className="p-8">
        <Text className="text-3xl text-white font-bold text-center">
          Card Payment
        </Text>
        <Text className="text-2xl text-blue-400 font-semibold mt-2 text-center">
          Please use payment terminal
        </Text>
      </View>

      {/* Dark Content */}
      <View className="p-8 bg-[#303030] rounded-b-2xl">
        {/* Totals Summary */}
        <View className="gap-y-3 mb-4">
          <View className="flex-row justify-between">
            <Text className="text-2xl text-gray-300">Subtotal</Text>
            <Text className="text-2xl text-white">
              ${activeOrderOutstandingSubtotal.toFixed(2)}
            </Text>
          </View>
          {activeOrderDiscount > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-2xl text-green-400">Discount</Text>
              <Text className="text-2xl text-green-400">
                -${activeOrderDiscount.toFixed(2)}
              </Text>
            </View>
          )}
          <View className="flex-row justify-between">
            <Text className="text-2xl text-gray-300">Tax</Text>
            <Text className="text-2xl text-white">
              ${activeOrderOutstandingTax.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Total */}
        <View className="flex-row justify-between pt-4 border-t border-dashed border-gray-600 mb-6">
          <Text className="text-3xl font-bold text-white">Total</Text>
          <Text className="text-3xl font-bold text-white">
            ${activeOrderOutstandingTotal.toFixed(2)}
          </Text>
        </View>

        {/* Payment Status */}
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-2xl text-gray-300">Payment Status</Text>
          <View
            className={`px-4 py-2 rounded-full ${status === "processing" ? "bg-yellow-500/20" : status === "rejected" ? "bg-red-500/20" : "bg-green-500/20"}`}
          >
            <Text
              className={`text-2xl font-semibold capitalize ${status === "processing" ? "text-yellow-400" : status === "rejected" ? "text-red-400" : "text-green-400"}`}
            >
              {status}
            </Text>
          </View>
        </View>

        {/* Buttons */}
        <View className="border-t border-gray-700 pt-6">
          <TouchableOpacity
            onPress={close}
            className="w-full py-4 bg-[#303030] border border-gray-600 rounded-xl items-center"
          >
            <Text className="text-2xl font-bold text-white text-center">
              Cancel Payment
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default CardPaymentView;
