// File: /components/notifications/NotificationBell.tsx
import { useNotificationStore } from "@/stores/useNotificationStore";
import { Bell } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import NotificationPanel from "./NotificationPanel";

const NotificationBell = () => {
  const { unreadCount } = useNotificationStore();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TouchableOpacity className="ml-2 p-2 bg-[#303030] rounded-full border border-gray-700 relative">
          <Bell size={20} color="#9CA3AF" />
          {unreadCount > 0 && (
            <View className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full items-center justify-center border-2 border-[#303030]">
              <Text className="text-white text-xs font-bold">
                {unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="p-0 bg-transparent border-none w-96"
      >
        <NotificationPanel />
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
