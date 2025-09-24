import RadioButton from "@/components/settings/RadioButton";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsHeader from "@/components/settings/SettingsHeader";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { Receipt, RefreshCcw, Store, Utensils } from "lucide-react-native";
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

  const storeOperationSubsections = [
    {
      id: "end-of-day",
      title: "End of Day",
      subtitle: "Daily Operations",
      route: "/settings/store-operation/end-of-day",
      icon: <Store color="#3b82f6" size={24} />,
      isLocked: true,
    },
    {
      id: "receipt-rules",
      title: "Receipt Rules",
      subtitle: "Receipt Configuration",
      route: "/settings/store-operation/receipt-rules",
      icon: <Receipt color="#3b82f6" size={24} />,
      isLocked: true,
    },
    {
      id: "dining-options",
      title: "Dining Options",
      subtitle: "Table & Seating Rules",
      route: "/settings/store-operation/dining-options",
      icon: <Utensils color="#3b82f6" size={24} />,
      isLocked: true,
    },
    {
      id: "sync-status",
      title: "Sync Status",
      subtitle: "Data Synchronization",
      route: "/settings/store-operation/sync-status",
      icon: <RefreshCcw color="#3b82f6" size={24} />,
      isLocked: true,
    },
  ];

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Store Operation"
          subsections={storeOperationSubsections}
          currentRoute="/settings/store-operation/receipt-rules"
        />

        {/* Main Content */}
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-600 p-6">
          {/* Main Content Area */}
          <View className="flex-1 gap-y-6">
            {/* Tipping Settings */}
            <View className="bg-[#212121] p-6 pt-3 rounded-2xl border border-gray-600">
              <SettingsHeader
                title="Enable Tipping"
                value={isTippingEnabled}
                onValueChange={setTippingEnabled}
              />
              <View className="bg-[#303030] p-6 rounded-2xl border border-gray-600">
                {isTippingEnabled && (
                  <View className="flex-row gap-4">
                    <TextInput
                      value={tip1}
                      onChangeText={setTip1}
                      className="flex-1 p-4 bg-[#212121] rounded-lg text-2xl font-semibold text-white border border-gray-600 h-20"
                      keyboardType="numeric"
                      placeholderTextColor="#9CA3AF"
                    />
                    <TextInput
                      value={tip2}
                      onChangeText={setTip2}
                      className="flex-1 p-4 bg-[#212121] rounded-lg text-2xl font-semibold text-white border border-gray-600 h-20"
                      keyboardType="numeric"
                      placeholderTextColor="#9CA3AF"
                    />
                    <TextInput
                      value={tip3}
                      onChangeText={setTip3}
                      className="flex-1 p-4 bg-[#212121] rounded-lg text-2xl font-semibold text-white border border-gray-600 h-20"
                      keyboardType="numeric"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                )}
              </View>
            </View>

            {/* Receipt Printing Settings */}
            <SettingsCard title="Automatic Receipt Printing">
              <View className="gap-y-4">
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
          <View className="flex-row justify-start pt-4 border-t border-gray-600">
            <TouchableOpacity className="px-8 py-4 bg-blue-500 rounded-lg">
              <Text className="text-2xl font-bold text-white">Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default ReceiptAndTippingRulesScreen;
