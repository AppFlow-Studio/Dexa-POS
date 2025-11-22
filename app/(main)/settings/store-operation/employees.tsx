import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { useToast } from "@/contexts/ToastContext"; // Import useToast
import { useEmployeeSettingsStore } from "@/stores/useEmployeeSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
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
  const {
    ptoAccrualRate,
    setPtoAccrualRate,
    minimumPtoNoticeDays,
    updateField,
  } = useStoreSettingsStore();
  const { show } = useToast();

  const [ptoRateInput, setPtoRateInput] = useState(
    ptoAccrualRate?.toString() || ""
  );
  const [ptoNoticeDaysInput, setPtoNoticeDaysInput] = useState(
    minimumPtoNoticeDays?.toString() || ""
  );

  const handlePtoRateChange = (text: string) => {
    let cleanedText = text.replace(/[^0-9.]/g, "");
    const parts = cleanedText.split(".");
    if (parts.length > 2) {
      cleanedText = parts[0] + "." + parts.slice(1).join("");
    }
    setPtoRateInput(cleanedText);
  };

  const handlePtoNoticeDaysChange = (text: string) => {
    const cleanedText = text.replace(/[^0-9]/g, "");
    setPtoNoticeDaysInput(cleanedText);
  };

  const handleUpdateAllSettings = () => {
    let rateUpdated = false;
    let noticeDaysUpdated = false;

    // Update PTO Accrual Rate
    const parsedRate = parseFloat(ptoRateInput);
    if (!isNaN(parsedRate) && parsedRate >= 0) {
      if (parsedRate !== ptoAccrualRate) {
        setPtoAccrualRate(parsedRate);
        rateUpdated = true;
      }
    } else if (ptoRateInput === "" && ptoAccrualRate !== 0) {
      setPtoAccrualRate(0);
      rateUpdated = true;
    } else if (isNaN(parsedRate)) {
      show({
        title: "Invalid Input",
        message: "PTO Accrual Rate must be a valid number.",
        type: "error",
      });
      return;
    }

    // Update Minimum PTO Notice Days
    const parsedNoticeDays = parseInt(ptoNoticeDaysInput, 10);
    if (!isNaN(parsedNoticeDays) && parsedNoticeDays >= 0) {
      if (parsedNoticeDays !== minimumPtoNoticeDays) {
        updateField("minimumPtoNoticeDays", parsedNoticeDays);
        noticeDaysUpdated = true;
      }
    } else if (ptoNoticeDaysInput === "" && minimumPtoNoticeDays !== 0) {
      updateField("minimumPtoNoticeDays", 0);
      noticeDaysUpdated = true;
    } else if (isNaN(parsedNoticeDays)) {
      show({
        title: "Invalid Input",
        message: "Minimum PTO Notice Days must be a valid number.",
        type: "error",
      });
      return;
    }

    if (rateUpdated || noticeDaysUpdated) {
      show({
        title: "Settings Updated",
        message: "Employee settings have been successfully updated.",
        type: "success",
      });
    } else {
      show({
        title: "No Changes",
        message: "All settings are already up to date.",
        type: "success",
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
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <View className="flex-1 bg-[#212121] p-6">
        <View className="flex-row gap-6 h-full w-full">
          <SettingsSidebar
            title="Store Operation"
            subsections={storeOperationSubsections}
            currentRoute="/settings/store-operation/employees"
          />
          <ScrollView className="flex-1 bg-[#303030] rounded-2xl border border-gray-700 p-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-3xl font-bold text-white">
                Employee Settings
              </Text>
              <TouchableOpacity
                onPress={handleUpdateAllSettings}
                className="px-6 py-3 bg-blue-600 rounded-md"
              >
                <Text className="text-white font-semibold">Update</Text>
              </TouchableOpacity>
            </View>

            <View className="p-4 bg-[#212121] rounded-lg border border-gray-600 mb-4">
              <Text className="text-lg font-semibold text-white">
                Break & Login
              </Text>
              <View className="flex-row items-center justify-between mt-3">
                <View>
                  <Text className="text-base text-white">
                    Enable Break & Switch Account
                  </Text>
                  <Text className="text-sm text-gray-400 mt-1 max-w-md">
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

            <View className="p-4 bg-[#212121] rounded-lg border border-gray-600">
              <Text className="text-lg font-semibold text-white">
                Paid Time Off (PTO)
              </Text>

              <View className="mt-4">
                <Text className="text-base text-white mb-1">
                  PTO Accrual Rate
                </Text>
                <Text className="text-sm text-gray-400 mb-2">
                  Rate at which employees accrue PTO per hour worked.
                </Text>
                <TextInput
                  className="p-3 bg-[#303030] rounded-md border border-gray-600 text-white text-base"
                  keyboardType="numeric"
                  value={ptoRateInput}
                  onChangeText={handlePtoRateChange}
                  placeholder="e.g., 0.025"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View className="mt-4">
                <Text className="text-base text-white mb-1">
                  Minimum PTO Request Notice (Days)
                </Text>
                <Text className="text-sm text-gray-400 mb-2">
                  Minimum number of days in advance an employee can request PTO.
                </Text>
                <TextInput
                  className="p-3 bg-[#303030] rounded-md border border-gray-600 text-white text-base"
                  keyboardType="numeric"
                  value={ptoNoticeDaysInput}
                  onChangeText={handlePtoNoticeDaysChange}
                  placeholder="e.g., 7"
                  placeholderTextColor="#6B7280"
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default EmployeeSettingsScreen;
