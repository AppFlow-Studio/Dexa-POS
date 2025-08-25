import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Banknote, Columns, CreditCard } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type PaymentMethod = "Card" | "Split" | "Cash";

const PaymentActions = () => {
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>("Card");
  const openPaymentModal = usePaymentStore((state) => state.open);
  const activeOrder = useOrderStore((state) =>
    state.orders.find((o) => o.id === state.activeOrderId)
  );
  const pendingTableSelection = useOrderStore((state) => state.pendingTableSelection);

  const paymentMethods = [
    { name: "Card", icon: CreditCard },
    { name: "Split", icon: Columns },
    { name: "Cash", icon: Banknote },
  ];

  const handlePlaceOrder = () => {
    // For dine-in orders, use the pending table selection
    const tableIdForOrder = activeOrder?.order_type === "Dine In"
      ? pendingTableSelection
      : activeOrder?.service_location_id;

    if (activeOrder?.order_type === "Dine In" && !tableIdForOrder) {
      toast.error("Please select a table", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // For dine-in orders, we need to check if the order is paid before assigning to table
    if (activeOrder?.order_type === "Dine In" && activeOrder.paid_status !== "Paid") {
      // Open payment modal with the pending table selection
      openPaymentModal(activeMethod, tableIdForOrder);
      return;
    }

    // For non-dine-in orders or already paid dine-in orders, proceed normally
    openPaymentModal(activeMethod, tableIdForOrder);
  };

  return (
    <View className="pt-2 px-4 bg-background-200">
      {/* Payment Method Selector */}
      <View className="flex-row justify-between items-center p-1.5 rounded-xl">
        {paymentMethods.map((method) => {
          const isActive = activeMethod === method.name;
          return (
            <TouchableOpacity
              key={method.name}
              onPress={() => setActiveMethod(method.name as PaymentMethod)}
              className={`flex-1 items-center py-2.5 rounded-xl ${isActive ? "bg-white border border-background-200" : "bg-transparent"}`}
            >
              <method.icon color={isActive ? "#659AF0" : "#5D5D73"} size={24} />
              <Text
                className={`font-semibold mt-1 ${isActive ? "text-accent-500" : "text-accent-300"}`}
              >
                {method.name}
              </Text>
              {isActive && (
                <View className="absolute bottom-0 h-1 w-8 bg-primary-400 rounded-full" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Final Action Buttons */}
      <TouchableOpacity
        disabled={!activeOrder || activeOrder.items.length === 0}
        className={`w-full py-4 bg-primary-400 rounded-xl mt-4 items-center ${!activeOrder || activeOrder.items.length === 0 ? "opacity-50" : ""}`}
        onPress={handlePlaceOrder}
      >
        <Text className="text-white font-bold text-base">Place Order</Text>
      </TouchableOpacity>
      <TouchableOpacity className="w-full py-4 bg-gray-100 rounded-xl mt-2 items-center border border-background-500">
        <Text className="text-gray-800 font-bold text-base">Open Register</Text>
      </TouchableOpacity>
    </View>
  );
};

export default PaymentActions;
