import RadioButton from "@/components/settings/RadioButton";
import SettingsCard from "@/components/settings/SettingsCard";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { CreditCard, Monitor, Printer, Receipt } from "lucide-react-native";
import React, { useState } from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

// Define the types for our state
type IdleScreenOption = "logo" | "slideshow";
type TransactionScreenOption = "itemList" | "tipAndSign";

const CustomerDisplayScreen = () => {
  // State to manage all the settings on the page
  const [isEnabled, setIsEnabled] = useState(true);
  const [idleOption, setIdleOption] = useState<IdleScreenOption>("logo");
  const [transactionOption, setTransactionOption] =
    useState<TransactionScreenOption>("itemList");

  const hardwareSubsections = [
    {
      id: "printer",
      title: "Printers",
      subtitle: "Receipt & Kitchen",
      route: "/settings/hardware-connection/printer",
      icon: <Printer color="#3b82f6" size={24} />,
    },
    {
      id: "printer-rules",
      title: "Printer Rules",
      subtitle: "Print Configuration",
      route: "/settings/hardware-connection/printer-rules",
      icon: <Receipt color="#3b82f6" size={24} />,
    },
    {
      id: "customer-display",
      title: "Customer Display",
      subtitle: "Order Display",
      route: "/settings/hardware-connection/customer-display",
      icon: <Monitor color="#3b82f6" size={24} />,
    },
    {
      id: "payment-terminal",
      title: "Payment Terminal",
      subtitle: "Card Processing",
      route: "/settings/hardware-connection/payment-terminal",
      icon: <CreditCard color="#3b82f6" size={24} />,
    },
  ];

  return (
    <View className="flex-1 bg-[#212121] p-4">
      <View className="flex-row gap-4 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Hardware & Connection"
          subsections={hardwareSubsections}
          currentRoute="/settings/hardware-connection/customer-display"
        />

        {/* Main Content */}
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-600 p-4">
          {/* Main content area */}
          <ScrollView>
            <View className="flex-1 gap-y-4">
              {/* Enable/Disable Card */}
              <View className="bg-[#212121] flex-row justify-between items-center p-4 rounded-2xl border border-gray-600">
                <Text className="text-2xl font-bold text-white">
                  Enable customer display
                </Text>
                <Switch
                  value={isEnabled}
                  onValueChange={setIsEnabled}
                  trackColor={{ false: "#DCDCDC", true: "#31A961" }}
                  thumbColor={"#ffffff"}
                  style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
                />
              </View>

              {/* Idle Screen Options */}
              <SettingsCard title="Idle Screen Options">
                <View className="gap-y-3">
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
              <SettingsCard title="Transaction Screen Options">
                <View className="gap-y-3">
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
          </ScrollView>
          {/* Footer */}
          <View className="flex-row justify-start gap-2 pt-3 border-t border-gray-600">
            <TouchableOpacity className="px-4 py-2 border border-gray-500 rounded-lg">
              <Text className="text-xl font-bold text-gray-300">
                Connect Terminal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity className="px-6 py-2 bg-blue-500 rounded-lg">
              <Text className="text-xl font-bold text-white">Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default CustomerDisplayScreen;
