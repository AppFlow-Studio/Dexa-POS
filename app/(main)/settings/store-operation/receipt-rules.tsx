import Header from "@/components/Header";
import RadioButton from "@/components/settings/RadioButton";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsHeader from "@/components/settings/SettingsHeader";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

// Define the types for our state
type ReceiptOption = "alwaysPrint" | "alwaysAsk" | "neverPrint";

const ReceiptAndTippingRulesScreen = () => {
  // State for all settings on this page
  const [isTippingEnabled, setTippingEnabled] = useState(true);
  const [tip1, setTip1] = useState("18%");
  const [tip2, setTip2] = useState("20%");
  const [tip3, setTip3] = useState("25%");
  const [receiptOption, setReceiptOption] =
    useState<ReceiptOption>("alwaysPrint");

  return (
    <View className="flex-1 bg-gray-50 p-6">
      <Header />
      {/* The title of this page in the design is "Customer Display", but the sidebar says "Receipt and Tipping Rules". Using the latter for clarity. */}
      <Text className="text-3xl font-bold text-gray-800 my-4">
        Receipt and Tipping Rules
      </Text>

      {/* Main Content Area */}
      <View className="flex-1 space-y-6">
        {/* Tipping Settings */}
        <View className="bg-white p-6 rounded-2xl border border-gray-200">
          <SettingsHeader
            title="Enable Tipping"
            value={isTippingEnabled}
            onValueChange={setTippingEnabled}
          />
          {isTippingEnabled && (
            <View className="flex-row space-x-4 mt-4">
              <TextInput
                value={tip1}
                onChangeText={setTip1}
                className="flex-1 p-3 bg-gray-100 rounded-lg text-center font-semibold text-gray-700"
                keyboardType="numeric"
              />
              <TextInput
                value={tip2}
                onChangeText={setTip2}
                className="flex-1 p-3 bg-gray-100 rounded-lg text-center font-semibold text-gray-700"
                keyboardType="numeric"
              />
              <TextInput
                value={tip3}
                onChangeText={setTip3}
                className="flex-1 p-3 bg-gray-100 rounded-lg text-center font-semibold text-gray-700"
                keyboardType="numeric"
              />
            </View>
          )}
        </View>

        {/* Receipt Printing Settings */}
        <SettingsCard title="Automatic Receipt Printing">
          <View className="space-y-3">
            <RadioButton
              label="Always Print Receipt"
              isSelected={receiptOption === "alwaysPrint"}
              onPress={() => setReceiptOption("alwaysPrint")}
            />
            <RadioButton
              label="Always Ask Customer"
              isSelected={receiptOption === "alwaysAsk"}
              onPress={() => setReceiptOption("alwaysAsk")}
            />
            <RadioButton
              label="Never Print Receipt (Email Only)"
              isSelected={receiptOption === "neverPrint"}
              onPress={() => setReceiptOption("neverPrint")}
            />
          </View>
        </SettingsCard>
      </View>

      {/* Footer */}
      <View className="flex-row justify-end pt-4 border-t border-gray-200">
        <TouchableOpacity className="px-8 py-3 bg-primary-400 rounded-lg">
          <Text className="font-bold text-white">Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ReceiptAndTippingRulesScreen;
