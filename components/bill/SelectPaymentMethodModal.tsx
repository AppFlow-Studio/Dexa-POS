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
    className={`flex-1 items-center py-6 rounded-2xl border-2 ${isSelected ? "border-blue-500 bg-blue-900/30" : "border-gray-600 bg-[#303030]"}`}
  >
    <method.icon color={isSelected ? "#60A5FA" : "#9CA3AF"} size={32} />
    <Text
      className={`font-bold mt-2 text-2xl ${isSelected ? "text-blue-400" : "text-gray-300"}`}
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
      openPaymentFlow(activeMethod, activeTableId);
    }, 150);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[600px] p-8 rounded-2xl bg-[#212121] border-gray-700">
        <DialogTitle className="text-3xl font-bold text-white text-center mb-6">
          Select Payment Method
        </DialogTitle>

        <View className="flex-row gap-6">
          {paymentMethods.map((method) => (
            <PaymentMethodButton
              key={method.name}
              method={method}
              isSelected={activeMethod === method.name}
              onPress={() => setActiveMethod(method.name as PaymentMethod)}
            />
          ))}
        </View>

        <View className="flex-row gap-4 mt-8">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-4 bg-[#303030] border border-gray-600 rounded-xl items-center"
          >
            <Text className="font-bold text-2xl text-white">Close</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleProceed}
            className="flex-1 py-4 bg-blue-600 rounded-xl items-center"
          >
            <Text className="font-bold text-2xl text-white">Proceed</Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default SelectPaymentMethodModal;
