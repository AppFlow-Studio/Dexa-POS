import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Printer, ShoppingBag } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

const ReceiptRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-row justify-between items-center py-3 border-b border-dashed border-gray-700">
    <Text className="text-2xl text-gray-400">{label}</Text>
    <Text className="text-2xl font-semibold text-white">{value}</Text>
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
    } = useOrderStore.getState();

    if (activeOrderId) {
      markOrderAsPaid(activeOrderId);
    }

    if (activeOrder?.order_type === "Dine In" && activeTableId) {
      updateTableStatus(activeTableId, "In Use");
    }

    if (activeOrderId) {
      updateOrderStatus(activeOrderId, "Preparing");
    }

    clearSelectedTable();
    close();

    setTimeout(() => {
      const newOrder = startNewOrder();
      setActiveOrder(newOrder.id);
    }, 100);
  };

  const handlePrint = () => {
    toast.success("Receipt sent to printer", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  // Create a simplified summary for the receipt using the correct `items`
  // Don't group items by name - preserve each unique item with its modifiers
  const receiptSummary = items.map(item => ({
    name: item.name,
    quantity: item.quantity,
    totalPrice: item.price * item.quantity,
    // Include modifier info in the name for clarity
    displayName: (item.customizations.modifiers && item.customizations.modifiers.length > 0) || item.customizations.notes
      ? `${item.name}${item.customizations.notes ? ` (${item.customizations.notes})` : ''}${(item.customizations.modifiers && item.customizations.modifiers.length > 0) ? ` [${item.customizations.modifiers.map(m => m.categoryName).join(', ')}]` : ''}`
      : item.name
  }));

  const totalItemsCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <View className="rounded-2xl overflow-hidden bg-[#2BAE74] w-[600px]">
      <View className="p-8 items-center">
        <View className="w-24 h-24 bg-white/20 rounded-full items-center justify-center">
          <View className="w-20 h-20 bg-white rounded-full items-center justify-center">
            <ShoppingBag color="#22c55e" size={48} />
          </View>
        </View>
        <Text className="text-4xl font-bold text-white mt-4">
          Payment Successful
        </Text>
      </View>

      <View className="p-8 bg-[#303030] rounded-b-2xl">
        <ScrollView
          className="max-h-[350px]"
          showsVerticalScrollIndicator={false}
        >
          <ReceiptRow
            label="Transaction No."
            value={activeOrder?.id.slice(-10).toUpperCase() || "N/A"}
          />
          <ReceiptRow
            label="Table"
            value={activeOrder?.service_location_id || "N/A"}
          />
          <ReceiptRow label="Payment Method" value={paymentMethod || "N/A"} />

          <View className="mt-4">
            <ReceiptRow
              label="Total Items"
              value={`${totalItemsCount} Items`}
            />
            {receiptSummary.map((item, index) => (
              <ReceiptRow
                key={`${item.name}_${index}`}
                label={item.displayName}
                value={`${item.totalPrice.toFixed(2)}`}
              />
            ))}
          </View>

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
          </View>

          <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-600 mt-4">
            <Text className="text-3xl font-bold text-white">Total</Text>
            <Text className="text-3xl font-bold text-white">
              ${activeOrderTotal.toFixed(2)}
            </Text>
          </View>
        </ScrollView>

        <View className="border-t border-gray-700 pt-6 mt-6">
          <View className="flex-row gap-4 mb-3">
            <TouchableOpacity
              onPress={handlePrint}
              className="flex-1 flex-row justify-center items-center gap-2 py-4 border border-gray-600 rounded-xl bg-[#212121]"
            >
              <Printer color="#9CA3AF" size={24} />
              <Text className="text-2xl font-bold text-gray-300">
                Print Receipt
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleDone}
            className="w-full py-4 bg-blue-600 rounded-xl items-center"
          >
            <Text className="font-bold text-white text-2xl">Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default PaymentSuccessView;
