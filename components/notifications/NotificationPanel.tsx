import { groupNotificationsByDate } from "@/lib/notificationUtils";
import { Notification } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { SectionList, Text, TouchableOpacity, View } from "react-native";
import NotificationItem from "./NotificationItem";

interface NotificationPanelProps {
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose }) => {
  const {
    notifications,
    markAllAsRead,
    markAsRead,
    deleteNotification,
  } = useNotificationStore();
  const { schedulePeriods, weeklySchedules, swapRequests, dropRequests } =
    useScheduleStore();
  const { loggedInEmployee } = useEmployeeStore();
  const [filter, setFilter] = useState<"all" | "unread" | "schedule">("all");

  const employeeNotifications = useMemo(() => {
    if (!loggedInEmployee) return [];
    return notifications.filter((n) => n.employeeId === loggedInEmployee.id);
  }, [notifications, loggedInEmployee]);

  const filteredNotifications = useMemo(() => {
    if (filter === "unread") {
      return employeeNotifications.filter((n) => !n.isRead);
    }
    if (filter === "schedule") {
      return employeeNotifications.filter((n) =>
        [
          "schedule_published",
          "shift_assigned",
          "shift_updated",
          "swap_approved",
        ].includes(n.type)
      );
    }
    return employeeNotifications;
  }, [employeeNotifications, filter]);

  const notificationSections = useMemo(
    () => groupNotificationsByDate(filteredNotifications),
    [filteredNotifications]
  );

  const unreadCount = useMemo(
    () => employeeNotifications.filter((n) => !n.isRead).length,
    [employeeNotifications]
  );

  const handleNotificationPress = (notification: Notification) => {
    markAsRead(notification.id);
    switch (notification.type) {
      case "drop_request":
      case "drop_request_approved":
      case "drop_request_denied":
        router.push({ pathname: "/requests", params: { tab: "drops" } });
        break;
      case "swap_request": // This type might not be used anymore, but keeping for safety
      case "swap_request_received":
      case "swap_request_peer_accepted":
      case "swap_request_peer_denied":
      case "swap_approved":
      case "swap_denied":
        const requestId = notification.payload?.requestId;
        if (requestId && loggedInEmployee) {
          const swapRequest = swapRequests.find((req) => req.id === requestId);
          if (swapRequest) {
            let tabToNavigate = "activity"; // Default or fallback
            if (swapRequest.ownerId === loggedInEmployee.id) {
              tabToNavigate = "swaps-out";
            } else if (swapRequest.peerId === loggedInEmployee.id) {
              tabToNavigate = "swaps-in";
            }
            router.push({
              pathname: "/requests",
              params: { tab: tabToNavigate },
            });
          } else {
            router.push("/requests"); // Fallback if request not found
          }
        } else {
          router.push("/requests"); // Fallback if no requestId or loggedInEmployee
        }
        break;
      case "pto_update":
      case "pto_request_approved":
      case "pto_request_denied":
        router.push("/pto");
        break;
      case "shift_updated":
      case "shift_assigned":
        router.push("/scheduling");
        break;
      case "schedule_published":
        const schedulePayload = notification.payload as
          | { scheduleId: string; scheduleType: "period" | "weekly" }
          | undefined;
        const { scheduleId, scheduleType } = schedulePayload || {};
        const schedule =
          scheduleType === "period"
            ? schedulePeriods.find((p) => p.id === scheduleId)
            : weeklySchedules.find((w) => w.id === scheduleId);
        if (schedule) {
          router.push({
            pathname: "/my-profile",
            params: { tab: "MyScheduleScreen", date: schedule.startDate },
          });
        }
        break;
      default:
        break;
    }
    onClose();
  };

  const handleMarkAllAsRead = () => {
    if (loggedInEmployee) {
      markAllAsRead(loggedInEmployee.id);
    }
  };

  return (
    <View className="flex-1 bg-[#1F1F1F]   overflow-hidden">
      {/* Header */}
      <View className="bg-[#252525]/95 backdrop-blur-md sticky top-0 z-10 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Text className="text-white font-semibold text-xl">
              Notifications
            </Text>
            {unreadCount > 0 && (
              <View className="bg-blue-600 text-white text-sm font-bold rounded-full min-w-[28px] h-7 px-2 flex items-center justify-center">
                <Text className="text-white text-sm font-bold">
                  {unreadCount}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={handleMarkAllAsRead}>
            <Text className="text-blue-500 text-sm font-medium">
              Mark all as read
            </Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row gap-2 mt-4">
          <TouchableOpacity
            onPress={() => setFilter("all")}
            className={`px-4 py-1.5 rounded-full ${
              filter === "all" ? "bg-blue-600" : "bg-[#2A2A2A] hover:bg-[#333]"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                filter === "all" ? "text-white" : "text-zinc-400"
              }`}
            >
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter("unread")}
            className={`px-4 py-1.5 rounded-full ${
              filter === "unread"
                ? "bg-blue-600"
                : "bg-[#2A2A2A] hover:bg-[#333]"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                filter === "unread" ? "text-white" : "text-zinc-400"
              }`}
            >
              Unread
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter("schedule")}
            className={`px-4 py-1.5 rounded-full ${
              filter === "schedule"
                ? "bg-blue-600"
                : "bg-[#2A2A2A] hover:bg-[#333]"
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                filter === "schedule" ? "text-white" : "text-zinc-400"
              }`}
            >
              Schedule
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="px-4">
        <SectionList
          sections={notificationSections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => handleNotificationPress(item)}>
              <NotificationItem
                notification={item}
                onDelete={deleteNotification}
              />
            </TouchableOpacity>
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View className="bg-[#1F1F1F] py-2 px-4 sticky top-0">
              <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                {title}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View className="p-4 items-center justify-center mt-10">
              <Text className="text-gray-400 text-lg">
                You're all caught up!
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      </View>
    </View>
  );
};

export default NotificationPanel;
