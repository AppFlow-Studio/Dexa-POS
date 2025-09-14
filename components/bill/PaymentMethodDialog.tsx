import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Banknote, Columns, CreditCard, X } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent } from "../ui/dialog";
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
            description: "Credit/Debit Card"
        },
        {
            name: "Split" as PaymentMethod,
            icon: Columns,
            description: "Split Payment"
        },
        {
            name: "Cash" as PaymentMethod,
            icon: Banknote,
            description: "Cash Payment"
        },
    ];

    const handleSelectMethod = (method: PaymentMethod) => {
        setSelectedMethod(method);
    };

    const handleProceedToPayment = () => {
        // For dine-in orders, check if table is selected
        if (activeOrder?.order_type === "Dine In" && !selectedTable) {
            toast.error("Please select a table", {
                duration: 4000,
                position: ToastPosition.BOTTOM,
            });
            return;
        }

        // If this is a dine-in order with a selected table, assign it first
        if (activeOrder?.order_type === "Dine In" && selectedTable && activeOrder.id) {
            assignOrderToTable(activeOrder.id, selectedTable.id);
            updateTableStatus(selectedTable.id, "In Use");
            clearSelectedTable(); // Clear the selected table after assignment
        }

        // Open payment modal with the table ID
        const tableIdForOrder = activeOrder?.order_type === "Dine In" ? selectedTable?.id : activeOrder?.service_location_id;
        openPaymentModal(selectedMethod, tableIdForOrder);
        onClose();
    };

    return (
        <Dialog
            open={isVisible}
            onOpenChange={onClose}
        >
            <DialogContent className=" w-full ">
                <View className="bg-white rounded-2xl p-6 w-full">
                    {/* Header */}
                    <View className="flex-row justify-between items-center mb-6 w-full">
                        <Text className="text-xl font-bold text-gray-800">Select Payment Method</Text>
                        <TouchableOpacity onPress={onClose} className="p-2">
                            <X color="#6b7280" size={24} />
                        </TouchableOpacity>
                    </View>

                    {/* Payment Method Options */}
                    <View className="gap-y-3 mb-6 w-full">
                        {paymentMethods.map((method) => {
                            const isSelected = selectedMethod === method.name;
                            return (
                                <TouchableOpacity
                                    key={method.name}
                                    onPress={() => handleSelectMethod(method.name)}
                                    className={`flex-row items-center p-4 w-full rounded-xl border-2 ${isSelected
                                        ? "border-primary-400 bg-primary-50"
                                        : "border-gray-200 bg-white"
                                        }`}
                                >
                                    <View className={`p-3 rounded-xl mr-4 ${isSelected ? "bg-primary-400" : "bg-gray-100"
                                        }`}>
                                        <method.icon
                                            color={isSelected ? "#FFFFFF" : "#6b7280"}
                                            size={24}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className={`font-bold text-lg ${isSelected ? "text-primary-600" : "text-gray-800"
                                            }`}>
                                            {method.name}
                                        </Text>
                                        <Text className={`text-sm ${isSelected ? "text-primary-500" : "text-gray-600"
                                            }`}>
                                            {method.description}
                                        </Text>
                                    </View>
                                    {isSelected && (
                                        <View className="w-6 h-6 bg-primary-400 rounded-full items-center justify-center">
                                            <View className="w-2 h-2 bg-white rounded-full" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Action Buttons */}
                    <View className="flex-row gap-3">
                        <TouchableOpacity
                            onPress={onClose}
                            className="flex-1 py-3 bg-gray-100 rounded-xl"
                        >
                            <Text className="text-center font-bold text-gray-800">Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleProceedToPayment}
                            disabled={!activeOrder || activeOrder.items.length === 0}
                            className={`flex-1 py-3 rounded-xl ${!activeOrder || activeOrder.items.length === 0
                                ? "bg-gray-300"
                                : "bg-primary-400"
                                }`}
                        >
                            <Text className={`text-center font-bold ${!activeOrder || activeOrder.items.length === 0
                                ? "text-gray-500"
                                : "text-white"
                                }`}>
                                Proceed to Payment
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </DialogContent>
        </Dialog>
    );
};

export default PaymentMethodDialog;
