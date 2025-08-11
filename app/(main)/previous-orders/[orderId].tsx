import BillItem from "@/components/bill/BillItem"; // Reuse the BillItem component
import { MOCK_PREVIOUS_ORDERS } from "@/lib/mockData";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Info, Printer } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-row justify-between py-2 border-b border-dashed border-gray-200">
    <Text className="text-base text-gray-600">{label}</Text>
    <Text className="text-base font-semibold text-gray-800">{value}</Text>
  </View>
);

const OrderDetailsScreen = () => {
  const router = useRouter();
  const { orderId } = useLocalSearchParams();
  const order = MOCK_PREVIOUS_ORDERS.find((o) => o.orderId === `#${orderId}`);

  if (!order) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-2xl font-bold text-red-500">Order Not Found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-1 items-center justify-center p-6">
        <ScrollView className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200">
          <View className="p-8">
            {/* Order Header */}
            <View className="text-center items-center">
              <Text className="text-4xl font-extrabold text-gray-800">
                Order No. {order.orderId}
              </Text>
              <Text className="text-lg text-gray-500 mt-1">{order.server}</Text>
              <TouchableOpacity className="absolute top-0 right-0 p-2 bg-orange-100 rounded-full">
                <Info color="#f97316" size={20} />
              </TouchableOpacity>
            </View>

            {/* Items List */}
            <View className="my-6">
              <Text className="text-xl font-bold text-gray-800 mb-4">
                Items
              </Text>
              <View className="space-y-4">
                {order.items.map((item) => (
                  <BillItem key={item.id} item={item} />
                ))}
              </View>
              <View className="flex-row space-x-2 mt-6">
                <TouchableOpacity className="flex-1 py-3 border border-gray-300 rounded-lg items-center">
                  <Text className="font-bold text-gray-700">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 py-3 bg-primary-400 rounded-lg items-center">
                  <Text className="font-bold text-white">Add Item</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Transaction Details & Totals */}
            <View className="space-y-2">
              <DetailRow label="No. Transaction" value="PZ05329283" />
              <DetailRow label="Table" value="T-12, T-05, T-14" />
              <DetailRow label="Payment" value="Cash" />
              <DetailRow
                label="Subtotal"
                value={`$${order.total.toFixed(2)}`}
              />
              <DetailRow
                label="Tax"
                value={`$${(order.total * 0.05).toFixed(2)}`}
              />
              <DetailRow label="Voucher" value="$0.00" />
              <View className="flex-row justify-between items-center pt-4 mt-2">
                <Text className="text-xl font-bold text-gray-900">Total</Text>
                <Text className="text-xl font-bold text-gray-900">
                  ${(order.total * 1.05).toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Footer Actions */}
            <View className="flex-row space-x-2 mt-8 border-t border-gray-200 pt-6">
              <TouchableOpacity className="flex-1 py-3 border border-gray-300 rounded-lg items-center">
                <Text className="font-bold text-gray-700">Refund</Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-1 flex-row justify-center items-center space-x-2 py-3 bg-primary-400 rounded-lg">
                <Printer color="#FFFFFF" size={20} />
                <Text className="font-bold text-white">Print Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

export default OrderDetailsScreen;
