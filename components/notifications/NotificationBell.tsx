import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { Bell } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const NotificationBell = () => {
  const loggedInEmployee = useEmployeeStore((state) => state.loggedInEmployee);
  const openSheet = useNotificationSheetStore((state) => state.openSheet);

  const unreadCount = useNotificationStore((state) =>
    loggedInEmployee
      ? state.notifications.filter(
          (n) => n.employeeId === loggedInEmployee.id && !n.isRead
        ).length
      : 0
  );

  const handleOpen = () => {
    openSheet();
  };

  return (
    <>
      <TouchableOpacity
        onPress={handleOpen}
        className="ml-2 p-2 bg-surface rounded-full border border-gray-700 relative"
      >
        <Bell size={24} color={colors.label} />
        {unreadCount > 0 && (
          <View className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full items-center justify-center border-2 border-panel">
            <Text className="text-white text-xs font-bold">{unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </>
  );
};

export default NotificationBell;
