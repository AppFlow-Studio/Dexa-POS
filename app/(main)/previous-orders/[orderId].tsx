import BillItem from "@/components/bill/BillItem";
import AdvancedRefundModal from "@/components/previous-orders/AdvancedRefundModal";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Printer } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-row justify-between py-3 border-b border-dashed border-gray-700">
    <Text className="text-2xl text-gray-400">{label}</Text>
    <Text className="text-2xl font-semibold text-white">{value}</Text>
  </View>
);

const OrderDetailsScreen = () => {
  const router = useRouter();
  const { orderId } = useLocalSearchParams();
  const { getOrderById, previousOrders } = usePreviousOrdersStore();
  const order = getOrderById(orderId as string);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  const canStillRefund = useMemo(() => {
    if (!order) return false;
    if (order.paymentStatus === "Refunded") return false;

    if (order.paymentStatus === "Partially Refunded") {
      const refundableItems = order.items.filter(
        (item) => (item.refundedQuantity || 0) < item.quantity
      );
      if (refundableItems.length === 0) return false;
    }

    if (
      order.paymentStatus === "Paid" ||
      order.paymentStatus === "Partially Refunded"
    ) {
      return true;
    }

    return false;
  }, [order]);

  if (!order) {
    return (
      <View className="flex-1 items-center justify-center p-6 bg-[#212121]">
        <Text className="text-3xl font-bold text-red-400 mb-4">
          Order Not Found
        </Text>
        <Text className="text-2xl text-gray-400 mb-2">
          Looking for: {orderId}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 bg-blue-600 rounded-lg"
        >
          <Text className="text-2xl text-white font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Calculate totals based on the actual items in the order
  const subtotal = order.items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );
  const tax = subtotal * 0.05; // Assuming a 5% tax rate for display
  const total = subtotal + tax;

  return (
    <View className="flex-1 bg-[#212121] p-6 justify-center items-center">
      <View className="w-full max-w-3xl bg-[#303030] rounded-2xl border border-gray-700">
        <ScrollView contentContainerStyle={{ padding: 32 }}>
          <View className="text-center items-center relative mb-6">
            <Text className="text-5xl font-extrabold text-white">
              Order {order.orderId}
            </Text>
            <Text className="text-2xl text-gray-400 mt-1">
              Server: {order.server}
            </Text>
          </View>

          <View className="my-6">
            <Text className="text-3xl font-bold text-white mb-4">Items</Text>
            <View className="space-y-4">
              {order.items.map((item) => (
                <BillItem key={item.id} item={item} isEditable={false} />
              ))}
            </View>
          </View>

          <View className="space-y-2">
            <DetailRow label="Order ID" value={order.orderId} />
            <DetailRow label="Order Type" value={order.type} />
            <DetailRow label="Server/Cashier" value={order.server} />
            <DetailRow label="Payment Status" value={order.paymentStatus} />
            {order.refundedAmount != null && order.refundedAmount > 0 && (
              <DetailRow
                label="Refunded Amount"
                value={`$${order.refundedAmount.toFixed(2)}`}
              />
            )}
            <DetailRow label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
            <DetailRow label="Tax" value={`$${tax.toFixed(2)}`} />
            <View className="flex-row justify-between items-center pt-4 mt-2 border-t border-gray-600">
              <Text className="text-3xl font-bold text-white">Total</Text>
              <Text className="text-3xl font-bold text-white">
                ${order.total.toFixed(2)}
              </Text>
            </View>
          </View>

          <View className="flex-row gap-4 mt-8 border-t border-gray-700 pt-6">
            {canStillRefund && (
              <TouchableOpacity
                onPress={() => setIsRefundModalOpen(true)}
                className="flex-1 py-4 border border-red-500 rounded-xl items-center bg-red-900/30"
              >
                <Text className="text-2xl font-bold text-red-400">
                  Process Refund
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-4 bg-blue-600 rounded-xl">
              <Printer color="#FFFFFF" size={24} />
              <Text className="text-2xl font-bold text-white">
                Print Receipt
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <AdvancedRefundModal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        order={order}
      />
    </View>
  );
};

export default OrderDetailsScreen;
