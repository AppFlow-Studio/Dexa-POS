import NotificationBottomSheet from "@/components/notifications/NotificationBottomSheet";
import HistoryTab from "@/components/profile/HistoryTab";
import MyScheduleScreen from "@/components/profile/MyScheduleScreen";
import ProfileInfoTab from "@/components/profile/ProfileInfoTab";
import SecurityTab from "@/components/profile/SecurityTab";
import UserProfileCard from "@/components/timeclock/UserProfileCard";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Link, router, useLocalSearchParams } from "expo-router";
import { colors, spinnerColor } from "@/lib/theme";
import { ArrowLeft, Calendar, Menu } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type TabName = "Profile Info" | "My Schedule" | "Security" | "History";
const TABS: TabName[] = ["Profile Info", "My Schedule", "Security", "History"];

const MyProfileScreen = () => {
  const { activeEmployeeId, employees } = useEmployeeStore();
  const { sessions, activeEmployeeId: timeclockActiveId } = useTimeclockStore();
  const { tab, date } = useLocalSearchParams<{
    tab: string;
    date: string;
  }>();

  // Find current employee - check multiple sources
  const currentEmployee = React.useMemo(() => {
    // 1. First try activeEmployeeId from employee store
    if (activeEmployeeId) {
      return employees.find((e) => e.id === activeEmployeeId);
    }
    // 2. Then try activeEmployeeId from timeclock store
    if (timeclockActiveId) {
      return employees.find((e) => e.id === timeclockActiveId);
    }
    // 3. Check if any employee has an active session (clocked in or on break)
    const sessionEmployeeIds = Object.values(sessions).map((s) => s.employeeId);
    for (const id of sessionEmployeeIds) {
      const emp = employees.find((e) => e.id === id);
      if (emp) return emp;
    }
    // 4. Fallback to any clocked in employee
    return employees.find((e) => e.shiftStatus === "clocked_in");
  }, [activeEmployeeId, timeclockActiveId, employees, sessions]);

  const [activeTab, setActiveTab] = useState<TabName | null>(null); // Initialize to null
  const notificationSheetRef = useRef<BottomSheetMethods | null>(null);
  const { setSheetRef } = useNotificationSheetStore();

  useEffect(() => {
    console.log("we are setting it here again");

    setSheetRef(notificationSheetRef as React.RefObject<BottomSheetMethods>);
  }, [setSheetRef]);

  useEffect(() => {
    if (tab === "MyScheduleScreen") {
      setActiveTab("My Schedule");
    } else {
      setActiveTab("Profile Info");
    }
  }, [tab]);

  const renderContent = () => {
    if (activeTab === null) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={spinnerColor} />
        </View>
      );
    }

    switch (activeTab) {
      case "Profile Info":
        return <ProfileInfoTab />;
      case "My Schedule":
        return <MyScheduleScreen initialDate={date} />;
      case "Security":
        return <SecurityTab />;
      case "History":
        return <HistoryTab />;
      default:
        return <ProfileInfoTab />;
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-screen">
      <View className="flex-1 p-4 bg-screen">
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity
            onPress={() => router.replace("/home")}
            className="flex-row items-center gap-2"
          >
            <ArrowLeft color={colors.label} size={24} />
            <Text className="text-2xl font-bold text-white">My Profile</Text>
          </TouchableOpacity>

          <View className="flex-row items-center gap-3">
            <Link href="/pto" asChild>
              <TouchableOpacity className="flex-row items-center gap-2 px-4 py-2 bg-panel border border-gray-700 rounded-xl">
                <Calendar size={16} color={colors.label} />
                <Text className="text-gray-300 font-semibold">PTO</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/requests" asChild>
              <TouchableOpacity className="flex-row items-center gap-2 px-4 py-2 bg-panel border border-gray-700 rounded-xl">
                <Menu size={16} color={colors.label} />
                <Text className="text-gray-300 font-semibold">Requests</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        <View className="flex-1 bg-panel p-4 rounded-2xl border border-gray-600">
          {/* Tab Bar */}
          <View className="bg-gray-700 p-1 rounded-xl w-full flex-row self-start">
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`py-2 px-4 rounded-lg flex-1 ${
                  activeTab === tab ? "bg-screen" : ""
                }`}
              >
                <Text
                  className={`text-lg font-semibold text-center ${
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
        </View>
      </View>
      <NotificationBottomSheet
        bottomSheetRef={
          notificationSheetRef as React.RefObject<BottomSheetMethods>
        }
        onClose={() => notificationSheetRef.current?.close()}
      />
    </SafeAreaView>
  );
};

export default MyProfileScreen;
