import { MOCK_NOTIFICATIONS } from "@/lib/mockData";
import { Notification } from "@/lib/types";
import { create } from "zustand";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (
    notification: Omit<Notification, "id" | "isRead" | "timestamp">
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: MOCK_NOTIFICATIONS,
  unreadCount: MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length,

  addNotification: (notificationData) => {
    const newNotification: Notification = {
      ...notificationData,
      id: `notif_${Date.now()}`,
      isRead: false,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      notifications: [newNotification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAsRead: (id) => {
    set((state) => {
      const target = state.notifications.find((n) => n.id === id);
      if (target && !target.isRead) {
        return {
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
          unreadCount: state.unreadCount - 1,
        };
      }
      return state;
    });
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    }));
  },
}));
