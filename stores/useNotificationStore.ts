import { Notification } from "@/lib/types";
import { create } from "zustand";

// Hard cap on retained notifications. This store is NOT persisted, but
// addNotification is called from many event-driven paths (schedule events,
// fraud guard, etc.) and is only drained by manual swipe or matching
// removeNotification calls — so over a long shift the array grows unbounded.
// Keep the newest MAX_NOTIFICATIONS and drop the oldest tail.
const MAX_NOTIFICATIONS = 200;

// Monotonic counter so ids stay unique even when two notifications fire in the
// same millisecond (Date.now() alone is not collision-safe).
let notifSeq = 0;

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
      id: `notif_${Date.now()}_${notifSeq++}`,
      isRead: false,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      // Prepend newest, then cap the tail so the array can't grow unbounded.
      notifications: [newNotification, ...state.notifications].slice(
        0,
        MAX_NOTIFICATIONS
      ),
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
