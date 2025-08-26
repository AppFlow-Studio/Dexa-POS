import { create } from "zustand";

type ClockStatus = "clockedOut" | "clockedIn" | "onBreak";

interface TimeclockState {
  status: ClockStatus;
  clockInTime: Date | null;
  breakStartTime: Date | null;

  // Actions
  clockIn: () => void;
  clockOut: () => void;
  startBreak: () => void;
  endBreak: () => void;
}

export const useTimeclockStore = create<TimeclockState>((set) => ({
  status: "clockedOut",
  clockInTime: null,
  breakStartTime: null,

  clockIn: () => set({ status: "clockedIn", clockInTime: new Date() }),

  clockOut: () =>
    set({ status: "clockedOut", clockInTime: null, breakStartTime: null }),

  startBreak: () =>
    set((state) => {
      if (state.status === "clockedIn") {
        return { status: "onBreak", breakStartTime: new Date() };
      }
      return {};
    }),

  endBreak: () =>
    set((state) => {
      if (state.status === "onBreak") {
        // In a real app, you'd log the break duration here
        return { status: "clockedIn", breakStartTime: null };
      }
      return {};
    }),
}));
