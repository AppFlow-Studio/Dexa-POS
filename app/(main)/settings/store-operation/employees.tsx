import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { useEmployeeSettingsStore } from "@/stores/useEmployeeSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import {
  Receipt,
  RefreshCcw,
  Store,
  Users,
  Utensils,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const EmployeeSettingsScreen = () => {
  const { isBreakAndSwitchEnabled, setIsBreakAndSwitchEnabled } =
    useEmployeeSettingsStore();
  const { ptoAccrualRate, setPtoAccrualRate } = useStoreSettingsStore(); // Get ptoAccrualRate and setPtoAccrualRate

  const [ptoRateInput, setPtoRateInput] = useState(ptoAccrualRate.toString());

  const handlePtoRateChange = (text: string) => {
    // Allow only numbers and a single decimal point
    let cleanedText = text.replace(/[^0-9.]/g, "");
    const parts = cleanedText.split(".");
    if (parts.length > 2) {
      cleanedText = parts[0] + "." + parts.slice(1).join("");
    }
    setPtoRateInput(cleanedText);
  };

  const handleUpdatePress = () => {
    const parsedRate = parseFloat(ptoRateInput);
    if (
      !isNaN(parsedRate) &&
      parsedRate >= 0 &&
      parsedRate !== ptoAccrualRate
    ) {
      setPtoAccrualRate(parsedRate);
      toast.success("PTO Accrual Rate updated!", {
        position: ToastPosition.BOTTOM,
      });
    } else if (ptoRateInput === "" && ptoAccrualRate !== 0) {
      setPtoAccrualRate(0);
      toast.success("PTO Accrual Rate set to 0!", {
        position: ToastPosition.BOTTOM,
      });
    } else if (parsedRate === ptoAccrualRate) {
      toast.success("Rate is already up to date.", {
        position: ToastPosition.BOTTOM,
      });
    } else {
      toast.error("Invalid rate. Please enter a valid non-negative number.", {
        position: ToastPosition.BOTTOM,
      });
    }
  };

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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0} // Adjust offset as needed
    >
      <View className="flex-1 bg-[#212121] p-6">
        <View className="flex-row gap-6 h-full w-full">
          <SettingsSidebar
            title="Store Operation"
            subsections={storeOperationSubsections}
            currentRoute="/settings/store-operation/employees"
          />
          <ScrollView className="flex-1 bg-[#303030] rounded-2xl border border-gray-700 p-6">
            <Text className="text-3xl font-bold text-white mb-4">
              Employee Settings
            </Text>
            <View className="flex-row items-center justify-between p-4 bg-[#212121] rounded-lg border border-gray-600 mb-4">
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

            {/* PTO Accrual Rate Setting */}
            <View className="p-4 bg-[#212121] rounded-lg border border-gray-600">
              <Text className="text-lg font-semibold text-white mb-2">
                PTO Accrual Rate
              </Text>
              <Text className="text-sm text-gray-400 mb-3">
                Set the rate at which employees accrue PTO (e.g., 0.025 hours of
                PTO per hour worked).
              </Text>
              <View className="flex-row items-center gap-3">
                <TextInput
                  className="flex-1 p-3 bg-[#303030] rounded-md border border-gray-600 text-white text-base"
                  keyboardType="numeric"
                  value={ptoRateInput}
                  onChangeText={handlePtoRateChange}
                  placeholder="e.g., 0.025"
                  placeholderTextColor="#6B7280"
                />
                <TouchableOpacity
                  onPress={handleUpdatePress}
                  className="px-4 py-3 bg-blue-600 rounded-md"
                >
                  <Text className="text-white font-semibold">Update</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default EmployeeSettingsScreen;
