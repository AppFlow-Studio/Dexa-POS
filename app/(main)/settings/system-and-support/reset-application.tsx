import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { Smartphone, Wrench } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const ResetApplicationScreen = () => {
  // State to manage which modal is open
  const [modalType, setModalType] = useState<"clearCache" | "resetApp" | null>(
    null
  );

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

  const handleClearCache = () => {
    console.log("Clearing cache...");
    setModalType(null); // Close modal
  };

  const handleResetApplication = () => {
    console.log("Resetting application...");
    // In a real app, you would log the user out and clear local storage here
    setModalType(null); // Close modal
  };

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="System & Support"
          subsections={systemSubsections}
          currentRoute="/settings/system-and-support/reset-application"
        />

        {/* Main Content */}
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-600 p-6">
          {/* Main Content Card */}
          <View className="p-6">
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setModalType("clearCache")}
                className="py-2 px-6 border border-gray-500 rounded-lg"
              >
                <Text className="font-bold text-gray-300">Clear Cache</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModalType("resetApp")}
                className="py-2 px-6 bg-red-500 rounded-lg"
              >
                <Text className="font-bold text-white">Reset Application</Text>
              </TouchableOpacity>
            </View>

            {/* The empty space */}
            <View className="h-96" />
          </View>
        </View>
      </View>

      {/* --- Modals --- */}

      {/* Clear Cache Modal */}
      <ConfirmationModal
        isOpen={modalType === "clearCache"}
        onClose={() => setModalType(null)}
        onConfirm={handleClearCache}
        title="Clear Cache"
        description="Are you sure you want to clear cache?"
        confirmText="Yes"
        variant="default" // This is the default, blue button
      />

      {/* Reset Application Modal */}
      <ConfirmationModal
        isOpen={modalType === "resetApp"}
        onClose={() => setModalType(null)}
        onConfirm={handleResetApplication}
        title="Reset Application"
        description="This will log you out and delete all local data. You will need to sync again."
        confirmText="Delete"
        variant="destructive" // This will make the button red
      />
    </View>
  );
};

export default ResetApplicationScreen;
