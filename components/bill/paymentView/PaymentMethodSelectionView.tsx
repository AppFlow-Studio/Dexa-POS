import { colors } from "@/lib/theme";
import { PaymentView, usePaymentStore } from "@/stores/usePaymentStore";
import {
  Banknote,
  CheckCircle2,
  Columns,
  CreditCard,
  Keyboard,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

type PaymentMethod = "Card Reader" | "Manual Key-in" | "Split" | "Cash";

const PaymentMethodSelectionView: React.FC = () => {
  const setView = usePaymentStore((s) => s.setView);
  const close = usePaymentStore((s) => s.close);
  const markPaymentAsDirty = usePaymentStore((s) => s.markPaymentAsDirty);
  const activeSplitId = usePaymentStore((s) => s.activeSplitId);
  const splits = usePaymentStore((s) => s.splits);
  const splitSourceView = usePaymentStore((s) => s.splitSourceView);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("Card Reader");

  // Determine if we are paying for a specific split
  const activeSplit = splits.find((s) => s.id === activeSplitId);

  const paymentMethods = [
    {
      name: "Card Reader" as PaymentMethod,
      icon: CreditCard,
      title: "Card Reader",
      description: "Credit, Debit, or Corporate Cards",
      view: "card" as PaymentView,
    },
    {
      name: "Manual Key-in" as PaymentMethod,
      icon: Keyboard,
      title: "Manual Key-in",
      description: "Manually enter card details",
      view: "manual" as PaymentView,
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

  // LOGIC: Filter out 'Split' if we are already inside a split flow
  const availableMethods = paymentMethods.filter((method) => {
    if (activeSplit && method.name === "Split") {
      return false;
    }
    return true;
  });

  const handleProceed = () => {
    const selected = availableMethods.find((p) => p.name === selectedMethod);
    if (selected) {
      markPaymentAsDirty();
      setView(selected.view);
    }
  };

  const handleBack = () => {
    // Stop the payment loop for this specific guest temporarily
    // and go back to the split management view (Guest Checks)
    usePaymentStore.setState({ activeSplitId: null });
    setView(splitSourceView || "split-options");
  };

  return (
    <View className="flex-1 bg-panel">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 4 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Section */}
        <View className="mb-6 mt-2 items-center">
          <Text className="text-2xl font-bold text-white mb-2">
            {activeSplit
              ? `Payment for ${activeSplit.customerName}`
              : "Select Payment Method"}
          </Text>
          <Text className="text-gray-400 text-base">
            {activeSplit
              ? `Amount Due: $${activeSplit.amount.toFixed(2)}`
              : "Choose how the customer would like to pay"}
          </Text>
        </View>

        {/* Cards Section */}
        <View className="gap-y-4">
          {availableMethods.map((method) => {
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
                      ? "border-blue-500 bg-[#252b36]"
                      : "border-border bg-surface"
                  }
                `}
              >
                {/* Icon Container */}
                <View
                  className={`
                    w-12 h-12 rounded-xl items-center justify-center mr-4
                    ${isSelected ? "bg-blue-600" : "bg-surface"}
                  `}
                >
                  <Icon
                    color={isSelected ? "#FFFFFF" : colors.label}
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
                      color={colors.info}
                      fill={colors.info}
                      stroke="#fff"
                    />
                  ) : (
                    <View className="w-6 h-6 rounded-full border-2 border-gray-600" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View className="bg-panel pt-4 pb-4 border-t border-border">
        <View className="flex-row gap-4">
          {/* Back / Cancel Button */}
          <TouchableOpacity
            onPress={() => (activeSplit ? handleBack() : close())}
            className="flex-1 py-4 bg-surface rounded-xl border border-border active:bg-surface"
          >
            <Text className="text-center font-semibold text-lg text-gray-300">
              {activeSplit ? "Back" : "Cancel"}
            </Text>
          </TouchableOpacity>

          {/* Proceed Button */}
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
