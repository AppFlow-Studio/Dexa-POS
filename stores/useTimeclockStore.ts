import { MOCK_WORK_HISTORY } from "@/lib/mockData";
import { toastService } from "@/lib/toastService";
import {
  CompletedShift,
  PTOAccrualEntry,
  ShiftHistoryEntry,
} from "@/lib/types";
import { create } from "zustand";

import { EmployeeProfile, useEmployeeStore } from "./useEmployeeStore";
import { usePtoStore } from "./usePtoStore"; // Import usePtoStore
import { useStoreSettingsStore } from "./useStoreSettingsStore"; // Import useStoreSettingsStore

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
  checkEmployeeInShift: (employeeId: string) => boolean;
  hideClockInWall: () => void;
  initializeHistory: () => void; // New action to initialize history
}

// Helper function to process mock history into ShiftHistoryEntry format
const processMockHistory = (
  mockShifts: CompletedShift[],
  mockEmployees: EmployeeProfile[]
): ShiftHistoryEntry[] => {
  const employeeMap = new Map(mockEmployees.map((emp) => [emp.id, emp]));

  return mockShifts.map((shift) => {
    const employee = employeeMap.get(shift.employeeId);
    const shiftDate = new Date(shift.date);

    // Create placeholder ISO strings for clock-in and clock-out
    const clockInTime = new Date(shiftDate.setHours(9, 0, 0, 0)); // 9:00 AM
    const clockOutTime = new Date(
      clockInTime.getTime() + shift.hoursWorked * 60 * 60 * 1000
    );

    return {
      id: shift.shiftId,
      employeeId: shift.employeeId,
      date: clockInTime.toISOString().split("T")[0], // Keep the simple date format for display
      role: employee?.role || "employee", // Default to 'employee' if not found
      clockIn: clockInTime.toISOString(),
      breakInitiated: "N/A",
      breakEnded: "N/A",
      clockOut: clockOutTime.toISOString(),
      duration: `${shift.hoursWorked.toFixed(2)}h`,
    };
  });
};

export const useTimeclockStore = create<TimeclockState>((set, get) => ({
  activeEmployeeId: null,
  sessions: {},
  isClockInWallOpen: false,
  shiftHistory: [], // Initialize as empty array

  setActiveEmployee: (employeeId: string | null) =>
    set({ activeEmployeeId: employeeId }),

  // New action to initialize history
  initializeHistory: () => {
    const employees = useEmployeeStore.getState().employees;
    const processedHistory = processMockHistory(MOCK_WORK_HISTORY, employees);
    set({ shiftHistory: processedHistory });
    console.log("Timeclock history initialized from mock data.");
  },

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
    const { isBreakAndSwitchEnabled } = useStoreSettingsStore.getState();

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

    toastService.show({
      title: "Break Over",
      message: "Welcome back! Your break has ended.",
      type: "success",
    });
  },

  clockOut: (employeeId: string) => {
    const { sessions, activeEmployeeId } = get();
    const sessionToClose = sessions[employeeId];
    if (!sessionToClose) return;

    if (sessionToClose.status === "onBreak") {
      toastService.show({
        title: "Action Restricted",
        message:
          "Cannot clock out while on break. Please end your break first.",
        type: "error",
      });

      return;
    }

    const clockOutTime = new Date();
    let totalDurationMs =
      clockOutTime.getTime() - sessionToClose.clockInTime.getTime();

    // Subtract break duration if applicable
    if (sessionToClose.breakStartTime && sessionToClose.breakEndTime) {
      const breakDurationMs =
        sessionToClose.breakEndTime.getTime() -
        sessionToClose.breakStartTime.getTime();
      totalDurationMs -= breakDurationMs;
    }

    const totalPaidDurationHours = totalDurationMs / (1000 * 60 * 60); // Convert ms to hours

    const employee = useEmployeeStore
      .getState()
      .employees.find((e) => e.id === employeeId);

    const newHistoryEntry: ShiftHistoryEntry = {
      id: `shift_${Date.now()}`,
      employeeId: employeeId, // <-- ADDED
      date: sessionToClose.clockInTime.toLocaleDateString(),
      role: employee?.role || "employee", // <-- UPDATED
      clockIn: sessionToClose.clockInTime.toISOString(), // <-- Use ISO format
      breakInitiated: sessionToClose.breakStartTime
        ? sessionToClose.breakStartTime.toISOString()
        : "N/A",
      breakEnded: sessionToClose.breakEndTime
        ? sessionToClose.breakEndTime.toISOString()
        : "N/A",
      clockOut: clockOutTime.toISOString(), // <-- Use ISO format
      duration: `${totalPaidDurationHours.toFixed(2)}h`,
    };

    const newSessions = { ...sessions };
    delete newSessions[employeeId];

    set((state) => ({
      sessions: newSessions,
      shiftHistory: [newHistoryEntry, ...state.shiftHistory],
      activeEmployeeId:
        activeEmployeeId === employeeId ? null : activeEmployeeId,
    }));

    // --- PTO Accrual Logic (wrapped in try...catch) ---
    try {
      const ptoAccrualRate = useStoreSettingsStore.getState().ptoAccrualRate;
      const ptoEarned = totalPaidDurationHours * ptoAccrualRate;

      if (ptoEarned > 0) {
        const ptoEntry: PTOAccrualEntry = {
          date: newHistoryEntry.date,
          hoursWorked: totalPaidDurationHours,
          ptoEarned: ptoEarned,
          accrualRateUsed: ptoAccrualRate, // <-- ADDED
          shiftId: newHistoryEntry.id,
          employeeId: employeeId,
        };
        usePtoStore.getState().recordPtoAccrual(ptoEntry);
        console.log(
          `PTO accrued for ${employeeId}: ${ptoEarned.toFixed(2)} hours`
        );
      }
    } catch (error) {
      console.error("Error during PTO accrual:", error);
      toastService.show({
        title: "PTO Error",
        message:
          "An error occurred while recording PTO accrual. Please contact support.",
        type: "error",
      });
    }
    // --- End PTO Accrual Logic ---

    // Cascade the clock-out action to the employee store
    useEmployeeStore.getState().clockOut(employeeId);

    // MODIFIED: If the person clocking out is the active user, also sign them out of the terminal.
    if (activeEmployeeId === employeeId) {
      useEmployeeStore.getState().signOut();
    }

    toastService.show({
      title: "Clocked Out",
      message: "You have been successfully clocked out.",
      type: "success",
    });
  },

  getSession: (employeeId: string) => get().sessions[employeeId],
  showClockInWall: () => set({ isClockInWallOpen: true }),
  hideClockInWall: () => set({ isClockInWallOpen: false }),
  checkEmployeeInShift: (employeeId: string) => {
    const { sessions } = get();
    return sessions[employeeId]?.status === "clockedIn";
  },
}));
