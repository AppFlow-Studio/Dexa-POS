import { useOrderStore } from "@/stores/useOrderStore";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import BillItem from "../bill/BillItem";

// FIX: Update props to accept a specific orderId
interface OrderLineItemsViewProps {
  onClose: () => void;
  orderId: string | null;
}

const TAX_RATE = 0.05; // Assuming a constant tax rate

const OrderLineItemsView: React.FC<OrderLineItemsViewProps> = ({
  onClose,
  orderId,
}) => {
  const { orders } = useOrderStore();

  // Find the specific order to view using the passed orderId, not the global activeOrderId
  const orderToView = orders.find((o) => o.id === orderId);
  const items = orderToView?.items || [];

  // Calculate totals locally for the specific order being viewed
  const { subtotal, discount, tax, total } = useMemo(() => {
    if (!orderToView) {
      return { subtotal: 0, discount: 0, tax: 0, total: 0 };
    }
    const sub = orderToView.items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );
    // This calculation assumes a simple structure. Adjust if discounts become more complex.
    const disc = orderToView.checkDiscount
      ? sub * orderToView.checkDiscount.value
      : 0;
    const subAfterDiscount = sub - disc;
    const taxAmount = subAfterDiscount * TAX_RATE;
    const totalAmount = subAfterDiscount + taxAmount;

    return {
      subtotal: sub,
      discount: disc,
      tax: taxAmount,
      total: totalAmount,
    };
  }, [orderToView]);

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  if (!orderToView) {
    return null; // Don't render if there's no order to show
  }

  return (
    <View className="bg-[#212121] p-8 rounded-2xl border border-gray-700">
      <View className="items-center mb-6">
        <Text className="text-3xl font-bold text-white">Items in Order</Text>
        <View className="flex-row items-center gap-2 mt-2">
          <View className="px-3 py-1 rounded-full bg-blue-900/30 border border-blue-500">
            <Text className="text-xl font-bold text-blue-400">
              {orderToView.order_status}
            </Text>
          </View>
          <View
            className={`px-3 py-1 rounded-full border ${
              orderToView.paid_status === "Paid"
                ? "bg-green-900/30 border-green-500"
                : orderToView.paid_status === "Pending"
                  ? "bg-yellow-500/20 border-yellow-500"
                  : "bg-red-900/30 border-red-500"
            }`}
          >
            <Text
              className={`text-xl font-bold ${
                orderToView.paid_status === "Paid"
                  ? "text-green-400"
                  : orderToView.paid_status === "Pending"
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {orderToView.paid_status}
            </Text>
          </View>
        </View>
      </View>
      <ScrollView
        className="max-h-[350px] mb-4"
        contentContainerClassName="gap-y-2"
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => (
          <BillItem
            key={item.id}
            item={item}
            expandedItemId={expandedItemId}
            onToggleExpand={handleToggleExpand}
            isEditable={false}
          />
        ))}
      </ScrollView>
      <View className="border-t border-gray-700 pt-4 mt-4 space-y-2">
        <View className="flex-row justify-between items-center">
          <Text className="text-2xl text-gray-300">Subtotal</Text>
          <Text className="text-2xl font-medium text-white">
            ${subtotal.toFixed(2)}
          </Text>
        </View>
        {discount > 0 && (
          <View className="flex-row justify-between">
            <Text className="text-2xl text-green-400">Discount</Text>
            <Text className="text-2xl font-medium text-green-400">
              -${discount.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between items-center">
          <Text className="text-2xl text-gray-300">Tax</Text>
          <Text className="text-2xl font-medium text-white">
            ${tax.toFixed(2)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center pt-4 mt-2 border-t border-dashed border-gray-600">
          <Text className="text-3xl font-bold text-white">Total</Text>
          <Text className="text-3xl font-bold text-white">
            ${total.toFixed(2)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          className="w-full py-4 mt-6 bg-[#303030] border border-gray-600 rounded-xl items-center"
        >
          <Text className="text-2xl font-bold text-white">Return</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OrderLineItemsView;
