import { Notification } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  MessageSquare,
  MinusCircle,
} from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

interface NotificationItemProps {
  notification: Notification;
}

const getIconForType = (type: Notification["type"]) => {
  switch (type) {
    case "swap_request":
      return <ArrowRightLeft size={16} color="#3b82f6" />;
    case "drop_request":
      return <MinusCircle size={16} color="#f59e0b" />;
    case "manager_note":
      return <MessageSquare size={16} color="#9CA3AF" />;
    case "pto_update":
      return <Calendar size={16} color="#22c55e" />;
    default:
      return <AlertCircle size={16} color="#9CA3AF" />;
  }
};

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
}) => {
  return (
    <View
      className={`p-3 flex-row items-start gap-3 border-b border-gray-700 ${
        !notification.isRead ? "bg-blue-900/10" : ""
      }`}
    >
      {!notification.isRead && (
        <View className="w-2 h-2 bg-blue-500 rounded-full mt-1.5" />
      )}
      <View className="pt-1">{getIconForType(notification.type)}</View>
      <View className="flex-1">
        <Text className="text-white text-base">{notification.message}</Text>
        <Text className="text-gray-400 text-xs mt-1">
          {formatDistanceToNow(new Date(notification.timestamp), {
            addSuffix: true,
          })}
        </Text>
      </View>
    </View>
  );
};

export default NotificationItem;
