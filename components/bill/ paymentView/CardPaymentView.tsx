import { useCartData } from "@/hooks/useCartData";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const CardPaymentView = () => {
  const { subtotal, tax, total } = useCartData();
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
    <>
      {/* Header Section */}
      <View className="bg-gray-800 p-6 rounded-t-2xl">
        <Text className="text-2xl text-white font-bold">Card Payment</Text>
        <Text className="text-primary-400 font-semibold mt-1">
          Please use payment terminal
        </Text>
        <Text className="text-gray-300 mt-2">Purchase in Card</Text>
      </View>

      {/* Content Section */}
      <View className="p-6 bg-white">
        {/* Totals Summary */}
        <View className="space-y-2 mb-4">
          <View className="flex-row justify-between">
            <Text className="text-gray-600">Subtotal</Text>
            <Text className="text-gray-800">${subtotal.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-gray-600">Tax</Text>
            <Text className="text-gray-800">${tax.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-gray-600">Voucher</Text>
            <Text className="text-gray-400">${(0.0).toFixed(2)}</Text>
          </View>
        </View>

        {/* Total */}
        <View className="flex-row justify-between pt-4 border-t border-dashed border-gray-300 mb-6">
          <Text className="text-lg font-bold text-gray-900">Total</Text>
          <Text className="text-lg font-bold text-gray-900">
            ${total.toFixed(2)}
          </Text>
        </View>

        {/* Payment Status */}
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-gray-600">Payment Status</Text>
          <View className={`px-3 py-1 rounded-full ${statusColors[status]}`}>
            <Text
              className={`font-semibold capitalize ${statusTextColors[status]}`}
            >
              {status}
            </Text>
          </View>
        </View>

        {/* Buttons */}
        <View className="flex-row space-x-4">
          <TouchableOpacity
            onPress={close}
            className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
          >
            <Text className="font-bold text-gray-700">Close</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center opacity-50"
          >
            <Text className="font-bold text-white">Confirm Payment</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

export default CardPaymentView;
