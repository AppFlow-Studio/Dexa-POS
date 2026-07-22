import { Notification } from "@/lib/types";
import { createMMKV } from "react-native-mmkv";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const notificationStorage = createMMKV({ id: "dexa-pos-notifications" });

const mmkvStorage = {
  getItem: (name: string) => notificationStorage.getString(name) ?? null,
  setItem: (name: string, value: string) => notificationStorage.set(name, value),
  removeItem: (name: string) => notificationStorage.delete(name),
};

// Prune persisted notifications older than this on rehydrate — a week-old
// shift reminder is noise, and it keeps the persisted blob bounded.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  deleteNotification: (id: string) => void;
  /** Clear every notification for an employee (the panel's Clear button). */
  clearAllForEmployee: (employeeId: string) => void;
  getUnreadCountForEmployee: (employeeId: string) => number;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
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

  clearAllForEmployee: (employeeId) => {
    set((state) => ({
      // Keep unresolved guest requests — those clear via Resolve only, so the
      // inbox never hides a live call-server alert.
      notifications: state.notifications.filter(
        (n) => n.employeeId !== employeeId || n.type === "qr_call_server"
      ),
    }));
  },

  getUnreadCountForEmployee: (employeeId) => {
    return get().notifications.filter(
      (n) => n.employeeId === employeeId && !n.isRead
    ).length;
  },
    }),
    {
      name: "notification-store",
      storage: createJSONStorage(() => mmkvStorage),
      // Drop stale entries on rehydrate so restarts don't resurrect a
      // week-old inbox.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const cutoff = Date.now() - MAX_AGE_MS;
        state.notifications = state.notifications.filter(
          (n) => new Date(n.timestamp).getTime() >= cutoff
        );
      },
    }
  )
);
