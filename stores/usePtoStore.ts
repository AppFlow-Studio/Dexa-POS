import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { devtools, persist } from "zustand/middleware";
import { PTOAccrualEntry } from "@/lib/types";
import { useStoreSettingsStore } from "./useStoreSettingsStore";
import { useTimeclockStore } from "./useTimeclockStore";

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

        initializePtoFromHistory: () => {
          const shiftHistory = useTimeclockStore.getState().shiftHistory;
          const ptoAccrualRate = useStoreSettingsStore.getState().ptoAccrualRate;

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
              accrualRateUsed: ptoAccrualRate, // Use current rate for historical entries
              shiftId: shift.id,
              employeeId: shift.employeeId,
            };

            // Initialize records if they don't exist
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

          console.log("PTO history initialized from timeclock store.");
        },

        recordPtoAccrual: (entry) => {
          set((state) => {
            if (!state.accrualHistory[entry.employeeId]) {
              state.accrualHistory[entry.employeeId] = [];
            }
            // Avoid duplicates during live updates if a re-init happens
            if (
              !state.accrualHistory[entry.employeeId].some(
                (e) => e.shiftId === entry.shiftId
              )
            ) {
              state.accrualHistory[entry.employeeId].push(entry);
            }

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
        // We only persist the calculated history and balances.
        partialize: (state) => ({
          accrualHistory: state.accrualHistory,
          balances: state.balances,
        }),
      }
    )
  )
);
