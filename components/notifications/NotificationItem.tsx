import { Notification } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  MessageSquare,
  MinusCircle,
  CheckCircle, // New import
  XCircle, // New import
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
    case "shift_updated":
      return <Calendar size={16} color="#3b82f6" />; // Blue calendar for updated shift
    case "shift_assigned":
      return <Calendar size={16} color="#22c55e" />; // Green calendar for assigned shift
    case "schedule_published":
      return <Calendar size={16} color="#f59e0b" />; // Orange calendar for published schedule
    case "drop_request_approved":
      return <CheckCircle size={16} color="#22c55e" />; // Green check for approved drop
    case "drop_request_denied":
      return <XCircle size={16} color="#ef4444" />; // Red X for denied drop
    case "pto_request_approved":
      return <CheckCircle size={16} color="#22c55e" />; // Green check for approved PTO
    case "pto_request_denied":
      return <XCircle size={16} color="#ef4444" />; // Red X for denied PTO
    case "swap_request_received":
      return <ArrowRightLeft size={16} color="#3b82f6" />; // Blue swap for received swap request
    case "swap_request_peer_accepted":
      return <CheckCircle size={16} color="#22c55e" />; // Green check for peer accepted swap
    case "swap_request_peer_denied":
      return <XCircle size={16} color="#ef4444" />; // Red X for peer denied swap
    case "swap_approved":
      return <CheckCircle size={16} color="#22c55e" />; // Green check for approved swap
    case "swap_denied":
      return <XCircle size={16} color="#ef4444" />; // Red X for denied swap
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
