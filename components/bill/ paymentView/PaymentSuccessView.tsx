import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { FileText, Printer, ShoppingBag } from "lucide-react-native";
import React, { useEffect, useRef } from "react"; // Import useMemo
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const ReceiptRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-row justify-between items-center py-3 border-b border-dashed border-gray-200">
    <Text className="text-2xl text-gray-500">{label}</Text>
    <Text className="text-2xl font-semibold text-gray-800">{value}</Text>
  </View>
);

const PaymentSuccessView = () => {
  const { close, paymentMethod, activeTableId } = usePaymentStore();
  const { updateTableStatus } = useFloorPlanStore();
  const { clearSelectedTable } = useDineInStore();
  const {
    activeOrderId,
    orders,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderTotal,
    activeOrderDiscount,
    activeOrderOutstandingTotal,
    addPaymentToOrder,
  } = useOrderStore();
  // Apply payment once when this success view mounts
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current) return;
    if (activeOrderId && activeOrderOutstandingTotal > 0) {
      addPaymentToOrder(
        activeOrderId,
        activeOrderOutstandingTotal,
        (paymentMethod || "Card") as any
      );
    }
    appliedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const items = activeOrder?.items || [];

  const handleDone = () => {
    const {
      activeOrderId,
      updateOrderStatus,
      markOrderAsPaid,
      startNewOrder,
      setActiveOrder,
    } = useOrderStore.getState(); // Get the current active order ID

    if (activeOrderId) {
      // Mark the order as paid
      markOrderAsPaid(activeOrderId);
    }

    // For dine-in orders, the table is already assigned, just update status
    if (activeOrder?.order_type === "Dine In" && activeTableId) {
      updateTableStatus(activeTableId, "In Use");
    }

    if (activeOrderId) {
      updateOrderStatus(activeOrderId, "Preparing");
    }

    // Clear the selected table for dine-in orders
    clearSelectedTable();

    // Close the payment modal
    close();

    // Start a new order for the next customer
    setTimeout(() => {
      const newOrder = startNewOrder();
      setActiveOrder(newOrder.id);
    }, 100); // Small delay to ensure the modal closes first
  };

  // Create a simplified summary for the receipt using the correct `items`
  const receiptSummary = items.reduce(
    (acc, item) => {
      const existing = acc.find((i) => i.name === item.name);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice += item.price * item.quantity;
      } else {
        acc.push({
          name: item.name,
          quantity: item.quantity,
          totalPrice: item.price * item.quantity,
        });
      }
      return acc;
    },
    [] as { name: string; quantity: number; totalPrice: number }[]
  );

  const totalItemsCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <View className="rounded-[36px] overflow-hidden bg-[#2BAE74]">
      {/* Green Success Header */}
      <View className="p-6 rounded-t-[36px] items-center">
        <View className="w-24 h-24 bg-white/20 rounded-full items-center justify-center">
          <View className="w-20 h-20 bg-white rounded-full items-center justify-center">
            <ShoppingBag color="#22c55e" size={48} />
          </View>
        </View>
        <Text className="text-4xl font-bold text-white mt-4">
          Payment Successful
        </Text>
      </View>

      {/* White Content */}
      <View className="p-6 rounded-[36px] bg-background-100">
        <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
          {/* Transaction Details */}
          <ReceiptRow label="No. Transaction" value="PZ05329283" />
          <ReceiptRow label="Table" value="T-12, T-05, T-14" />
          <ReceiptRow label="Payment" value={paymentMethod || "N/A"} />
          <ReceiptRow label="Payment Terminal Id" value="Terminal-a-457678" />

          {/* Item Details */}
          <View className="mt-4">
            <ReceiptRow
              label="Total Items"
              value={`${totalItemsCount} Items`}
            />
            {receiptSummary.map((item) => (
              <ReceiptRow
                key={item.name}
                label={item.name}
                value={`${item.totalPrice.toFixed(2)}`}
              />
            ))}
          </View>

          {/* Financial Details */}
          <View className="mt-4">
            <ReceiptRow
              label="Subtotal"
              value={`${activeOrderSubtotal.toFixed(2)}`}
            />
            {activeOrderDiscount > 0 && (
              <ReceiptRow
                label="Discount"
                value={`-${activeOrderDiscount.toFixed(2)}`}
              />
            )}
            <ReceiptRow label="Tax" value={`${activeOrderTax.toFixed(2)}`} />
            <ReceiptRow label="Voucher" value={`${(0.0).toFixed(2)}`} />
          </View>

          {/* Total */}
          <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300 mt-4">
            <Text className="text-3xl font-bold text-accent-500">Total</Text>
            <Text className="text-3xl font-bold text-accent-500">
              ${activeOrderTotal.toFixed(2)}
            </Text>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View className="border-t border-gray-200 pt-4 mt-6">
          <View className="flex-row gap-4 mb-3">
            <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-4 border border-gray-300 rounded-lg">
              <FileText color="#4b5563" size={24} />
              <Text className="text-2xl font-bold text-gray-700">
                View Order
              </Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-4 border border-gray-300 rounded-lg">
              <Printer color="#4b5563" size={24} />
              <Text className="text-2xl font-bold text-gray-700">
                Print Receipt
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleDone}
            className="w-full py-4 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white text-2xl">Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default PaymentSuccessView;
