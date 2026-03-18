import { colors } from "@/lib/theme";
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
          <ActivityIndicator size="large" color="#0000ff" />
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
      <View className="flex-1 px-5 pt-3 pb-4 bg-screen">
        {/* Top bar */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={() => router.replace("/home")}
              className="p-1.5 rounded-lg bg-teal-500/10"
            >
              <ArrowLeft color={colors.teal} size={18} />
            </TouchableOpacity>
            <Text className="text-lg font-bold text-heading">My Profile</Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Link href="/pto" asChild>
              <TouchableOpacity className="flex-row items-center gap-2 px-3 py-1.5 bg-panel border border-border rounded-xl">
                <Calendar size={14} color={colors.teal} />
                <Text className="text-sm font-semibold text-heading">PTO</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/requests" asChild>
              <TouchableOpacity className="flex-row items-center gap-2 px-3 py-1.5 bg-panel border border-border rounded-xl">
                <Menu size={14} color={colors.teal} />
                <Text className="text-sm font-semibold text-heading">Requests</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        <View className="flex-row gap-4" style={{ alignItems: 'flex-start' }}>
          {/* Left: Profile Card */}
          {currentEmployee?.id && (
            <View style={{ width: 240, flexShrink: 0 }}>
              <UserProfileCard employeeId={currentEmployee.id} />
            </View>
          )}

          {/* Right: Tab panel */}
          <View style={{ flex: 1, minWidth: 0 }} className="bg-panel rounded-2xl border border-border overflow-hidden">
            {/* Tab Bar */}
            <View className="flex-row border-b border-border px-2 pt-2">
              {TABS.map((t) => {
                const isActive = activeTab === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setActiveTab(t)}
                    className="px-4 pb-2 mr-1"
                    style={{ borderBottomWidth: 2, borderBottomColor: isActive ? colors.teal : 'transparent' }}
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: isActive ? colors.teal : colors.label }}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Content */}
            <View className="flex-1 p-4">
              {renderContent()}
            </View>
          </View>
        </View>
      </View>
      <NotificationBottomSheet
        bottomSheetRef={notificationSheetRef as React.RefObject<BottomSheetMethods>}
        onClose={() => notificationSheetRef.current?.close()}
      />
    </SafeAreaView>
  );
};

export default MyProfileScreen;
