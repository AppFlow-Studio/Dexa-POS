import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { useEmployeeSettingsStore } from "@/stores/useEmployeeSettingsStore";
import {
  Receipt,
  RefreshCcw,
  Store,
  Users,
  Utensils,
} from "lucide-react-native";
import React from "react";
import { Switch, Text, View } from "react-native";

const EmployeeSettingsScreen = () => {
  const { isBreakAndSwitchEnabled, setIsBreakAndSwitchEnabled } =
    useEmployeeSettingsStore();

  const storeOperationSubsections = [
    {
      id: "end-of-day",
      title: "End of Day",
      subtitle: "Daily Operations",
      route: "/settings/store-operation/end-of-day",
      icon: <Store color="#3b82f6" size={24} />,
    },
    {
      id: "receipt-rules",
      title: "Receipt Rules",
      subtitle: "Receipt Configuration",
      route: "/settings/store-operation/receipt-rules",
      icon: <Receipt color="#3b82f6" size={24} />,
    },
    {
      id: "dining-options",
      title: "Dining Options",
      subtitle: "Table & Seating Rules",
      route: "/settings/store-operation/dining-options",
      icon: <Utensils color="#3b82f6" size={24} />,
    },
    {
      id: "sync-status",
      title: "Sync Status",
      subtitle: "Data Synchronization",
      route: "/settings/store-operation/sync-status",
      icon: <RefreshCcw color="#3b82f6" size={24} />,
    },
    {
      id: "employees",
      title: "Employee Settings",
      subtitle: "Break and login rules",
      route: "/settings/store-operation/employees",
      icon: <Users color="#3b82f6" size={24} />,
    },
  ];

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        <SettingsSidebar
          title="Store Operation"
          subsections={storeOperationSubsections}
          currentRoute="/settings/store-operation/employees"
        />
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-700 p-6">
          <Text className="text-3xl font-bold text-white mb-4">
            Employee Settings
          </Text>
          <View className="flex-row items-center justify-between p-4 bg-[#212121] rounded-lg border border-gray-600">
            <View>
              <Text className="text-lg font-semibold text-white">
                Enable Break & Switch Account
              </Text>
              <Text className="text-sm text-gray-400 mt-1">
                Allow another employee to log in while someone is on break.
              </Text>
            </View>
            <Switch
              value={isBreakAndSwitchEnabled}
              onValueChange={setIsBreakAndSwitchEnabled}
              trackColor={{ false: "#767577", true: "#81b0ff" }}
              thumbColor={isBreakAndSwitchEnabled ? "#3b82f6" : "#f4f3f4"}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

export default EmployeeSettingsScreen;
