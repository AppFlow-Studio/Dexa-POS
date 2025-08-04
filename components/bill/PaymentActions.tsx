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
        className="w-full py-4 bg-primary-400 rounded-xl mt-4 items-center"
        onPress={onPlaceOrder}
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
