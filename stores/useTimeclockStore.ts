import { ShiftHistoryEntry } from "@/lib/types";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { create } from "zustand";
import { useEmployeeSettingsStore } from "./useEmployeeSettingsStore"; // Import settings store
import { useEmployeeStore } from "./useEmployeeStore";

// The status for an individual employee's session
export type SessionStatus = "clockedIn" | "onBreak";

// The data for a single, active work session
export interface ShiftSession {
  employeeId: string;
  status: SessionStatus;
  clockInTime: Date;
  breakStartTime: Date | null;
  breakEndTime: Date | null; // Added to track break end time per session
}

interface TimeclockState {
  // Who is currently using the POS terminal. Can be null.
  activeEmployeeId: string | null;
  // A record of all currently active sessions (clocked in or on break).
  sessions: Record<string, ShiftSession>; // Key is employeeId
  isClockInWallOpen: boolean;
  shiftHistory: ShiftHistoryEntry[];

  // --- ACTIONS ---
  // Sets who is currently using the terminal.
  setActiveEmployee: (employeeId: string | null) => void;
  // Starts a new session for an employee and makes them active.
  clockIn: (employeeId: string) => {
    ok: boolean;
    reason?: "already_in_session";
  };
  // Puts the *active* employee on break and clears the active user.
  startBreak: () => void;
  // Ends a break for a *specific* employee and makes them active again.
  endBreak: (employeeId: string) => void;
  // Ends an employee's session completely.
  clockOut: (employeeId: string) => void;
  // Helper to get the session details for any employee.
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
      breakEndTime: null, // Initialize break end time
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

    // The break action itself is always allowed.
    const updatedSession: ShiftSession = {
      ...sessions[activeEmployeeId],
      status: "onBreak",
      breakStartTime: new Date(),
      breakEndTime: null, // Reset break end time on new break
    };

    set((state) => ({
      sessions: { ...state.sessions, [activeEmployeeId]: updatedSession },
      // Conditionally log out the user ONLY if the "Switch Account" feature is enabled.
      activeEmployeeId: isBreakAndSwitchEnabled ? null : state.activeEmployeeId,
    }));
  },

  endBreak: (employeeId: string) => {
    const { sessions } = get();
    const session = sessions[employeeId];
    if (!session || session.status !== "onBreak") return;

    // Add logic to record break duration to history if needed

    set((state) => ({
      sessions: {
        ...state.sessions,
        [employeeId]: {
          ...session,
          status: "clockedIn",
          breakEndTime: new Date(), // Set break end time
        },
      },
      // Automatically make the returning employee the active user.
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

    const clockOutTime = new Date();
    const durationMs =
      clockOutTime.getTime() - sessionToClose.clockInTime.getTime();
    const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

    const employee = useEmployeeStore
      .getState()
      .employees.find((e) => e.id === employeeId);

    const newHistoryEntry: ShiftHistoryEntry = {
      id: `shift_${Date.now()}`,
      date: sessionToClose.clockInTime.toLocaleDateString(), // Assuming date is part of ShiftHistoryEntry
      role: "N/A", // EmployeeProfile does not have a 'role' property. Defaulting to "N/A" or remove if not needed.
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

    toast.success("Clocked out successfully.", {
      position: ToastPosition.BOTTOM,
    });
  },

  getSession: (employeeId: string) => get().sessions[employeeId],
  showClockInWall: () => set({ isClockInWallOpen: true }),
  hideClockInWall: () => set({ isClockInWallOpen: false }),
}));
