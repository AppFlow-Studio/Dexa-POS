import InfoField from "@/components/settings/InfoField";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { Smartphone, Wrench } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, View } from "react-native";

// Reusable component for the Hardware Status rows
const HardwareStatusRow = ({
  device,
  isConnected,
}: {
  device: string;
  isConnected: boolean;
}) => (
  <View className="flex-row justify-between items-center bg-white p-4 rounded-2xl border border-gray-200">
    <Text className="text-lg text-gray-800">{device}</Text>
    <View
      className={`flex-row items-center px-2 py-1 rounded-3xl ${isConnected ? "bg-green-100" : "bg-gray-200"}`}
    >
      <View
        className={`w-2 h-2 rounded-full mr-2 ${isConnected ? "bg-green-500" : "bg-gray-400"}`}
      />
      <Text
        className={`font-semibold text-sm ${isConnected ? "text-green-800" : "text-gray-600"}`}
      >
        {isConnected ? "Connected" : "Disconnected"}
      </Text>
    </View>
  </View>
);

const DeviceAndSupportScreen = () => {
  // In a real app, this data would come from device APIs or a context
  const deviceInfo = {
    name: "Front Counter POS",
    appVersion: "v1.2.3",
    deviceId: "axb-123-ghk-456",
    network: "Connected to Wi-Fi 'StoreNet'",
  };

  const hardwareStatus = {
    receiptPrinter: true,
    cardReader: false,
  };

  const systemSubsections = [
    {
      id: "device-support",
      title: "Device & Support",
      subtitle: "System Information",
      route: "/settings/system-and-support/device-and-support",
      icon: <Smartphone color="#3b82f6" size={20} />,
    },
    {
      id: "reset-application",
      title: "Reset Application",
      subtitle: "Factory Reset",
      route: "/settings/system-and-support/reset-application",
      icon: <Wrench color="#3b82f6" size={20} />,
      isLocked: true,
    },
  ];

  return (
    <View className="flex-1 bg-background-300 p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="System & Support"
          subsections={systemSubsections}
          currentRoute="/settings/system-and-support/device-and-support"
        />

        {/* Main Content */}
        <View className="flex-1 bg-white rounded-2xl border border-gray-200 p-6">
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="flex-1 gap-y-6">
              {/* Device Information Section */}
              <View className="gap-y-4">
                <InfoField label="Device Name" value={deviceInfo.name} />
                <InfoField label="App Version" value={deviceInfo.appVersion} />
                <InfoField label="Device ID" value={deviceInfo.deviceId} />
                <InfoField label="Network Status" value={deviceInfo.network} />
              </View>

              {/* Hardware Status Section */}
              <View className="border border-background-400 p-6 rounded-2xl">
                <Text className="text-xl font-bold text-gray-800 mb-4">
                  Hardware Status
                </Text>
                <View className="gap-y-4">
                  <HardwareStatusRow
                    device="Reciept Printer"
                    isConnected={hardwareStatus.receiptPrinter}
                  />
                  <HardwareStatusRow
                    device="Card Reader"
                    isConnected={hardwareStatus.cardReader}
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

export default DeviceAndSupportScreen;
