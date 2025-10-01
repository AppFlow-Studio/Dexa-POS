import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Receipt, RefreshCcw, Store, Utensils } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const DiningOptionsScreen = () => {
  const { defaultSittingTimeMinutes, setDefaultSittingTimeMinutes } =
    useSettingsStore();
  const [timeInput, setTimeInput] = useState(
    defaultSittingTimeMinutes.toString()
  );

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

  const handleSave = () => {
    const time = parseInt(timeInput, 10);
    if (!isNaN(time) && time > 0) {
      setDefaultSittingTimeMinutes(time);
      toast.success("Default sitting time updated!", {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
    } else {
      toast.error("Please enter a valid number of minutes.", {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
    }
  };

  return (
    <View className="flex-1 bg-[#212121] p-4">
      <View className="flex-row gap-4 h-full w-full">
        <SettingsSidebar
          title="Store Operation"
          subsections={storeOperationSubsections}
          currentRoute="/settings/store-operation/dining-options"
        />
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-600 p-4">
          <Text className="text-2xl font-bold text-white mb-1">
            Dining Options
          </Text>
          <Text className="text-lg text-gray-400 mb-4">
            Configure rules for table seating and duration.
          </Text>

          <View className="bg-[#212121] p-4 rounded-lg border border-gray-700">
            <Text className="text-xl font-semibold text-white mb-2">
              Default Sitting Time
            </Text>
            <Text className="text-base text-gray-400 mb-3">
              Set a time limit in minutes. Overdue tables will be highlighted.
            </Text>
            <TextInput
              value={timeInput}
              onChangeText={setTimeInput}
              keyboardType="number-pad"
              placeholder="e.g., 60"
              placeholderTextColor="#9CA3AF"
              className="w-full p-3 border border-gray-600 rounded-lg text-lg text-white h-16"
            />
          </View>
          <TouchableOpacity
            onPress={handleSave}
            className="mt-4 py-3 px-6 bg-blue-600 rounded-lg self-start"
          >
            <Text className="text-xl font-bold text-white">Save Changes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default DiningOptionsScreen;
