import { usePaymentStore } from "@/stores/usePaymentStore";
import {
  ArrowLeft,
  ChevronRight,
  CreditCard,
  Keyboard,
} from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const CardPaymentOptions = () => {
  const setView = usePaymentStore((s) => s.setView);

  const handleUseCardReader = () => {
    setView("card");
  };

  const handleManualEntry = () => {
    setView("manual");
  };

  const handleBack = () => {
    // Usually better to go back to method selection rather than review
    // so the user can change their mind about "Card" vs "Cash"
    setView("payment-method-selection");
  };

  return (
    <View className="flex-1 bg-[#212121]">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View className="mb-8 mt-2 items-center">
          <View className="w-16 h-16 bg-blue-900/20 rounded-full items-center justify-center mb-4">
            <CreditCard size={32} color="#60A5FA" />
          </View>
          <Text className="text-2xl font-bold text-white mb-2">
            Card Payment
          </Text>
          <Text className="text-gray-400 text-base text-center px-8">
            Select how you want to process the card transaction.
          </Text>
        </View>

        {/* Options Section */}
        <View className="gap-y-4 px-2">
          {/* Option 1: Terminal / Reader */}
          <TouchableOpacity
            onPress={handleUseCardReader}
            activeOpacity={0.7}
            className="flex-row items-center p-5 rounded-2xl bg-[#262626] border border-[#333333] active:bg-[#303030]"
          >
            <View className="w-12 h-12 rounded-xl bg-blue-600/10 items-center justify-center mr-4">
              <CreditCard size={24} color="#3B82F6" />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-bold text-white mb-1">
                Use Card Reader
              </Text>
              <Text className="text-sm text-gray-500">
                Tap, insert, or swipe on terminal
              </Text>
            </View>
            <ChevronRight size={20} color="#525252" />
          </TouchableOpacity>

          {/* Option 2: Manual Entry */}
          <TouchableOpacity
            onPress={handleManualEntry}
            activeOpacity={0.7}
            className="flex-row items-center p-5 rounded-2xl bg-[#262626] border border-[#333333] active:bg-[#303030]"
          >
            <View className="w-12 h-12 rounded-xl bg-purple-600/10 items-center justify-center mr-4">
              <Keyboard size={24} color="#A855F7" />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-bold text-white mb-1">
                Manual Entry
              </Text>
              <Text className="text-sm text-gray-500">
                Type card number manually
              </Text>
            </View>
            <ChevronRight size={20} color="#525252" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Footer / Back Button */}
      <View className="absolute bottom-0 left-0 right-0 bg-[#212121] pt-2 pb-4 border-t border-[#333333]">
        <TouchableOpacity
          onPress={handleBack}
          className="flex-row items-center justify-center py-4 bg-[#2A2A2A] rounded-xl border border-[#404040] active:bg-[#333333] mx-4"
        >
          <ArrowLeft size={20} color="#D1D5DB" className="mr-2" />
          <Text className="font-semibold text-lg text-gray-300">Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CardPaymentOptions;
