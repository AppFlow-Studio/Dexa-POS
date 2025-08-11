import RadioButton from "@/components/settings/RadioButton";
import SettingsCard from "@/components/settings/SettingsCard";
import React, { useState } from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";

// Define the types for our state
type IdleScreenOption = "logo" | "slideshow";
type TransactionScreenOption = "itemList" | "tipAndSign";

const CustomerDisplayScreen = () => {
  // State to manage all the settings on the page
  const [isEnabled, setIsEnabled] = useState(true);
  const [idleOption, setIdleOption] = useState<IdleScreenOption>("logo");
  const [transactionOption, setTransactionOption] =
    useState<TransactionScreenOption>("itemList");

  return (
    <View className="flex-1 bg-gray-50 p-6">
      {/* Main content area */}
      <View className="flex-1 space-y-6">
        {/* Enable/Disable Card */}
        <View className="bg-white flex-row justify-between items-center p-6 rounded-2xl border border-gray-200">
          <Text className="text-xl font-bold text-gray-800">
            Enable customer display
          </Text>
          <Switch
            value={isEnabled}
            onValueChange={setIsEnabled}
            trackColor={{ false: "#767577", true: "#81b0ff" }}
            thumbColor={isEnabled ? "#3b82f6" : "#f4f3f4"}
          />
        </View>

        {/* Idle Screen Options */}
        <SettingsCard title="Select what to show when the screen is idle">
          <View className="space-y-3">
            <RadioButton
              label="Show Store Logo"
              isSelected={idleOption === "logo"}
              onPress={() => setIdleOption("logo")}
            />
            <RadioButton
              label="Show Image Slideshow"
              isSelected={idleOption === "slideshow"}
              onPress={() => setIdleOption("slideshow")}
            />
          </View>
        </SettingsCard>

        {/* Transaction Screen Options */}
        <SettingsCard title="Select what to show during a transaction">
          <View className="space-y-3">
            <RadioButton
              label="Show Item List"
              isSelected={transactionOption === "itemList"}
              onPress={() => setTransactionOption("itemList")}
            />
            <RadioButton
              label="Show Tip & Signature Screen"
              isSelected={transactionOption === "tipAndSign"}
              onPress={() => setTransactionOption("tipAndSign")}
            />
          </View>
        </SettingsCard>
      </View>

      {/* Footer */}
      <View className="flex-row justify-end space-x-2 pt-4 border-t border-gray-200">
        <TouchableOpacity className="px-6 py-3 border border-gray-300 rounded-lg">
          <Text className="font-bold text-gray-700">
            Connect a New Terminal
          </Text>
        </TouchableOpacity>
        <TouchableOpacity className="px-8 py-3 bg-primary-400 rounded-lg">
          <Text className="font-bold text-white">Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CustomerDisplayScreen;
