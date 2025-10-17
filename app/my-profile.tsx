import HistoryTab from "@/components/profile/HistoryTab";
import MyScheduleScreen from "@/components/profile/MyScheduleScreen";
import ProfileInfoTab from "@/components/profile/ProfileInfoTab";
import SecurityTab from "@/components/profile/SecurityTab";
import UserProfileCard from "@/components/timeclock/UserProfileCard";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { Link, router } from "expo-router";
import { ArrowLeft, Calendar, Menu } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type TabName = "Profile Info" | "My Schedule" | "Security" | "History";
const TABS: TabName[] = ["Profile Info", "My Schedule", "Security", "History"];

const MyProfileScreen = () => {
  const { activeEmployeeId, employees } = useEmployeeStore();
  const currentEmployee = React.useMemo(() => {
    return activeEmployeeId
      ? employees.find((e) => e.id === activeEmployeeId)
      : employees.find((e) => e.shiftStatus === "clocked_in");
  }, [activeEmployeeId, employees]);

  const [activeTab, setActiveTab] = useState<TabName>("Profile Info");

  const renderContent = () => {
    switch (activeTab) {
      case "Profile Info":
        return <ProfileInfoTab />;
      case "My Schedule":
        return <MyScheduleScreen />;
      case "Security":
        return <SecurityTab />;
      case "History":
        return <HistoryTab />;
      default:
        return <ProfileInfoTab />;
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#212121]">
      <View className="flex-1 p-4 bg-[#212121]">
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity
            onPress={() => router.replace("/home")}
            className="flex-row items-center gap-2"
          >
            <ArrowLeft color="#9CA3AF" size={24} />
            <Text className="text-2xl font-bold text-white">My Profile</Text>
          </TouchableOpacity>

          <View className="flex-row items-center gap-3">
            <Link href="/pto" asChild>
              <TouchableOpacity className="flex-row items-center gap-2 px-4 py-2 bg-[#303030] border border-gray-700 rounded-xl">
                <Calendar size={16} color="#9CA3AF" />
                <Text className="text-gray-300 font-semibold">PTO</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/requests" asChild>
              <TouchableOpacity className="flex-row items-center gap-2 px-4 py-2 bg-[#303030] border border-gray-700 rounded-xl">
                <Menu size={16} color="#9CA3AF" />
                <Text className="text-gray-300 font-semibold">Requests</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        <View className="flex-1 bg-[#303030] p-4 rounded-2xl border border-gray-600">
          {/* Tab Bar */}
          <View className="bg-gray-700 p-1 rounded-xl w-full flex-row self-start">
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`py-2 px-4 rounded-lg flex-1 ${
                  activeTab === tab ? "bg-[#212121]" : ""
                }`}
              >
                <Text
                  className={`text-xl font-semibold text-center ${
                    activeTab === tab ? "text-blue-400" : "text-gray-300"
                  }`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content Area */}
          <View className="flex-1 flex-row mt-4">
            {/* Left: Shared Profile Card */}
            {currentEmployee?.id && (
              <View className="w-1/4">
                <UserProfileCard employeeId={currentEmployee.id} />
              </View>
            )}

            {/* Right: Tab-Specific Content */}
            <View className="flex-1 ml-4">{renderContent()}</View>
          </View>

          {/* Footer */}
          <View className="flex-row justify-between items-center pt-3 border-t border-gray-600 w-full mt-auto">
            <Text className="text-gray-400 text-sm">
              {currentEmployee
                ? `Viewing: ${currentEmployee.fullName}`
                : "No employee"}
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => router.replace("/home")}
                className="px-4 py-2 border border-gray-500 rounded-lg"
              >
                <Text className="text-xl font-bold text-gray-300">Close</Text>
              </TouchableOpacity>
              <TouchableOpacity className="px-6 py-2 bg-blue-500 rounded-lg">
                <Text className="text-xl font-bold text-white">Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default MyProfileScreen;
