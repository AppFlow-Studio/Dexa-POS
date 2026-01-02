import { mmkvStorage } from "@/lib/storage";
import { TimeClockAction, TimeClockStatus } from "@/types/time-clock";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface TimeClockStore {
  // State
  status: TimeClockStatus;
  shiftId: string | null;
  employeeId: string | null;
  employeeName: string | null;
  breakStartTime: string | null; // ISO timestamp
  offlineQueue: TimeClockAction[];
  isSyncing: boolean;

  // Actions
  setStatus: (status: TimeClockStatus, shiftId?: string | null) => void;
  setEmployee: (employeeId: string | null, employeeName: string | null) => void;
  setBreakStartTime: (time: string | null) => void;
  queueAction: (action: TimeClockAction) => void;
  removeFromQueue: (actionId: string) => void;
  setSyncing: (isSyncing: boolean) => void;
  clearState: () => void;
}

export const useTimeClockStore = create<TimeClockStore>()(
  persist(
    (set) => ({
      status: "idle",
      shiftId: null,
      employeeId: null,
      employeeName: null,
      breakStartTime: null,
      offlineQueue: [],
      isSyncing: false,

      setStatus: (status, shiftId) =>
        set((state) => ({
          status,
          shiftId: shiftId !== undefined ? shiftId : state.shiftId,
        })),

      setEmployee: (employeeId, employeeName) =>
        set({
          employeeId,
          employeeName,
        }),

      setBreakStartTime: (time) => set({ breakStartTime: time }),

      queueAction: (action) =>
        set((state) => ({
          offlineQueue: [...state.offlineQueue, action],
        })),

      removeFromQueue: (actionId) =>
        set((state) => ({
          offlineQueue: state.offlineQueue.filter((a) => a.id !== actionId),
        })),

      setSyncing: (isSyncing) => set({ isSyncing }),

      clearState: () =>
        set({
          status: "idle",
          shiftId: null,
          employeeId: null,
          employeeName: null,
          breakStartTime: null,
          offlineQueue: [],
        }),
    }),
    {
      name: "dexa-pos-timeclock",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
