import { ShiftHistoryEntry } from "@/lib/types";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { create } from "zustand";
import { useEmployeeSettingsStore } from "./useEmployeeSettingsStore";
import { useEmployeeStore } from "./useEmployeeStore";

export type SessionStatus = "clockedIn" | "onBreak";

export interface ShiftSession {
  employeeId: string;
  status: SessionStatus;
  clockInTime: Date;
  breakStartTime: Date | null;
  breakEndTime: Date | null;
}

interface TimeclockState {
  activeEmployeeId: string | null;
  sessions: Record<string, ShiftSession>;
  isClockInWallOpen: boolean;
  shiftHistory: ShiftHistoryEntry[];

  // ACTIONS
  setActiveEmployee: (employeeId: string | null) => void;
  clockIn: (employeeId: string) => {
    ok: boolean;
    reason?: "already_in_session";
  };
  startBreak: () => void;
  endBreak: (employeeId: string) => void;
  clockOut: (employeeId: string) => void;
  getSession: (employeeId: string) => ShiftSession | undefined;
  showClockInWall: () => void;
  hideClockInWall: () => void;
}

export const useTimeclockStore = create<TimeclockState>((set, get) => ({
  activeEmployeeId: null,
  sessions: {},
  isClockInWallOpen: false,
  shiftHistory: [],

  setActiveEmployee: (employeeId: string | null) =>
    set({ activeEmployeeId: employeeId }),

  clockIn: (employeeId: string) => {
    const { sessions } = get();
    if (sessions[employeeId]) {
      return { ok: false, reason: "already_in_session" };
    }

    const newSession: ShiftSession = {
      employeeId,
      status: "clockedIn",
      clockInTime: new Date(),
      breakStartTime: null,
      breakEndTime: null,
    };

    set((state) => ({
      sessions: { ...state.sessions, [employeeId]: newSession },
      activeEmployeeId: employeeId,
    }));

    return { ok: true };
  },

  startBreak: () => {
    const { activeEmployeeId, sessions } = get();
    const { isBreakAndSwitchEnabled } = useEmployeeSettingsStore.getState();

    if (!activeEmployeeId || !sessions[activeEmployeeId]) return;

    const updatedSession: ShiftSession = {
      ...sessions[activeEmployeeId],
      status: "onBreak",
      breakStartTime: new Date(),
      breakEndTime: null,
    };

    set((state) => ({
      sessions: { ...state.sessions, [activeEmployeeId]: updatedSession },
      activeEmployeeId: isBreakAndSwitchEnabled ? null : state.activeEmployeeId,
    }));
  },

  endBreak: (employeeId: string) => {
    const { sessions } = get();
    const session = sessions[employeeId];
    if (!session || session.status !== "onBreak") return;

    set((state) => ({
      sessions: {
        ...state.sessions,
        [employeeId]: {
          ...session,
          status: "clockedIn",
          breakEndTime: new Date(),
        },
      },
      activeEmployeeId: employeeId,
    }));

    toast.success("Break ended. Welcome back!", {
      position: ToastPosition.BOTTOM,
    });
  },

  clockOut: (employeeId: string) => {
    const { sessions, activeEmployeeId } = get();
    const sessionToClose = sessions[employeeId];
    if (!sessionToClose) return;

    if (sessionToClose.status === "onBreak") {
      toast.error(
        "Cannot clock out while on break. Please end your break first.",
        {
          position: ToastPosition.BOTTOM,
        }
      );
      return;
    }

    const clockOutTime = new Date();
    const durationMs =
      clockOutTime.getTime() - sessionToClose.clockInTime.getTime();
    const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

    const newHistoryEntry: ShiftHistoryEntry = {
      id: `shift_${Date.now()}`,
      date: sessionToClose.clockInTime.toLocaleDateString(),
      role: "N/A",
      clockIn: sessionToClose.clockInTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      breakInitiated: sessionToClose.breakStartTime
        ? new Date(sessionToClose.breakStartTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "N/A",
      breakEnded: sessionToClose.breakEndTime
        ? new Date(sessionToClose.breakEndTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "N/A",
      clockOut: clockOutTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      duration: `${durationHours}h`,
    };

    const newSessions = { ...sessions };
    delete newSessions[employeeId];

    set((state) => ({
      sessions: newSessions,
      shiftHistory: [newHistoryEntry, ...state.shiftHistory],
      activeEmployeeId:
        activeEmployeeId === employeeId ? null : activeEmployeeId,
    }));

    // Cascade the clock-out action to the employee store
    useEmployeeStore.getState().clockOut(employeeId);

    // MODIFIED: If the person clocking out is the active user, also sign them out of the terminal.
    if (activeEmployeeId === employeeId) {
      useEmployeeStore.getState().signOut();
    }

    toast.success("Clocked out successfully.", {
      position: ToastPosition.BOTTOM,
    });
  },

  getSession: (employeeId: string) => get().sessions[employeeId],
  showClockInWall: () => set({ isClockInWallOpen: true }),
  hideClockInWall: () => set({ isClockInWallOpen: false }),
}));
