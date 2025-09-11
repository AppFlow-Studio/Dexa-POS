import { ShiftHistoryEntry } from "@/lib/types"; // Assuming this type is in types.ts
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { create } from "zustand";

type ClockStatus = "clockedOut" | "clockedIn" | "onBreak";

// Define the shape of a single shift
export interface Shift {
  clockInTime: Date | null;
  breakStartTime: Date | null;
  breakEndTime: Date | null;
  clockOutTime: Date | null;
  hasTakenBreak: boolean;
}

interface TimeclockState {
  status: ClockStatus;
  currentShift: Shift | null;
  shiftHistory: ShiftHistoryEntry[]; // To hold the table data
  isClockInWallOpen: boolean;
  // Pin-based tracking
  clockedInByPin: Record<string, { clockInTime: Date }>;

  // Actions
  clockIn: () => void;
  clockOut: () => void;
  startBreak: () => void;
  endBreak: () => void;
  showClockInWall: () => void;
  hideClockInWall: () => void;
  // Pin actions
  isPinClockedIn: (pin: string) => boolean;
  clockInWithPin: (pin: string) => { ok: true } | { ok: false; reason: "already_clocked_in" | "invalid_pin" };
  clockOutWithPin: (pin: string) => { ok: true } | { ok: false; reason: "not_clocked_in" | "invalid_pin" };
}

// Default break duration in minutes
const BREAK_DURATION_MINUTES = 30;

export const useTimeclockStore = create<TimeclockState>((set, get) => ({
  status: "clockedOut",
  currentShift: null,
  shiftHistory: [], // Start with empty history
  isClockInWallOpen: false,
  clockedInByPin: {},

  clockIn: () => {
    const newShift: Shift = {
      clockInTime: new Date(),
      breakStartTime: null,
      breakEndTime: null,
      clockOutTime: null,
      hasTakenBreak: false,
    };
    set({ status: "clockedIn", currentShift: newShift });
  },

  clockOut: () => {
    const { currentShift } = get();
    if (!currentShift || !currentShift.clockInTime) return;

    const clockOutTime = new Date();
    const durationMs =
      clockOutTime.getTime() - currentShift.clockInTime.getTime();
    const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

    const newHistoryEntry: ShiftHistoryEntry = {
      id: `shift_${Date.now()}`,
      date: currentShift.clockInTime.toLocaleDateString(),
      role: "Cashier",
      clockIn: currentShift.clockInTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      breakInitiated:
        currentShift.breakStartTime?.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }) || "N/A",
      breakEnded:
        currentShift.breakEndTime?.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }) || "N/A",
      clockOut: clockOutTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      duration: `${durationHours}h`,
    };

    set((state) => ({
      status: "clockedOut",
      currentShift: null,
      shiftHistory: [newHistoryEntry, ...state.shiftHistory],
    }));
  },

  startBreak: () => {
    const { currentShift } = get();
    if (currentShift?.hasTakenBreak) {
      toast.error("Break Already Taken", {
        position: ToastPosition.BOTTOM,
        duration: 4000,
      });
      return;
    }

    set((state) => ({
      status: "onBreak",
      currentShift: state.currentShift
        ? { ...state.currentShift, breakStartTime: new Date() }
        : null,
    }));
  },

  endBreak: () => {
    set((state) => {
      if (state.status === "onBreak" && state.currentShift) {
        return {
          status: "clockedIn",
          currentShift: {
            ...state.currentShift,
            breakEndTime: new Date(),
            hasTakenBreak: true, // Mark the break as used
          },
        };
      }
      return {};
    });
  },
  showClockInWall: () => set({ isClockInWallOpen: true }),
  hideClockInWall: () => set({ isClockInWallOpen: false }),

  // Pin helpers
  isPinClockedIn: (pin: string) => {
    const { clockedInByPin } = get();
    return !!clockedInByPin[pin];
  },
  clockInWithPin: (pin: string) => {
    if (!pin || pin.trim().length === 0) return { ok: false as const, reason: "invalid_pin" as const };
    const { clockedInByPin } = get();
    if (clockedInByPin[pin]) {
      return { ok: false as const, reason: "already_clocked_in" as const };
    }
    const clockInTime = new Date();
    set((state) => ({
      status: "clockedIn",
      currentShift: state.currentShift ?? { clockInTime, breakStartTime: null, breakEndTime: null, clockOutTime: null, hasTakenBreak: false },
      clockedInByPin: { ...state.clockedInByPin, [pin]: { clockInTime } },
    }));
    return { ok: true as const };
  },
  clockOutWithPin: (pin: string) => {
    if (!pin || pin.trim().length === 0) return { ok: false as const, reason: "invalid_pin" as const };
    const { clockedInByPin } = get();
    const entry = clockedInByPin[pin];
    if (!entry) {
      return { ok: false as const, reason: "not_clocked_in" as const };
    }
    const clockOutTime = new Date();
    const clockInTime = entry.clockInTime;
    const durationMs = clockOutTime.getTime() - clockInTime.getTime();
    const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);
    const newHistoryEntry: ShiftHistoryEntry = {
      id: `shift_${Date.now()}`,
      date: clockInTime.toLocaleDateString(),
      role: "Cashier",
      clockIn: clockInTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      breakInitiated: "N/A",
      breakEnded: "N/A",
      clockOut: clockOutTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      duration: `${durationHours}h`,
    };
    set((state) => {
      const { [pin]: _, ...rest } = state.clockedInByPin;
      return {
        status: Object.keys(rest).length > 0 ? state.status : "clockedOut",
        currentShift: Object.keys(rest).length > 0 ? state.currentShift : null,
        shiftHistory: [newHistoryEntry, ...state.shiftHistory],
        clockedInByPin: rest,
      };
    });
    return { ok: true as const };
  },
}));
