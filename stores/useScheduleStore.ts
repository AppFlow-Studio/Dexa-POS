import {
  MOCK_DROP_REQUESTS,
  MOCK_PTO_REQUESTS,
  MOCK_SWAP_REQUESTS,
} from "@/lib/mockData";
import {
  ConflictInfo,
  PTORequest,
  SchedulePeriod,
  Shift,
  ShiftRequest,
  WeeklySchedule,
} from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { areIntervalsOverlapping } from "date-fns";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// Helper to generate unique IDs
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2);

interface ScheduleRequestState {
  schedulePeriods: SchedulePeriod[];
  weeklySchedules: WeeklySchedule[];
  dropRequests: ShiftRequest[];
  swapRequests: ShiftRequest[];
  ptoRequests: PTORequest[];

  addDropRequest: (request: Omit<ShiftRequest, "id" | "type">) => void;
  addSwapRequest: (request: Omit<ShiftRequest, "id" | "type">) => void;
  addPTORequest: (request: Omit<PTORequest, "id" | "submittedAt">) => void;

  addShift: (
    scheduleId: string,
    scheduleType: "period" | "week",
    newShift: Omit<Shift, "id">
  ) => void;
  updateShift: (
    scheduleId: string,
    scheduleType: "period" | "week",
    updatedShift: Partial<Shift> & { id: string }
  ) => void;
  deleteShift: (
    scheduleId: string,
    scheduleType: "period" | "week",
    shiftId: string
  ) => void;

  addWeeklySchedule: (
    newSchedule: Omit<
      WeeklySchedule,
      "id" | "createdAt" | "updatedAt" | "shifts"
    >
  ) => string;
  addSchedulePeriod: (
    newPeriod: Omit<SchedulePeriod, "id" | "createdAt" | "updatedAt" | "shifts">
  ) => void;
  updateSchedulePeriod: (
    periodId: string,
    updates: Partial<SchedulePeriod>
  ) => void;
  updateWeeklySchedule: (
    scheduleId: string,
    updates: Partial<WeeklySchedule>
  ) => void;
  checkDateConflicts: (
    startDate: string,
    endDate: string,
    excludePeriodId?: string
  ) => ConflictInfo;
  checkShiftConflicts: (
    scheduleId: string,
    scheduleType: "period" | "week"
  ) => { employeeName: string; date: string }[];
  getShiftsForEmployee: (employeeId: string) => Shift[];
  publishSchedule: (
    scheduleId: string,
    scheduleType: "period" | "week"
  ) => void;
}

export const useScheduleStore = create<ScheduleRequestState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Initial State
        schedulePeriods: [],
        weeklySchedules: [],
        dropRequests: MOCK_DROP_REQUESTS,
        swapRequests: MOCK_SWAP_REQUESTS,
        ptoRequests: MOCK_PTO_REQUESTS,

        addDropRequest: (request) => {
          const newRequest: ShiftRequest = {
            ...request,
            id: `drop_${Date.now()}`,
            type: "drop",
          };
          set((state) => ({
            dropRequests: [newRequest, ...state.dropRequests],
          }));
        },
        addSwapRequest: (request) => {
          const newRequest: ShiftRequest = {
            ...request,
            id: `swap_${Date.now()}`,
            type: "swap",
          };
          set((state) => ({
            swapRequests: [newRequest, ...state.swapRequests],
          }));
        },
        addPTORequest: (request) => {
          const newRequest: PTORequest = {
            ...request,
            id: `pto_${Date.now()}`,
            submittedAt: new Date().toISOString(),
          };
          set((state) => ({
            ptoRequests: [newRequest, ...state.ptoRequests],
          }));
        },

        addShift: (scheduleId, scheduleType, newShift) => {
          set((state) => {
            const targetArray =
              scheduleType === "period"
                ? state.schedulePeriods
                : state.weeklySchedules;
            const schedule = targetArray.find(
              (s: SchedulePeriod | WeeklySchedule) => s.id === scheduleId
            );
            if (schedule) {
              schedule.shifts.push({ ...newShift, id: generateId() });
              schedule.updatedAt = new Date().toISOString();
            }
          });
        },

        updateShift: (scheduleId, scheduleType, updatedShift) => {
          set((state) => {
            const targetArray =
              scheduleType === "period"
                ? state.schedulePeriods
                : state.weeklySchedules;
            const schedule = targetArray.find(
              (s: SchedulePeriod | WeeklySchedule) => s.id === scheduleId
            );
            if (schedule) {
              const shiftIndex = schedule.shifts.findIndex(
                (s: Shift) => s.id === updatedShift.id
              );
              if (shiftIndex !== -1) {
                Object.assign(schedule.shifts[shiftIndex], updatedShift);
                schedule.updatedAt = new Date().toISOString();
              }
            }
          });
        },

        deleteShift: (scheduleId, scheduleType, shiftId) => {
          set((state) => {
            const targetArray =
              scheduleType === "period"
                ? state.schedulePeriods
                : (state.weeklySchedules as (
                    | SchedulePeriod
                    | WeeklySchedule
                  )[]); // Explicitly cast to a union type
            const schedule = targetArray.find(
              (s: SchedulePeriod | WeeklySchedule) => s.id === scheduleId
            );
            if (schedule) {
              schedule.shifts = schedule.shifts.filter(
                (s: Shift) => s.id !== shiftId
              );
              schedule.updatedAt = new Date().toISOString();
            }
          });
        },

        addWeeklySchedule: (newSchedule) => {
          const id = generateId();
          const createdSchedule: WeeklySchedule = {
            ...newSchedule,
            id,
            shifts: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            type: "weekly",
          };
          set((state) => {
            state.weeklySchedules.push(createdSchedule);
          });
          return id;
        },

        addSchedulePeriod: (newPeriod) => {
          const newSchedulePeriod: SchedulePeriod = {
            ...newPeriod,
            id: generateId(),
            shifts: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          set((state) => {
            state.schedulePeriods.push(newSchedulePeriod);
          });
        },

        updateSchedulePeriod: (periodId, updates) => {
          set((state) => {
            const period = state.schedulePeriods.find((p) => p.id === periodId);
            if (period) {
              Object.assign(period, updates);
              period.updatedAt = new Date().toISOString();
            }
          });
        },

        updateWeeklySchedule: (scheduleId, updates) => {
          set((state) => {
            const schedule = state.weeklySchedules.find(
              (s) => s.id === scheduleId
            );
            if (schedule) {
              Object.assign(schedule, updates);
              schedule.updatedAt = new Date().toISOString();
            }
          });
        },

        checkDateConflicts: (startDate, endDate, excludePeriodId) => {
          const periods = get().schedulePeriods.filter(
            (p) => p.id !== excludePeriodId
          );
          const conflictingPeriods = periods.filter((period) => {
            return areIntervalsOverlapping(
              { start: new Date(startDate), end: new Date(endDate) },
              {
                start: new Date(period.startDate),
                end: new Date(period.endDate),
              }
            );
          });
          return {
            hasConflict: conflictingPeriods.length > 0,
            conflictingPeriods: conflictingPeriods.map((p) => ({ ...p })),
          };
        },

        checkShiftConflicts: (scheduleId, scheduleType) => {
          const allSchedules = [
            ...get().schedulePeriods,
            ...get().weeklySchedules,
          ];
          const employees = useEmployeeStore.getState().employees; // Access employees from other store

          const conflicts: { employeeName: string; date: string }[] = [];

          // Find the target schedule
          const targetSchedule = allSchedules.find(
            (s) =>
              s.id === scheduleId &&
              ((scheduleType === "period" && "isScheduled" in s) ||
                (scheduleType === "week" && "type" in s && s.type === "weekly"))
          );

          if (!targetSchedule) {
            console.warn(`Target schedule ${scheduleId} not found.`);
            return [];
          }

          // Collect all shifts from other schedules
          const otherShifts: Shift[] = [];
          allSchedules.forEach((s) => {
            if (s.id !== scheduleId) {
              // Exclude the target schedule itself
              otherShifts.push(...s.shifts);
            }
          });

          // Check for conflicts for each shift in the target schedule
          targetSchedule.shifts.forEach((targetShift) => {
            otherShifts.forEach((otherShift) => {
              if (
                targetShift.employeeId === otherShift.employeeId &&
                targetShift.date === otherShift.date &&
                targetShift.employeeId !== null // Only check for assigned shifts
              ) {
                const employee = employees.find(
                  (emp) => emp.id === targetShift.employeeId
                );
                if (employee) {
                  conflicts.push({
                    employeeName: employee.fullName,
                    date: targetShift.date,
                  });
                }
              }
            });
          });

          // Remove duplicate conflicts (same employee, same date might be reported multiple times)
          const uniqueConflicts = Array.from(
            new Set(conflicts.map((c) => `${c.employeeName}-${c.date}`))
          ).map((str) => {
            const [employeeName, date] = str.split("-");
            return { employeeName, date };
          });

          return uniqueConflicts;
        },

        getShiftsForEmployee: (employeeId) => {
          const allShifts = [
            ...get().schedulePeriods.flatMap((p) => p.shifts),
            ...get().weeklySchedules.flatMap((w) => w.shifts),
          ];
          return allShifts.filter((shift) => shift.employeeId === employeeId);
        },

        publishSchedule: (scheduleId, scheduleType) => {
          set((state) => {
            if (scheduleType === "period") {
              const period = state.schedulePeriods.find(
                (p: SchedulePeriod) => p.id === scheduleId
              );
              if (period) {
                period.status = "active";
                period.updatedAt = new Date().toISOString();
                period.shifts.forEach((shift) => {
                  shift.status = "confirmed";
                });
              }
            } else {
              const schedule = state.weeklySchedules.find(
                (s: WeeklySchedule) => s.id === scheduleId
              );
              if (schedule) {
                schedule.status = "active";
                schedule.updatedAt = new Date().toISOString();
                schedule.shifts.forEach((shift) => {
                  shift.status = "confirmed";
                });
              }
            }
          });
        },
      })),
      {
        name: "schedule-storage",
        partialize: (state) => ({
          schedulePeriods: state.schedulePeriods,
          weeklySchedules: state.weeklySchedules,
          dropRequests: state.dropRequests,
          swapRequests: state.swapRequests,
          ptoRequests: state.ptoRequests,
        }),
      }
    )
  )
);
