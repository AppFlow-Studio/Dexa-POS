import HistoryTab from "@/components/profile/HistoryTab";
import ProfileCard from "@/components/profile/ProfileCard";
import ProfileInfoTab from "@/components/profile/ProfileInfoTab";
import SecurityTab from "@/components/profile/SecurityTab";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import {
  Building2,
  Receipt,
  User
} from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type TabName = "Profile Info" | "Security" | "History";
const TABS: TabName[] = ["Profile Info", "Security", "History"];

const MyProfileScreen = () => {
  const { activeEmployeeId, employees, loadMockEmployees } = useEmployeeStore();
  const currentEmployee = React.useMemo(() => {
    return activeEmployeeId
      ? employees.find(e => e.id === activeEmployeeId)
      : employees.find(e => e.shiftStatus === 'clocked_in');
  }, [activeEmployeeId, employees]);
  React.useEffect(() => { loadMockEmployees(8); }, []);
  const [activeTab, setActiveTab] = useState<TabName>("Profile Info");

  const basicSubsections = [
    {
      id: "store-info",
      title: "Store Info",
      subtitle: "Business Details",
      route: "/settings/basic/store-info",
      icon: <Building2 color="#3b82f6" size={24} />,
    },
    {
      id: "my-profile",
      title: "My Profile",
      subtitle: "Personal Settings",
      route: "/settings/basic/my-profile",
      icon: <User color="#3b82f6" size={24} />,
    },
    {
      id: "taxes",
      title: "Taxes",
      subtitle: "Tax Configuration",
      route: "/settings/basic/taxes",
      icon: <Receipt color="#3b82f6" size={24} />,
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "Profile Info":
        return <ProfileInfoTab />;
      case "Security":
        return <SecurityTab />;
      case "History":
        return <HistoryTab />;
      default:
        return <ProfileInfoTab />;
    }
  };

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Basic Settings"
          subsections={basicSubsections}
          currentRoute="/settings/basic/my-profile"
        />

        {/* Main Content */}
        <View className="flex-1 bg-[#303030] p-6 rounded-2xl border border-gray-600">
          {/* Tab Bar */}
          <View className="bg-gray-700 p-2 rounded-2xl w-full flex-row self-start">
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`py-3 px-6 rounded-lg flex-1 ${activeTab === tab ? "bg-[#212121]" : ""}`}
              >
                <Text
                  className={`text-2xl font-semibold text-center ${activeTab === tab ? "text-blue-400" : "text-gray-300"}`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content Area */}
          <View className="flex-row  mt-6">
            {/* Left: Shared Profile Card */}
            <ProfileCard />

            {/* Right: Tab-Specific Content */}
            <View className="flex-1 ml-6">{renderContent()}</View>
          </View>

          {/* Footer */}
          <View className="flex-row justify-between items-center pt-4 border-t border-gray-600 w-full ">
            <Text className="text-gray-400">{currentEmployee ? `Viewing profile for: ${currentEmployee.fullName}` : 'No employee signed in'}</Text>
            {activeTab === "Profile Info" ? (
              <>
                <TouchableOpacity className="px-6 py-3 border border-gray-500 rounded-lg mr-2">
                  <Text className="text-2xl font-bold text-gray-300">
                    Close
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity className="px-8 py-3 bg-blue-500 rounded-lg">
                  <Text className="text-2xl font-bold text-white">Edit</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity className="px-6 py-3 border border-gray-500 rounded-lg">
                <Text className="text-2xl font-bold text-gray-300">Close</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

export default MyProfileScreen;
