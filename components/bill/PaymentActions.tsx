import { Banknote, Columns, CreditCard } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type PaymentMethod = "Card" | "Split" | "Cash";

interface PaymentActionsProps {
  onPlaceOrder: () => void;
}

const PaymentActions: React.FC<PaymentActionsProps> = ({ onPlaceOrder }) => {
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>("Card");

  const paymentMethods = [
    { name: "Card", icon: CreditCard },
    { name: "Split", icon: Columns },
    { name: "Cash", icon: Banknote },
  ];

  return (
    <View className="mt-4">
      {/* Payment Method Selector */}
      <View className="flex-row justify-between items-center bg-gray-100 p-1.5 rounded-xl">
        {paymentMethods.map((method) => {
          const isActive = activeMethod === method.name;
          return (
            <TouchableOpacity
              key={method.name}
              onPress={() => setActiveMethod(method.name as PaymentMethod)}
              className={`flex-1 items-center py-2.5 rounded-lg ${isActive ? "bg-white" : "bg-transparent"}`}
            >
              <method.icon color={isActive ? "#3b82f6" : "#4b5563"} size={24} />
              <Text
                className={`font-semibold mt-1 ${isActive ? "text-blue-600" : "text-gray-700"}`}
              >
                {method.name}
              </Text>
              {isActive && (
                <View className="absolute bottom-0 h-1 w-8 bg-blue-500 rounded-full" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Final Action Buttons */}
      <TouchableOpacity
        className="w-full py-4 bg-blue-500 rounded-xl mt-4 items-center"
        onPress={onPlaceOrder}
      >
        <Text className="text-white font-bold text-base">Place Order</Text>
      </TouchableOpacity>
      <TouchableOpacity className="w-full py-4 bg-gray-100 rounded-xl mt-2 items-center border border-gray-200">
        <Text className="text-gray-800 font-bold text-base">Open Register</Text>
      </TouchableOpacity>
    </View>
  );
};

export default PaymentActions;
