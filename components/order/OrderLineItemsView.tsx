import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import BillItem from "../bill/BillItem"; // Reuse the BillItem component

const OrderLineItemsView = ({ onClose }: { onClose: () => void }) => {
  // Get all data directly from the order store
  const {
    activeOrderId,
    orders,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderDiscount,
    activeOrderTotal,
  } = useOrderStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const items = activeOrder?.items || [];

  // State for managing expanded item
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  return (
    <View className="bg-background-100 p-6 rounded-2xl">
      <View className="items-center mb-4">
        <Text className="text-3xl font-bold text-accent-400">Items</Text>
        {activeOrder && (
          <View className="flex-row items-center gap-2 mt-2">
            <View className="px-3 py-1 rounded-3xl bg-blue-100">
              <Text className="text-xl font-bold text-blue-800">
                {activeOrder.order_status}
              </Text>
            </View>
            <View
              className={`px-3 py-1 rounded-3xl ${
                activeOrder.paid_status === "Paid"
                  ? "bg-green-100"
                  : activeOrder.paid_status === "Pending"
                    ? "bg-yellow-100"
                    : "bg-red-100"
              }`}
            >
              <Text
                className={`text-xl font-bold ${
                  activeOrder.paid_status === "Paid"
                    ? "text-green-700"
                    : activeOrder.paid_status === "Pending"
                      ? "text-yellow-700"
                      : "text-red-700"
                }`}
              >
                {activeOrder.paid_status}
              </Text>
            </View>
          </View>
        )}
      </View>
      <ScrollView className="max-h-80" showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          <BillItem
            key={item.id}
            item={item}
            expandedItemId={expandedItemId}
            onToggleExpand={handleToggleExpand}
          />
        ))}
      </ScrollView>
      <View className="border-t border-gray-200 pt-4 mt-4">
        {/* Totals Summary */}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-2xl text-gray-600">Subtotal</Text>
          <Text className="text-2xl text-gray-800">
            ${activeOrderSubtotal.toFixed(2)}
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
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-2xl text-gray-600">Tax</Text>
          <Text className="text-2xl text-gray-800">
            ${activeOrderTax.toFixed(2)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300">
          <Text className="text-3xl font-bold text-gray-900">Total</Text>
          <Text className="text-3xl font-bold text-gray-900">
            ${activeOrderTotal.toFixed(2)}
          </Text>
        </View>

        {/* Single Action Button */}
        <TouchableOpacity
          onPress={onClose}
          className="w-full py-4 mt-6 border border-gray-300 rounded-lg items-center"
        >
          <Text className="text-2xl font-bold text-gray-700">Return</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OrderLineItemsView;
