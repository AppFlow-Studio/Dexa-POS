import { Notification } from "@/lib/types";
import { create } from "zustand";
import { useEmployeeStore } from "./useEmployeeStore";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number; // Now represents unread count for the ACTIVE employee
  addNotification: (
    notification: Omit<Notification, "id" | "isRead" | "timestamp">
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  getUnreadCountForEmployee: (employeeId: string) => number;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0, // Initial value, will be updated by subscription

  addNotification: (notificationData) => {
    const newNotification: Notification = {
      ...notificationData,
      id: `notif_${Date.now()}`,
      isRead: false,
      timestamp: new Date().toISOString(),
    };

    const { loggedInEmployee } = useEmployeeStore.getState();
    const isForActiveEmployee =
      loggedInEmployee?.id === newNotification.employeeId;

    set((state) => ({
      notifications: [newNotification, ...state.notifications],
      // Only increment if the notification is for the currently logged-in user
      unreadCount: isForActiveEmployee
        ? state.unreadCount + 1
        : state.unreadCount,
    }));
  },

  markAsRead: (id) => {
    set((state) => {
      const target = state.notifications.find((n) => n.id === id);
      if (!target || target.isRead) {
        return state; // No change if not found or already read
      }

      const { loggedInEmployee } = useEmployeeStore.getState();
      const isForActiveEmployee = loggedInEmployee?.id === target.employeeId;

      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        ),
        // Only decrement if the notification was for the currently logged-in user
        unreadCount: isForActiveEmployee
          ? state.unreadCount - 1
          : state.unreadCount,
      };
    });
  },

  markAllAsRead: () => {
    const { loggedInEmployee } = useEmployeeStore.getState();
    if (!loggedInEmployee) {
      return;
    }

    set((state) => {
      let newlyReadCount = 0;
      const updatedNotifications = state.notifications.map((n) => {
        if (n.employeeId === loggedInEmployee.id && !n.isRead) {
          newlyReadCount++;
          return { ...n, isRead: true };
        }
        return n;
      });

      if (newlyReadCount === 0) {
        return state;
      }

      return {
        notifications: updatedNotifications,
        unreadCount: state.unreadCount - newlyReadCount,
      };
    });
  },

  getUnreadCountForEmployee: (employeeId) => {
    return get().notifications.filter(
      (n) => n.employeeId === employeeId && !n.isRead
    ).length;
  },
}));

// Subscribe to employee store to update unread count on user change
useEmployeeStore.subscribe((state, prevState) => {
  const loggedInEmployee = state.loggedInEmployee;

  // We only update if the employee has actually changed
  if (loggedInEmployee?.id !== prevState.loggedInEmployee?.id) {
    const { notifications } = useNotificationStore.getState();
    const newUnreadCount = loggedInEmployee
      ? notifications.filter(
          (n) => n.employeeId === loggedInEmployee.id && !n.isRead
        ).length
      : 0;
    useNotificationStore.setState({ unreadCount: newUnreadCount });
  }
});
