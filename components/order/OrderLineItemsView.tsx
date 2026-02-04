import { useOrderStore } from "@/stores/useOrderStore";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
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
  // CRITICAL FIX: Use proper selector with direct ID lookup instead of destructuring entire store
  // This prevents re-renders when unrelated orders change
  const orderToView = useOrderStore((s) => s.ordersById[orderId || ""]);
  const items = orderToView?.items || [];

  // Calculate totals - prefer backend values, fallback to local calculation
  const { subtotal, discount, tax, total, amountPaid, amountDue } =
    useMemo(() => {
      if (!orderToView) {
        return {
          subtotal: 0,
          discount: 0,
          tax: 0,
          total: 0,
          amountPaid: 0,
          amountDue: 0,
        };
      }

      // Calculate local subtotal from items as fallback
      const localSubtotal = orderToView.items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0,
      );

      // Calculate discount
      const disc = orderToView.checkDiscount
        ? localSubtotal * orderToView.checkDiscount.value
        : 0;

      // Prefer backend values, fallback to local calculations
      // Note: OrderProfile doesn't have a subtotal property, so we derive it from total - tax
      const finalTax = orderToView.total_tax ?? 0;
      const finalTotal =
        orderToView.total_amount ?? localSubtotal - disc + finalTax;
      const finalSubtotal = finalTotal - finalTax; // Derive subtotal from total - tax
      const finalAmountPaid = orderToView.amount_paid ?? 0;
      const finalAmountDue = orderToView.amount_due ?? finalTotal;

      return {
        subtotal: finalSubtotal > 0 ? finalSubtotal : localSubtotal,
        discount: disc,
        tax: finalTax,
        total: finalTotal,
        amountPaid: finalAmountPaid,
        amountDue: finalAmountDue,
      };
    }, [orderToView]);

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = useCallback((itemId: string) => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  }, []);

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

  // Filter non-voided payments
  const validPayments = orderToView.payments?.filter((p) => !p.isVoided) || [];
  const hasPayments = validPayments.length > 0;

  return (
    <View className="bg-[#1C1C1E] rounded-2xl border border-[#333] overflow-hidden">
      {/* Receipt Header with Gradient */}
      <LinearGradient
        colors={["#2A2A2D", "#1C1C1E"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        className="p-5 pb-4 items-center border-b border-dashed border-[#444]"
      >
        <View className="flex-row items-center gap-2 mb-3 p-5">
          <Text className="text-2xl font-bold text-white">
            Order {orderToView.display_number || orderToView.order_number || ""}
          </Text>
          {orderToView.display_number && (
            <Text className="text-sm text-gray-400">
              {new Date(orderToView.opened_at || Date.now()).toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}
            </Text>
          )}
        </View>

        {/* Status Badges - Pastel Pills */}
        <View className="flex-row items-center gap-3 px-5">
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
        <Text className="text-sm text-gray-500 uppercase mb-2 font-medium">
          Order Items
        </Text>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          className="max-h-[300px]"
          contentContainerStyle={{ gap: 8 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ReadOnlyBillItem
              item={item}
              expandedItemId={expandedItemId}
              onToggleExpand={handleToggleExpand}
            />
          )}
        />

        {/* Pricing Breakdown Section */}
        <View className="border-t border-dashed border-[#444] pt-4 mt-4 gap-y-2">
          <Text className="text-sm text-gray-500 uppercase mb-2 font-medium">
            Pricing Breakdown
          </Text>
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
          <View className="flex-row justify-between items-center pt-2 mt-2 border-t border-dashed border-[#555]">
            <Text className="text-xl font-bold text-white">Total</Text>
            <Text
              className="text-2xl font-black text-white"
              style={{ fontFamily: "monospace" }}
            >
              ${total.toFixed(2)}
            </Text>
          </View>

          {/* Amount Paid (if any) */}
          {amountPaid > 0 && (
            <View className="flex-row justify-between items-center">
              <Text className="text-base text-gray-400">Amount Paid</Text>
              <Text
                className="text-base text-green-400 font-medium"
                style={{ fontFamily: "monospace" }}
              >
                ${amountPaid.toFixed(2)}
              </Text>
            </View>
          )}

          {/* Amount Due (if not fully paid) */}
          {amountDue > 0.01 && orderToView.paid_status !== "Paid" && (
            <View className="flex-row justify-between items-center pt-2 mt-2 border-t border-dashed border-[#555]">
              <Text className="text-lg font-bold text-yellow-400">
                Balance Due
              </Text>
              <Text
                className="text-xl font-bold text-yellow-400"
                style={{ fontFamily: "monospace" }}
              >
                ${amountDue.toFixed(2)}
              </Text>
            </View>
          )}

          {/* Fully Paid indicator */}
          {orderToView.paid_status === "Paid" && (
            <View className="flex-row justify-center items-center pt-2 mt-2">
              <Text className="text-lg font-bold text-green-400">
                ✓ Fully Paid
              </Text>
            </View>
          )}
        </View>

        {/* Payment History Section */}
        {hasPayments && (
          <View className="border-t border-dashed border-[#444] pt-4 mt-4">
            <Text className="text-sm text-gray-500 uppercase mb-2 font-medium">
              Payment History
            </Text>
            {validPayments.map((p, i) => (
              <View
                key={p.id || i}
                className="flex-row justify-between items-center py-2 border-b border-[#333]"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-gray-300">{p.method}</Text>
                  {p.timestamp && (
                    <Text className="text-gray-500 text-xs">
                      {new Date(p.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  )}
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="px-2 py-0.5 rounded border border-green-600">
                    <Text className="text-green-400 text-xs font-medium">
                      Paid
                    </Text>
                  </View>
                  <Text
                    className="text-gray-300 font-medium"
                    style={{ fontFamily: "monospace" }}
                  >
                    ${p.amount.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Close Button */}
        <TouchableOpacity
          onPress={onClose}
          className="w-full py-3.5 mt-5 bg-[#2A2A2D] border border-[#444] rounded-xl items-center"
        >
          <Text className="text-lg font-semibold text-gray-300">Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OrderLineItemsView;
