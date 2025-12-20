import { useOrderStore } from "@/stores/useOrderStore";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import ReadOnlyBillItem from "./ReadOnlyBillItem";

// FIX: Update props to accept a specific orderId
interface OrderLineItemsViewProps {
  onClose: () => void;
  orderId: string | null;
}
const OrderLineItemsView = ({
  onClose,
  orderId,
}: {
  onClose: () => void;
  orderId: string | null;
}) => {
  // Get all data directly from the order store
  const {
    activeOrderId,
    orders,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderDiscount,
    activeOrderTotal,
    markAllItemsAsReady,
  } = useOrderStore();

  const TAX_RATE = 0.05; // Assuming a constant tax rate

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

  // Helper for status badge styling
  const getStatusBadgeStyle = (status: string) => {
    const normalized = status?.toLowerCase() || "";
    if (normalized === "preparing" || normalized === "draft") {
      return {
        bg: "bg-amber-100",
        text: "text-amber-800",
      };
    }
    if (normalized === "ready" || normalized === "completed") {
      return {
        bg: "bg-green-100",
        text: "text-green-800",
      };
    }
    return {
      bg: "bg-blue-100",
      text: "text-blue-800",
    };
  };

  const getPaidStatusBadgeStyle = (status: string) => {
    if (status === "Paid") {
      return {
        bg: "bg-green-100",
        text: "text-green-800",
      };
    }
    if (status === "Pending") {
      return {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
      };
    }
    // Unpaid
    return {
      bg: "bg-red-100",
      text: "text-red-800",
    };
  };

  if (!orderToView) {
    return null; // Don't render if there's no order to show
  }

  const orderStatusStyle = getStatusBadgeStyle(orderToView.order_status);
  const paidStatusStyle = getPaidStatusBadgeStyle(orderToView.paid_status);

  return (
    <View className="bg-[#1C1C1E] rounded-2xl border border-[#333] overflow-hidden">
      {/* Receipt Header with Gradient */}
      <LinearGradient
        colors={["#2A2A2D", "#1C1C1E"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        className="p-5 pb-4 items-center border-b border-dashed border-[#444]"
      >
        <Text className="text-2xl font-bold text-white mb-3">
          Order Summary
        </Text>

        {/* Status Badges - Pastel Pills */}
        <View className="flex-row items-center gap-3">
          <View className={`px-4 py-1.5 rounded-full ${orderStatusStyle.bg}`}>
            <Text
              className={`text-sm font-semibold capitalize ${orderStatusStyle.text}`}
            >
              {orderToView.order_status}
            </Text>
          </View>
          <View className={`px-4 py-1.5 rounded-full ${paidStatusStyle.bg}`}>
            <Text className={`text-sm font-semibold ${paidStatusStyle.text}`}>
              {orderToView.paid_status}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Items List */}
      <View className="p-4">
        <ScrollView
          className="max-h-[350px]"
          contentContainerClassName="gap-y-2"
          showsVerticalScrollIndicator={false}
        >
          {items.map((item) => (
            <ReadOnlyBillItem
              key={item.id}
              item={item}
              expandedItemId={expandedItemId}
              onToggleExpand={handleToggleExpand}
            />
          ))}
        </ScrollView>

        {/* Totals Section */}
        <View className="border-t border-dashed border-[#444] pt-4 mt-4 gap-y-2">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-gray-400">Subtotal</Text>
            <Text
              className="text-base text-gray-300"
              style={{ fontFamily: "monospace" }}
            >
              ${subtotal.toFixed(2)}
            </Text>
          </View>
          {discount > 0 && (
            <View className="flex-row justify-between items-center">
              <Text className="text-base text-green-400">Discount</Text>
              <Text
                className="text-base text-green-400"
                style={{ fontFamily: "monospace" }}
              >
                -${discount.toFixed(2)}
              </Text>
            </View>
          )}
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-gray-400">Tax</Text>
            <Text
              className="text-base text-gray-300"
              style={{ fontFamily: "monospace" }}
            >
              ${tax.toFixed(2)}
            </Text>
          </View>

          {/* Large Total */}
          <View className="flex-row justify-between items-center pt-4 mt-2 border-t border-dashed border-[#555]">
            <Text className="text-2xl font-bold text-white">Total</Text>
            <Text
              className="text-3xl font-black text-white"
              style={{ fontFamily: "monospace" }}
            >
              ${total.toFixed(2)}
            </Text>
          </View>

          {/* Close Button */}
          <TouchableOpacity
            onPress={onClose}
            className="w-full py-3.5 mt-5 bg-[#2A2A2D] border border-[#444] rounded-xl items-center"
          >
            <Text className="text-lg font-semibold text-gray-300">Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default OrderLineItemsView;
