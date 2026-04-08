import { Notification } from "@/lib/types";
import { create } from "zustand";

interface NotificationState {
  notifications: Notification[];
  addNotification: (
    notification: Omit<Notification, "id" | "isRead" | "timestamp">
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: (employeeId: string) => void;
  removeNotification: (criteria: {
    type?: string;
    payload?: Record<string, any>;
  }) => void;
  deleteNotification: (id: string) => void; // New action for swipe-to-delete
  getUnreadCountForEmployee: (employeeId: string) => number;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  addNotification: (notificationData) => {
    const newNotification: Notification = {
      ...notificationData,
      id: `notif_${Date.now()}`,
      isRead: false,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      notifications: [newNotification, ...state.notifications],
    }));
  },

  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    }));
  },

  markAllAsRead: (employeeId) => {
    set((state) => ({
      notifications: state.notifications.map((n) => {
        if (n.employeeId === employeeId) {
          return { ...n, isRead: true };
        }
        return n;
      }),
    }));
  },

  deleteNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  removeNotification: ({ type, payload }) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => {
        const typeMatch = type ? n.type === type : true;
        const payloadMatch = payload
          ? JSON.stringify(n.payload) === JSON.stringify(payload)
          : true;
        return !typeMatch || !payloadMatch;
      }),
    }));
  },

  getUnreadCountForEmployee: (employeeId) => {
    return get().notifications.filter(
      (n) => n.employeeId === employeeId && !n.isRead
    ).length;
  },
}));
