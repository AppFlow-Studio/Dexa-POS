import { usePaymentStore } from "@/stores/usePaymentStore";
import { Banknote, Columns, CreditCard } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

type PaymentMethod = "Card" | "Split" | "Cash";

const paymentMethods = [
  { name: "Card", icon: CreditCard },
  { name: "Split", icon: Columns },
  { name: "Cash", icon: Banknote },
];

const PaymentMethodButton = ({ method, isSelected, onPress }: any) => (
  <TouchableOpacity
    onPress={onPress}
    className={`flex-1 items-center py-4 rounded-xl border-2 ${isSelected ? "border-primary-400 bg-primary-100" : "border-gray-200 bg-white"}`}
  >
    <method.icon color={isSelected ? "#3b82f6" : "#4b5563"} size={32} />
    <Text
      className={`font-bold mt-2 ${isSelected ? "text-primary-400" : "text-gray-700"}`}
    >
      {method.name}
    </Text>
  </TouchableOpacity>
);

interface SelectPaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SelectPaymentMethodModal: React.FC<SelectPaymentMethodModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>("Card");
  const { open: openPaymentFlow, activeTableId } = usePaymentStore();

  const handleProceed = () => {
    onClose();
    setTimeout(() => {
      // Pass the `activeTableId` along when opening the main payment modal
      openPaymentFlow(activeMethod, activeTableId);
    }, 150);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[550px] p-6 rounded-2xl bg-[#212121]">
        <DialogTitle className="text-2xl font-bold text-white text-center mb-6">
          Select Payment Method
        </DialogTitle>

        <View className="flex-row gap-4">
          {paymentMethods.map((method) => (
            <PaymentMethodButton
              key={method.name}
              method={method}
              isSelected={activeMethod === method.name}
              onPress={() => setActiveMethod(method.name as PaymentMethod)}
            />
          ))}
        </View>

        <View className="flex-row gap-2 mt-8">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
          >
            <Text className="font-bold text-gray-200">Close</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleProceed}
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Proceed</Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default SelectPaymentMethodModal;
