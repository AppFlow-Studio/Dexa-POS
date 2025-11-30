import { PaymentView, usePaymentStore } from "@/stores/usePaymentStore";
import {
  Banknote,
  CheckCircle2,
  Columns,
  CreditCard,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

type PaymentMethod = "Card" | "Split" | "Cash";

const PaymentMethodSelectionView: React.FC = () => {
  const { setView, close } = usePaymentStore();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("Card");

  const paymentMethods = [
    {
      name: "Card" as PaymentMethod,
      icon: CreditCard,
      title: "Card Payment",
      description: "Credit, Debit, or Corporate Cards",
      view: "cardOptions" as PaymentView,
    },
    {
      name: "Split" as PaymentMethod,
      icon: Columns,
      title: "Split Bill",
      description: "Split by amount, item, or evenly",
      view: "split-options" as PaymentView,
    },
    {
      name: "Cash" as PaymentMethod,
      icon: Banknote,
      title: "Cash",
      description: "Standard cash transaction",
      view: "cash" as PaymentView,
    },
  ];

  const handleProceed = () => {
    const selected = paymentMethods.find((p) => p.name === selectedMethod);
    if (selected) {
      setView(selected.view);
    }
  };

  return (
    <View className="flex-1 bg-[#212121]">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Section */}
        <View className="mb-6 mt-2 items-center">
          <Text className="text-2xl font-bold text-white mb-2">
            Select Payment Method
          </Text>
          <Text className="text-gray-400 text-base">
            Choose how the customer would like to pay
          </Text>
        </View>

        {/* Cards Section */}
        <View className="gap-y-4">
          {paymentMethods.map((method) => {
            const isSelected = selectedMethod === method.name;
            const Icon = method.icon;

            return (
              <TouchableOpacity
                key={method.name}
                onPress={() => setSelectedMethod(method.name)}
                activeOpacity={0.8}
                className={`
                  flex-row items-center p-5 rounded-2xl border-2
                  ${
                    isSelected
                      ? "border-blue-500 bg-[#252b36]" // Slightly lighter dark blue-gray for active
                      : "border-[#333333] bg-[#262626]" // Subtle contrast for inactive
                  }
                `}
              >
                {/* Icon Container */}
                <View
                  className={`
                    w-12 h-12 rounded-xl items-center justify-center mr-4
                    ${isSelected ? "bg-blue-600" : "bg-[#333333]"}
                  `}
                >
                  <Icon
                    color={isSelected ? "#FFFFFF" : "#9CA3AF"}
                    size={24}
                    strokeWidth={isSelected ? 2.5 : 2}
                  />
                </View>

                {/* Text Content */}
                <View className="flex-1">
                  <Text
                    className={`text-lg font-bold mb-1 ${
                      isSelected ? "text-white" : "text-gray-300"
                    }`}
                  >
                    {method.title}
                  </Text>
                  <Text
                    className={`text-sm ${
                      isSelected ? "text-blue-200" : "text-gray-500"
                    }`}
                  >
                    {method.description}
                  </Text>
                </View>

                {/* Selection Indicator */}
                <View className="ml-2">
                  {isSelected ? (
                    <CheckCircle2
                      size={28}
                      color="#3B82F6"
                      fill="#3B82F6"
                      stroke="#fff"
                    /> // Filled check style
                  ) : (
                    <View className="w-6 h-6 rounded-full border-2 border-gray-600" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer Buttons - Fixed at bottom */}
      <View className="absolute bottom-0 left-0 right-0 bg-[#212121] pt-2 pb-4 border-t border-[#333333]">
        <View className="flex-row gap-4">
          <TouchableOpacity
            onPress={() => close()}
            className="flex-1 py-4 bg-[#2A2A2A] rounded-xl border border-[#404040] active:bg-[#333333]"
          >
            <Text className="text-center font-semibold text-lg text-gray-300">
              Cancel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleProceed}
            className="flex-1 py-4 rounded-xl bg-blue-600 active:bg-blue-700 shadow-sm"
          >
            <Text className="text-center font-bold text-lg text-white">
              Proceed
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default PaymentMethodSelectionView;
