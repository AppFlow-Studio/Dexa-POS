import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useRouter } from "expo-router";
import { FileText, Printer, ShoppingBag } from "lucide-react-native";
import React from "react"; // Import useMemo
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const ReceiptRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-row justify-between items-center py-2 border-b border-dashed border-gray-200">
    <Text className="text-base text-gray-500">{label}</Text>
    <Text className="text-base font-semibold text-gray-800">{value}</Text>
  </View>
);

const PaymentSuccessView = () => {
  const router = useRouter();
  const { close, paymentMethod, activeTableId } = usePaymentStore();
  const { updateTableStatus } = useFloorPlanStore();
  const {
    activeOrderId,
    orders,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderTotal,
    activeOrderDiscount,
    closeActiveOrder,
  } = useOrderStore();
  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const items = activeOrder?.items || [];

  const handleDone = () => {
    const { activeOrderId } = useOrderStore.getState(); // Get the current active order ID

    if (activeOrderId) {
      // Close the order in the order store
      closeActiveOrder();
    }

    console.log("Table ID:", activeTableId);
    if (activeTableId) {
      // If the order was for a table, update the table's status
      updateTableStatus(activeTableId, "Needs Cleaning");
      // Close the payment modal
      close();
      // Navigate to the clean table screen using the correct path format
      router.push(`/tables/clean-table/${activeTableId}`);
    } else {
      // If it was a global/walk-in order, just close the modal
      close();
    }
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
        <View className="w-20 h-20 bg-white/20 rounded-full items-center justify-center">
          <View className="w-16 h-16 bg-white rounded-full items-center justify-center">
            <ShoppingBag color="#22c55e" size={32} />
          </View>
        </View>
        <Text className="text-3xl font-bold text-white mt-4">
          Payment Successful
        </Text>
      </View>

      {/* White Content */}
      <View className="p-6 rounded-[36px] bg-background-100">
        <ScrollView className="max-h-80" showsVerticalScrollIndicator={false}>
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
                value={`$${item.totalPrice.toFixed(2)}`}
              />
            ))}
          </View>

          {/* Financial Details */}
          <View className="mt-4">
            <ReceiptRow
              label="Subtotal"
              value={`$${activeOrderSubtotal.toFixed(2)}`}
            />
            {activeOrderDiscount > 0 && (
              <ReceiptRow
                label="Discount"
                value={`-$${activeOrderDiscount.toFixed(2)}`}
              />
            )}
            <ReceiptRow label="Tax" value={`$${activeOrderTax.toFixed(2)}`} />
            <ReceiptRow label="Voucher" value={`$${(0.0).toFixed(2)}`} />
          </View>

          {/* Total */}
          <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300 mt-4">
            <Text className="text-xl font-bold text-accent-500">Total</Text>
            <Text className="text-xl font-bold text-accent-500">
              ${activeOrderTotal.toFixed(2)}
            </Text>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View className="border-t border-gray-200 pt-4 mt-6">
          <View className="flex-row gap-3 mb-3">
            <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-3 border border-gray-300 rounded-lg">
              <FileText color="#4b5563" size={20} />
              <Text className="font-bold text-gray-700">View Order</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-3 border border-gray-300 rounded-lg">
              <Printer color="#4b5563" size={20} />
              <Text className="font-bold text-gray-700">Print Receipt</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleDone}
            className="w-full py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white text-base">Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default PaymentSuccessView;
