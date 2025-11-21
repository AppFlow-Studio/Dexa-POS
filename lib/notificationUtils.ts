import { Notification } from "@/lib/types";
import { format, isToday, isYesterday } from "date-fns";
import {
  AlertCircle as AlertCircleIcon,
  ArrowRightLeft as ArrowRightLeftIcon,
  Calendar as CalendarIcon,
  CheckCircle,
  MessageSquare as MessageSquareIcon,
  MinusCircle,
  XCircle,
} from "lucide-react-native";

export const getNotificationAppearance = (type: Notification["type"]) => {
  switch (type) {
    case "swap_request":
    case "swap_request_received":
      return {
        icon: ArrowRightLeftIcon,
        color: "#3b82f6",
        title: "Swap Request",
      };
    case "drop_request":
      return {
        icon: MinusCircle,
        color: "#f59e0b",
        title: "Drop Request",
      };
    case "manager_note":
      return {
        icon: MessageSquareIcon,
        color: "#9CA3AF",
        title: "New Note",
      };
    case "pto_update":
    case "pto_request_approved":
    case "swap_request_peer_accepted":
    case "swap_approved":
    case "drop_request_approved":
      return {
        icon: CheckCircle,
        color: "#22c55e",
        title: "Request Approved",
      };
    case "pto_request_denied":
    case "swap_request_peer_denied":
    case "swap_denied":
    case "drop_request_denied":
      return {
        icon: XCircle,
        color: "#ef4444",
        title: "Request Denied",
      };
    case "shift_updated":
    case "shift_assigned":
    case "schedule_published":
      return {
        icon: CalendarIcon,
        color: "#3b82f6",
        title: "Schedule Update",
      };
    default:
      return {
        icon: AlertCircleIcon,
        color: "#9CA3AF",
        title: "Notification",
      };
  }
};

export const groupNotificationsByDate = (notifications: Notification[]) => {
  const groups: { [key: string]: Notification[] } = {};

  notifications.forEach((notification) => {
    const date = new Date(notification.timestamp);
    let groupKey: string;

    if (isToday(date)) {
      groupKey = "Today";
    } else if (isYesterday(date)) {
      groupKey = "Yesterday";
    } else {
      groupKey = format(date, "MMMM do");
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(notification);
  });

  return Object.keys(groups).map((key) => ({
    title: key,
    data: groups[key],
  }));
};
