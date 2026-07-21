import { createLazyPersistStorage } from "@/lib/storage";
import { PTOAccrualEntry } from "@/lib/types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { useStoreSettingsStore } from "./useStoreSettingsStore";

// accrualHistory is persisted and grows one entry per worked shift, per
// employee, forever (recordPtoAccrual is called on every shift close). Without
// a retention window the persisted Record grows unbounded over months/years.
// Balances track "this year" semantics, so keep accrual entries for the current
// calendar year only — older entries are already baked into balances.totalAccrued.
const isCurrentYear = (dateStr: string): boolean => {
  const year = new Date(dateStr).getFullYear();
  return !Number.isNaN(year) && year === new Date().getFullYear();
};

interface PtoState {
  accrualHistory: Record<string, PTOAccrualEntry[]>;
  balances: Record<string, { totalAccrued: number; usedThisYear: number }>;

  recordPtoAccrual: (entry: PTOAccrualEntry) => void;
  recordPtoUsage: (employeeId: string, hours: number) => void;
  revertPtoUsage: (employeeId: string, hours: number) => void;
  initializePtoFromHistory: () => void;
}

export const usePtoStore = create<PtoState>()(
  devtools(
    persist(
      immer((set) => ({
        accrualHistory: {},
        balances: {},

        /**
         * Initialize PTO from shift history (fetched from backend via timeclock store).
         * Call this after `fetchShiftHistory()` has populated the timeclock store.
         * Safe to call multiple times — recalculates from scratch each time.
         */
        initializePtoFromHistory: () => {
          const { useTimeclockStore } = require("./useTimeclockStore") as {
            useTimeclockStore: typeof import("./useTimeclockStore").useTimeclockStore;
          };
          const shiftHistory = useTimeclockStore.getState().shiftHistory;

          if (!shiftHistory.length) {
            console.log("[PTO] No shift history available, skipping PTO init.");
            return;
          }

          const ptoAccrualRate =
            useStoreSettingsStore.getState().ptoAccrualRate;

          const newAccrualHistory: Record<string, PTOAccrualEntry[]> = {};
          const newBalances: Record<
            string,
            { totalAccrued: number; usedThisYear: number }
          > = {};

          for (const shift of shiftHistory) {
            const hoursWorked = parseFloat(shift.duration.replace("h", ""));
            if (isNaN(hoursWorked) || hoursWorked <= 0) {
              continue;
            }

            const ptoEarned = hoursWorked * ptoAccrualRate;
            if (ptoEarned <= 0) {
              continue;
            }

            const entry: PTOAccrualEntry = {
              date: shift.date,
              hoursWorked: hoursWorked,
              ptoEarned: ptoEarned,
              accrualRateUsed: ptoAccrualRate,
              shiftId: shift.id,
              employeeId: shift.employeeId,
            };

            if (!newAccrualHistory[entry.employeeId]) {
              newAccrualHistory[entry.employeeId] = [];
            }
            if (!newBalances[entry.employeeId]) {
              newBalances[entry.employeeId] = {
                totalAccrued: 0,
                usedThisYear: 0,
              };
            }

            newAccrualHistory[entry.employeeId].push(entry);
            newBalances[entry.employeeId].totalAccrued += ptoEarned;
          }

          set({
            accrualHistory: newAccrualHistory,
            balances: newBalances,
          });

          console.log(`[PTO] Initialized from ${shiftHistory.length} shifts.`);
        },

        recordPtoAccrual: (entry) => {
          set((state) => {
            if (!state.accrualHistory[entry.employeeId]) {
              state.accrualHistory[entry.employeeId] = [];
            }
            // Avoid duplicates during live updates if a re-init happens
            if (
              !state.accrualHistory[entry.employeeId].some(
                (e) => e.shiftId === entry.shiftId,
              )
            ) {
              state.accrualHistory[entry.employeeId].push(entry);
            }

            // Retention: drop prior-year entries so the persisted history can't
            // grow unbounded. balances.totalAccrued already includes them, so
            // this only trims the auditable entry list, not the running balance.
            state.accrualHistory[entry.employeeId] = state.accrualHistory[
              entry.employeeId
            ].filter((e) => isCurrentYear(e.date));

            if (!state.balances[entry.employeeId]) {
              state.balances[entry.employeeId] = {
                totalAccrued: 0,
                usedThisYear: 0,
              };
            }
            state.balances[entry.employeeId].totalAccrued += entry.ptoEarned;
          });
        },

        recordPtoUsage: (employeeId, hours) => {
          set((state) => {
            if (!state.balances[employeeId]) {
              state.balances[employeeId] = {
                totalAccrued: 0,
                usedThisYear: 0,
              };
            }
            // Note: This logic assumes usage is recorded against an already accrued balance.
            // The balance will be negative if usage exceeds accrual.
            state.balances[employeeId].usedThisYear += hours;
          });
        },

        revertPtoUsage: (employeeId, hours) => {
          set((state) => {
            if (state.balances[employeeId]) {
              state.balances[employeeId].usedThisYear -= hours;
            }
          });
        },
      })),
      {
        name: "pto-storage",
        storage: createLazyPersistStorage(),
        version: 1,
        migrate: (persistedState) => persistedState as any,
        // We only persist the calculated history and balances.
        partialize: (state) => ({
          accrualHistory: state.accrualHistory,
          balances: state.balances,
        }),
      },
    ),
  ),
);
