import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Banknote, Columns, CreditCard, X } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

interface PaymentMethodDialogProps {
  isVisible: boolean;
  onClose: () => void;
}

type PaymentMethod = "Card" | "Split" | "Cash";

const PaymentMethodDialog: React.FC<PaymentMethodDialogProps> = ({
  isVisible,
  onClose,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("Card");
  const openPaymentModal = usePaymentStore((state) => state.open);
  const activeOrder = useOrderStore((state) =>
    state.orders.find((o) => o.id === state.activeOrderId)
  );
  const { selectedTable, clearSelectedTable } = useDineInStore();
  const { assignOrderToTable } = useOrderStore();
  const { updateTableStatus } = useFloorPlanStore();

  const paymentMethods = [
    {
      name: "Card" as PaymentMethod,
      icon: CreditCard,
      description: "Credit/Debit Card",
    },
    {
      name: "Split" as PaymentMethod,
      icon: Columns,
      description: "Split Payment",
    },
    {
      name: "Cash" as PaymentMethod,
      icon: Banknote,
      description: "Cash Payment",
    },
  ];

  const handleSelectMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
  };

  const handleProceedToPayment = () => {
    if (activeOrder?.order_type === "Dine In" && !selectedTable) {
      toast.error("Please select a table", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    if (
      activeOrder?.order_type === "Dine In" &&
      selectedTable &&
      activeOrder.id
    ) {
      assignOrderToTable(activeOrder.id, selectedTable.id);
      updateTableStatus(selectedTable.id, "In Use");
      clearSelectedTable();
    }

    const tableIdForOrder =
      activeOrder?.order_type === "Dine In"
        ? selectedTable?.id
        : activeOrder?.service_location_id;
    openPaymentModal(selectedMethod, tableIdForOrder);
    onClose();
  };

  return (
    <Dialog open={isVisible} onOpenChange={onClose}>
      <DialogContent className="w-[600px] bg-[#212121] border-gray-700 p-6 rounded-2xl">
        <View className="flex-row justify-between items-center mb-4">
          <DialogTitle className="text-2xl font-bold text-white">
            Select Payment Method
          </DialogTitle>
          <TouchableOpacity onPress={onClose} className="p-2">
            <X color="#9CA3AF" size={20} />
          </TouchableOpacity>
        </View>

        <View className="gap-y-3 mb-6 w-full">
          {paymentMethods.map((method) => {
            const isSelected = selectedMethod === method.name;
            return (
              <TouchableOpacity
                key={method.name}
                onPress={() => handleSelectMethod(method.name)}
                className={`flex-row items-center p-4 w-full rounded-xl border-2 ${
                  isSelected
                    ? "border-blue-500 bg-blue-900/30"
                    : "border-gray-600 bg-[#303030]"
                }`}
              >
                <View
                  className={`p-3 rounded-xl mr-4 ${
                    isSelected ? "bg-blue-600" : "bg-gray-700"
                  }`}
                >
                  <method.icon
                    color={isSelected ? "#FFFFFF" : "#9CA3AF"}
                    size={24}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className={`font-bold text-xl ${
                      isSelected ? "text-blue-400" : "text-white"
                    }`}
                  >
                    {method.name}
                  </Text>
                  <Text
                    className={`text-lg ${
                      isSelected ? "text-blue-300" : "text-gray-400"
                    }`}
                  >
                    {method.description}
                  </Text>
                </View>
                {isSelected && (
                  <View className="w-6 h-6 border-2 border-blue-500 bg-blue-600 rounded-full items-center justify-center">
                    <View className="w-3 h-3 bg-white rounded-full" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="flex-row gap-4">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 bg-[#303030] rounded-xl border border-gray-600"
          >
            <Text className="text-center font-bold text-lg text-white">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleProceedToPayment}
            disabled={!activeOrder || activeOrder.items.length === 0}
            className={`flex-1 py-3 rounded-xl ${
              !activeOrder || activeOrder.items.length === 0
                ? "bg-gray-500"
                : "bg-blue-600"
            }`}
          >
            <Text
              className={`text-center font-bold text-lg ${
                !activeOrder || activeOrder.items.length === 0
                  ? "text-gray-400"
                  : "text-white"
              }`}
            >
              Proceed
            </Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentMethodDialog;
