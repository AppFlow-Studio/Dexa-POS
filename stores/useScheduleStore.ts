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
  getDashboardSchedulePeriods: () => SchedulePeriod[];
  getDashboardWeeklySchedules: () => WeeklySchedule[];
  publishSchedule: (
    scheduleId: string,
    scheduleType: "period" | "week"
  ) => void;
  findOrCreateDraft: (
    originalScheduleId: string,
    scheduleType: "period" | "week"
  ) => string;
  compareSchedules: (
    originalId: string,
    draftId: string
  ) => { added: number; updated: number; removed: number };
  discardDraft: (draftId: string, scheduleType: "period" | "week") => void;
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
          const employees = useEmployeeStore.getState().employees;

          const conflicts: { employeeName: string; date: string }[] = [];

          const targetSchedule = allSchedules.find((s) => s.id === scheduleId);

          if (!targetSchedule) {
            console.warn(`Target schedule ${scheduleId} not found.`);
            return [];
          }

          const otherShifts: Shift[] = allSchedules
            .filter(
              (s) =>
                s.id !== scheduleId &&
                s.id !== targetSchedule.originalScheduleId
            )
            .flatMap((s) => s.shifts);

          targetSchedule.shifts.forEach((targetShift) => {
            otherShifts.forEach((otherShift) => {
              if (
                targetShift.employeeId === otherShift.employeeId &&
                targetShift.date === otherShift.date &&
                targetShift.employeeId !== null
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
          console.log("allShifts", allShifts);

          return allShifts.filter(
            (shift) =>
              shift.employeeId === employeeId &&
              (get().schedulePeriods.find((p) => p.id === shift.periodId)
                ?.status === "active" ||
                get().weeklySchedules.find((w) => w.id === shift.periodId)
                  ?.status === "active")
          );
        },

        getDashboardSchedulePeriods: () => {
          const { schedulePeriods } = get();
          const draftedIds = new Set(
            schedulePeriods
              .filter((p) => p.status === "draft-edit" && p.originalScheduleId)
              .map((p) => p.originalScheduleId)
          );
          return schedulePeriods.filter((p) => !draftedIds.has(p.id));
        },

        getDashboardWeeklySchedules: () => {
          const { weeklySchedules } = get();
          const draftedIds = new Set(
            weeklySchedules
              .filter((w) => w.status === "draft-edit" && w.originalScheduleId)
              .map((w) => w.originalScheduleId)
          );
          return weeklySchedules.filter((w) => !draftedIds.has(w.id));
        },

        publishSchedule: (scheduleId, scheduleType) => {
          set((state) => {
            const targetArray =
              scheduleType === "period"
                ? state.schedulePeriods
                : state.weeklySchedules;
            const schedule = targetArray.find((s) => s.id === scheduleId);

            if (schedule) {
              if (schedule.originalScheduleId) {
                const originalIndex = targetArray.findIndex(
                  (s) => s.id === schedule.originalScheduleId
                );
                if (originalIndex !== -1) {
                  const updatedOriginal = {
                    ...JSON.parse(JSON.stringify(schedule)),
                    id: schedule.originalScheduleId,
                    status: "active",
                    originalScheduleId: undefined,
                  };
                  updatedOriginal.shifts.forEach((shift: Shift) => {
                    shift.status = "confirmed";
                    shift.periodId = updatedOriginal.id;
                  });
                  (targetArray as any)[originalIndex] = updatedOriginal;
                  if (scheduleType === "period") {
                    state.schedulePeriods = state.schedulePeriods.filter(
                      (p) => p.id !== scheduleId
                    );
                  } else {
                    state.weeklySchedules = state.weeklySchedules.filter(
                      (w) => w.id !== scheduleId
                    );
                  }
                }
              } else {
                schedule.status = "active";
                schedule.updatedAt = new Date().toISOString();
                schedule.shifts.forEach((shift) => {
                  shift.status = "confirmed";
                });
              }
            }
          });
        },

        findOrCreateDraft: (originalScheduleId, scheduleType) => {
          const state = get();
          const targetArray =
            scheduleType === "period"
              ? state.schedulePeriods
              : state.weeklySchedules;
          const existingDraft = targetArray.find(
            (s) => s.originalScheduleId === originalScheduleId
          );
          if (existingDraft) {
            return existingDraft.id;
          }

          const originalSchedule = targetArray.find(
            (s) => s.id === originalScheduleId
          );
          if (!originalSchedule) {
            throw new Error("Original schedule not found");
          }

          const draftId = generateId();
          const draftSchedule = {
            ...JSON.parse(JSON.stringify(originalSchedule)), // Deep copy
            id: draftId,
            status: "draft-edit",
            originalScheduleId: originalScheduleId,
          };

          set((state) => {
            if (scheduleType === "period") {
              state.schedulePeriods.push(draftSchedule as SchedulePeriod);
            } else {
              state.weeklySchedules.push(draftSchedule as WeeklySchedule);
              console.log("added the new copy");
            }
          });

          return draftId;
        },

        compareSchedules: (originalId, draftId) => {
          const state = get();
          const originalSchedule =
            state.schedulePeriods.find((p) => p.id === originalId) ||
            state.weeklySchedules.find((w) => w.id === originalId);
          const draftSchedule =
            state.schedulePeriods.find((p) => p.id === draftId) ||
            state.weeklySchedules.find((w) => w.id === draftId);

          if (!originalSchedule || !draftSchedule) {
            return { added: 0, updated: 0, removed: 0 };
          }

          const originalShiftIds = new Set(
            originalSchedule.shifts.map((s) => s.id)
          );
          const draftShiftIds = new Set(draftSchedule.shifts.map((s) => s.id));

          const added = draftSchedule.shifts.filter(
            (s) => !originalShiftIds.has(s.id)
          ).length;
          const removed = originalSchedule.shifts.filter(
            (s) => !draftShiftIds.has(s.id)
          ).length;
          let updated = 0;

          draftSchedule.shifts.forEach((draftShift) => {
            if (originalShiftIds.has(draftShift.id)) {
              const originalShift = originalSchedule.shifts.find(
                (s) => s.id === draftShift.id
              );
              if (
                JSON.stringify(originalShift) !== JSON.stringify(draftShift)
              ) {
                updated++;
              }
            }
          });

          return { added, updated, removed };
        },

        discardDraft: (draftId, scheduleType) => {
          set((state) => {
            if (scheduleType === "period") {
              state.schedulePeriods = state.schedulePeriods.filter(
                (p) => p.id !== draftId
              );
            } else {
              state.weeklySchedules = state.weeklySchedules.filter(
                (w) => w.id !== draftId
              );
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
