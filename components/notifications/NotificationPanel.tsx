import { useNotificationStore } from "@/stores/useNotificationStore";
import { router } from "expo-router";
import React from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import NotificationItem from "./NotificationItem";

interface NotificationPanelProps {
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose }) => {
  const { notifications, markAllAsRead, markAsRead } = useNotificationStore();

  const handleNotificationPress = (notification: any) => {
    markAsRead(notification.id);
    switch (notification.type) {
      case "swap_request":
      case "drop_request":
        router.push("/requests");
        break;
      case "pto_update":
        router.push("/pto");
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
        data={notifications}
        keyExtractor={(item) => item.id}
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
