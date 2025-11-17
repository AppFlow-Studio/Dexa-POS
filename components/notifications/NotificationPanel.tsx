import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { router } from "expo-router";
import React from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import NotificationItem from "./NotificationItem";

interface NotificationPanelProps {
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose }) => {
  const { notifications, markAllAsRead, markAsRead } = useNotificationStore();
  const { schedulePeriods, weeklySchedules, swapRequests, dropRequests } = useScheduleStore();
  const { loggedInEmployee } = useEmployeeStore();

  const employeeNotifications = loggedInEmployee
    ? notifications.filter((n) => n.employeeId === loggedInEmployee.id)
    : [];

  const handleNotificationPress = (notification: any) => {
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
            router.push({ pathname: "/requests", params: { tab: tabToNavigate } });
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
        const { scheduleId, scheduleType } = notification.payload;
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

  return (
    <View className="w-full h-[400px] bg-[#303030] rounded-2xl border border-gray-700 shadow-lg">
      <View className="p-3 flex-row justify-between items-center border-b border-gray-700">
        <Text className="text-lg font-bold text-white">Notifications</Text>
        <TouchableOpacity onPress={markAllAsRead}>
          <Text className="text-sm font-semibold text-blue-400">
            Mark all as read
          </Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={employeeNotifications}
        keyExtractor={(item) => item.id}
        scrollEnabled
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => handleNotificationPress(item)}>
            <NotificationItem notification={item} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="p-4 items-center justify-center">
            <Text className="text-gray-400">No new notifications</Text>
          </View>
        }
      />
    </View>
  );
};

export default NotificationPanel;
