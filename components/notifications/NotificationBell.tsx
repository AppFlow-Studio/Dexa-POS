import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { Bell } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent } from "../ui/dialog";
import NotificationPanel from "./NotificationPanel";

const NotificationBell = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const { loggedInEmployee } = useEmployeeStore();

  const unreadCount = useNotificationStore((state) =>
    loggedInEmployee
      ? state.notifications.filter(
          (n) => n.employeeId === loggedInEmployee.id && !n.isRead
        ).length
      : 0
  );

  const handleOpen = () => {
    setIsPanelOpen(true);
    if (unreadCount > 0 && loggedInEmployee) {
      markAllAsRead(loggedInEmployee.id);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={handleOpen}
        className="ml-2 p-2 bg-[#303030] rounded-full border border-gray-700 relative"
      >
        <Bell size={24} color="#9CA3AF" />
        {unreadCount > 0 && (
          <View className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full items-center justify-center border-2 border-[#303030]">
            <Text className="text-white text-xs font-bold">{unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Dialog open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <DialogContent className="w-[350px] p-0">
          <NotificationPanel onClose={() => setIsPanelOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NotificationBell;
