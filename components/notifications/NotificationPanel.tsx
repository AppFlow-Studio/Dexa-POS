import { groupNotificationsByDate } from "@/lib/notificationUtils";
import { Notification } from "@/lib/types";
import { colors } from "@/lib/theme";
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

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "schedule", label: "Schedule" },
] as const;

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose }) => {
  const { notifications, markAllAsRead, markAsRead, deleteNotification } = useNotificationStore();
  const { schedulePeriods, weeklySchedules, swapRequests } = useScheduleStore();
  const { loggedInEmployee } = useEmployeeStore();
  const [filter, setFilter] = useState<"all" | "unread" | "schedule">("all");

  const employeeNotifications = useMemo(() => {
    if (!loggedInEmployee) return [];
    return notifications.filter((n) => n.employeeId === loggedInEmployee.id);
  }, [notifications, loggedInEmployee]);

  const filteredNotifications = useMemo(() => {
    if (filter === "unread") return employeeNotifications.filter((n) => !n.isRead);
    if (filter === "schedule") return employeeNotifications.filter((n) =>
      ["schedule_published", "shift_assigned", "shift_updated", "swap_approved"].includes(n.type)
    );
    return employeeNotifications;
  }, [employeeNotifications, filter]);

  const notificationSections = useMemo(() => groupNotificationsByDate(filteredNotifications), [filteredNotifications]);

  const unreadCount = useMemo(() => employeeNotifications.filter((n) => !n.isRead).length, [employeeNotifications]);

  const handleNotificationPress = (notification: Notification) => {
    markAsRead(notification.id);
    switch (notification.type) {
      case "drop_request":
      case "drop_request_approved":
      case "drop_request_denied":
        router.push({ pathname: "/requests", params: { tab: "drops" } });
        break;
      case "swap_request":
      case "swap_request_received":
      case "swap_request_peer_accepted":
      case "swap_request_peer_denied":
      case "swap_approved":
      case "swap_denied":
        const requestId = notification.payload?.requestId;
        if (requestId && loggedInEmployee) {
          const swapRequest = swapRequests.find((req) => req.id === requestId);
          if (swapRequest) {
            let tabToNavigate = "activity";
            if (swapRequest.ownerId === loggedInEmployee.id) tabToNavigate = "swaps-out";
            else if (swapRequest.peerId === loggedInEmployee.id) tabToNavigate = "swaps-in";
            router.push({ pathname: "/requests", params: { tab: tabToNavigate } });
          } else {
            router.push("/requests");
          }
        } else {
          router.push("/requests");
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
        const schedulePayload = notification.payload as { scheduleId: string; scheduleType: "period" | "weekly" } | undefined;
        const { scheduleId, scheduleType } = schedulePayload || {};
        const schedule = scheduleType === "period"
          ? schedulePeriods.find((p) => p.id === scheduleId)
          : weeklySchedules.find((w) => w.id === scheduleId);
        if (schedule) {
          router.push({ pathname: "/my-profile", params: { tab: "MyScheduleScreen", date: schedule.startDate } });
        }
        break;
    }
    onClose();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      {/* Header */}
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={{ backgroundColor: colors.teal, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#0C0F1A', fontSize: 10, fontWeight: '700' }}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => loggedInEmployee && markAllAsRead(loggedInEmployee.id)}>
            <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '600' }}>Mark all read</Text>
          </TouchableOpacity>
        </View>

        {/* Filter pills */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: isActive ? colors.teal : colors.screen,
                  borderWidth: 1, borderColor: isActive ? colors.teal : colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? '#0C0F1A' : colors.label }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <SectionList
        sections={notificationSections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => handleNotificationPress(item)}>
            <NotificationItem notification={item} onDelete={deleteNotification} />
          </TouchableOpacity>
        )}
        renderSectionHeader={({ section: { title } }) => (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.panel }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {title}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>You're all caught up!</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
};

export default NotificationPanel;
