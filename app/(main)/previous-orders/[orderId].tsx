import BillItem from "@/components/bill/BillItem"; // Reuse the BillItem component
import AdvancedRefundModal from "@/components/previous-orders/AdvancedRefundModal";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Info, Printer } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-row justify-between py-2 border-b border-dashed border-gray-200">
    <Text className="text-2xl text-gray-600">{label}</Text>
    <Text className="text-2xl font-semibold text-gray-800">{value}</Text>
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

    // If the status is "Refunded", no more refunds are allowed.
    if (order.paymentStatus === "Refunded") {
      return false;
    }

    if (order.paymentStatus === "Partially Refunded") {
      const refundableItems = order.items.filter(
        (item) => (item.refundedQuantity || 0) < item.quantity
      );

      if (refundableItems.length === 0) {
        return false;
      }
    }

    // If the status is "Paid" or "Partially Refunded", a refund is possible.
    if (
      order.paymentStatus === "Paid" ||
      order.paymentStatus === "Partially Refunded"
    ) {
      return true;
    }

    // For any other status, no refunds.
    return false;
  }, [order]);

  if (!order) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-3xl font-bold text-red-500 mb-4">
          Order Not Found
        </Text>
        <Text className="text-2xl text-gray-600 mb-2">
          Looking for: {orderId}
        </Text>
        <Text className="text-2xl text-gray-600 mb-4">Available orders:</Text>
        <ScrollView className="max-h-60">
          {previousOrders.map((o, index) => (
            <Text key={index} className="text-xl text-gray-500 mb-1">
              {o.orderId} - {o.orderDate} - ${o.total.toFixed(2)}
            </Text>
          ))}
        </ScrollView>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 bg-blue-500 rounded-lg"
        >
          <Text className="text-2xl text-white font-bold">Go Back</Text>
        </TouchableOpacity>
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
              <Text className="text-5xl font-extrabold text-gray-800">
                {order.orderId}
              </Text>
              <Text className="text-2xl text-gray-500 mt-1">
                {order.server}
              </Text>
              <TouchableOpacity className="absolute top-0 right-0 p-3 bg-orange-100 rounded-full">
                <Info color="#f97316" size={24} />
              </TouchableOpacity>
            </View>

            {/* Items List */}
            <View className="my-6">
              <Text className="text-3xl font-bold text-gray-800 mb-4">
                Items
              </Text>
              <View className="space-y-4">
                {order.items.map((item) => (
                  <BillItem key={item.id} item={item} />
                ))}
              </View>
            </View>

            {/* Transaction Details & Totals */}
            <View className="space-y-2">
              <DetailRow label="Order ID" value={order.orderId} />
              <DetailRow label="Order Type" value={order.type} />
              <DetailRow label="Server/Cashier" value={order.server} />
              <DetailRow label="Payment Status" value={order.paymentStatus} />
              {order.refunded && (
                <DetailRow label="Refund Status" value="Refunded" />
              )}
              {order.refundedAmount != null && order.refundedAmount > 0 && (
                <DetailRow
                  label="Refunded Amount"
                  value={`${order.refundedAmount.toFixed(2)}`}
                />
              )}
              <DetailRow
                label="Subtotal"
                value={`${(order.total / 1.05).toFixed(2)}`}
              />
              <DetailRow
                label="Tax"
                value={`${(order.total - order.total / 1.05).toFixed(2)}`}
              />
              <DetailRow label="Voucher" value="$0.00" />
              <View className="flex-row justify-between items-center pt-4 mt-2 border-t border-gray-300">
                <Text className="text-3xl font-bold text-gray-900">Total</Text>
                <Text className="text-3xl font-bold text-gray-900">
                  ${order.total.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Footer Actions */}
            <View className="flex-row gap-3 mt-8 border-t border-gray-200 pt-6">
              {canStillRefund && (
                <TouchableOpacity
                  onPress={() => setIsRefundModalOpen(true)}
                  className="flex-1 py-4 border border-red-300 rounded-lg items-center"
                >
                  <Text className="text-2xl font-bold text-red-600">
                    Process Refund
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-4 bg-blue-500 rounded-lg">
                <Printer color="#FFFFFF" size={24} />
                <Text className="text-2xl font-bold text-white">
                  Print Receipt
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Advanced Refund Modal */}
      <AdvancedRefundModal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        order={order}
      />
    </View>
  );
};

export default OrderDetailsScreen;
