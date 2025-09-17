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
    processing: "bg-yellow-100",
    rejected: "bg-red-100",
    success: "bg-green-100",
  };

  const statusTextColors = {
    processing: "text-yellow-800",
    rejected: "text-red-800",
    success: "text-green-800",
  };

  return (
    <View className="rounded-[36px] overflow-hidden bg-[#11111A]">
      {/* Dark Header */}
      <View className="p-6 rounded-t-[36px]">
        <Text className="text-3xl text-[#F1F1F1] font-bold">Card Payment</Text>
        <Text className="text-2xl text-primary-400 font-semibold mt-1">
          Please use payment terminal
        </Text>
        <Text className="text-xl text-[#F1F1F1] mt-2">Purchase in Card</Text>
      </View>

      {/* White Content */}
      <View className="p-6 rounded-[36px] bg-background-100">
        {/* Totals Summary */}
        <View className="space-y-3 mb-4">
          <View className="flex-row justify-between">
            <Text className="text-2xl text-accent-500">Subtotal</Text>
            <Text className="text-2xl text-accent-500">
              ${activeOrderOutstandingSubtotal.toFixed(2)}
            </Text>
          </View>
          {activeOrderDiscount > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-2xl text-green-600">Discount</Text>
              <Text className="text-2xl text-green-600">
                -${activeOrderDiscount.toFixed(2)}
              </Text>
            </View>
          )}
          <View className="flex-row justify-between">
            <Text className="text-2xl text-accent-500">Tax</Text>
            <Text className="text-2xl text-accent-500">
              ${activeOrderOutstandingTax.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-2xl text-accent-500">Voucher</Text>
            <Text className="text-xl text-gray-400">${(0.0).toFixed(2)}</Text>
          </View>
        </View>

        {/* Total */}
        <View className="flex-row justify-between pt-4 border-dashed border-gray-300 mb-6">
          <Text className="text-3xl font-bold text-accent-500">Total</Text>
          <Text className="text-3xl font-bold text-accent-500">
            ${activeOrderOutstandingTotal.toFixed(2)}
          </Text>
        </View>

        {/* Payment Status */}
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-2xl text-accent-500">Payment Status</Text>
          <View className={`px-4 py-2 rounded-full ${statusColors[status]}`}>
            <Text
              className={`text-2xl font-semibold capitalize ${statusTextColors[status]}`}
            >
              {status}
            </Text>
          </View>
        </View>

        {/* Buttons */}
        <View className="border-t border-gray-200 pt-4">
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={close}
              className="flex-1 py-4 border border-gray-300 rounded-lg"
            >
              <Text className="text-2xl font-bold text-gray-700 text-center">
                Close
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled
              className="flex-1 py-4 bg-primary-400 rounded-lg opacity-50"
            >
              <Text className="text-2xl font-bold text-white text-center">
                Confirm Payment
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default CardPaymentView;
