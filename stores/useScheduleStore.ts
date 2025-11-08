import { MOCK_SWAP_REQUESTS } from "@/lib/mockData";
import {
  ConflictInfo,
  PTORequest,
  SchedulePeriod,
  Shift,
  ShiftRequest,
  WeeklySchedule,
} from "@/lib/types";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
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
  proposeSwap: (myShift: Shift, peerShift: Shift) => void;
  cancelSwap: (requestId: string, employeeId: string) => void;
  acceptSwap: (requestId: string, peerId: string) => void;
  denySwap: (requestId: string, reason?: string) => void;
  approveSwap: (requestId: string) => void;
  addPTORequest: (
    request: Omit<PTORequest, "id" | "submittedAt" | "status">
  ) => void;

  // Drop Request Actions
  approveDropRequest: (requestId: string, approverId: string) => void;
  denyDropRequest: (
    requestId: string,
    approverId: string,
    reason: string
  ) => void;
  cancelDropRequest: (requestId: string) => void;

  // PTO Request Actions
  approvePTORequest: (requestId: string, approverId: string) => void;
  denyPTORequest: (
    requestId: string,
    approverId: string,
    reason: string
  ) => void;
  cancelPTORequest: (requestId: string) => void;
  checkPtoConflict: (
    employeeId: string,
    newStartDate: string,
    newEndDate: string
  ) => boolean;

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
  getSwappableShiftsForPeer: (peerId: string, requesterId: string) => Shift[];
  getCompatiblePeersForSwap: (
    shiftToOffer: Shift
  ) => { employee: EmployeeProfile; swappableShiftsCount: number }[];
  discardDraft: (draftId: string, scheduleType: "period" | "week") => void;
}

export const useScheduleStore = create<ScheduleRequestState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Initial State
        schedulePeriods: [],
        weeklySchedules: [],
        dropRequests: [],
        swapRequests: MOCK_SWAP_REQUESTS,
        ptoRequests: [],

        addDropRequest: (request) => {
          set((state) => {
            const newRequest: ShiftRequest = {
              ...request,
              id: `drop_${Date.now()}`,
              type: "drop",
            };
            state.dropRequests.unshift(newRequest);

            // Update the status of the actual shift to 'dropped'
            const allSchedules = [
              ...state.schedulePeriods,
              ...state.weeklySchedules,
            ];
            for (const schedule of allSchedules) {
              const shift = schedule.shifts.find(
                (s) => s.id === request.shift.id
              );
              if (shift) {
                shift.status = "dropped";
              }
            }
          });
        },
        proposeSwap: (myShift, peerShift) => {
          set((state) => {
            if (!myShift.employeeId || !peerShift.employeeId) {
              console.error(
                "Cannot propose a swap for shifts without employees."
              );
              return;
            }

            const newRequest: ShiftRequest = {
              id: generateId(),
              ownerId: myShift.employeeId,
              type: "swap",
              status: "pending-peer",
              submittedAt: new Date().toISOString(),
              myShiftId: myShift.id,
              peerId: peerShift.employeeId,
              peerShiftId: peerShift.id,
              shift: myShift, // Legacy support for now
            };

            state.swapRequests.unshift(newRequest);

            // Update status for both shifts across all schedules
            const allSchedules = [
              ...state.schedulePeriods,
              ...state.weeklySchedules,
            ];
            for (const schedule of allSchedules) {
              const myShiftInSchedule = schedule.shifts.find(
                (s) => s.id === myShift.id
              );
              if (myShiftInSchedule) {
                myShiftInSchedule.status = "pending-swap";
              }
              const peerShiftInSchedule = schedule.shifts.find(
                (s) => s.id === peerShift.id
              );
              if (peerShiftInSchedule) {
                peerShiftInSchedule.status = "pending-swap";
              }
            }
          });
        },
        cancelSwap: (requestId, employeeId) => {
          set((state) => {
            const requestIndex = state.swapRequests.findIndex(
              (r) => r.id === requestId
            );
            if (requestIndex === -1) {
              console.error("Swap request not found");
              return;
            }

            const request = state.swapRequests[requestIndex];

            if (
              request.ownerId !== employeeId ||
              request.status !== "pending-peer"
            ) {
              console.error(
                "Unauthorized or invalid status to cancel swap request."
              );
              return;
            }

            // Revert shift statuses
            const allSchedules = [
              ...state.schedulePeriods,
              ...state.weeklySchedules,
            ];
            for (const schedule of allSchedules) {
              const myShift = schedule.shifts.find(
                (s) => s.id === request.myShiftId
              );
              if (myShift) {
                myShift.status = "confirmed";
              }
              const peerShift = schedule.shifts.find(
                (s) => s.id === request.peerShiftId
              );
              if (peerShift) {
                peerShift.status = "confirmed";
              }
            }

            // Remove the request
            state.swapRequests.splice(requestIndex, 1);
          });
        },
        acceptSwap: (requestId, peerId) => {
          set((state) => {
            const request = state.swapRequests.find((r) => r.id === requestId);
            if (!request) {
              console.error("Swap request not found");
              return;
            }

            if (
              request.peerId !== peerId ||
              request.status !== "pending-peer"
            ) {
              console.error(
                "Unauthorized or invalid status to accept swap request."
              );
              return;
            }

            request.status = "pending-manager";
          });
        },
        denySwap: (requestId, reason) => {
          set((state) => {
            const request = state.swapRequests.find((r) => r.id === requestId);
            if (!request) {
              console.error("Swap request not found");
              return;
            }

            request.status = "denied";
            if (reason) {
              request.denialReason = reason;
            }

            // Revert shift statuses
            const allSchedules = [
              ...state.schedulePeriods,
              ...state.weeklySchedules,
            ];
            for (const schedule of allSchedules) {
              const myShift = schedule.shifts.find(
                (s) => s.id === request.myShiftId
              );
              if (myShift) {
                myShift.status = "confirmed";
              }
              const peerShift = schedule.shifts.find(
                (s) => s.id === request.peerShiftId
              );
              if (peerShift) {
                peerShift.status = "confirmed";
              }
            }
          });
        },
        approveSwap: (requestId) => {
          set((state) => {
            const request = state.swapRequests.find((r) => r.id === requestId);
            if (!request || request.status !== "pending-manager") {
              console.error(
                "Swap request not found or not in a pending-manager state."
              );
              return;
            }

            request.status = "approved";

            const { ownerId, peerId, myShiftId, peerShiftId } = request;

            // Swap employees and revert status in all schedules
            const allSchedules = [
              ...state.schedulePeriods,
              ...state.weeklySchedules,
            ];
            for (const schedule of allSchedules) {
              const myShift = schedule.shifts.find((s) => s.id === myShiftId);
              const peerShift = schedule.shifts.find(
                (s) => s.id === peerShiftId
              );

              if (myShift) {
                myShift.employeeId = peerId ?? null;
                myShift.status = "confirmed";
              }
              if (peerShift) {
                peerShift.employeeId = ownerId;
                peerShift.status = "confirmed";
              }
            }
          });
        },
        addPTORequest: (request) => {
          const newRequest: PTORequest = {
            ...request,
            id: `pto_${Date.now()}`,
            status: "pending",
            submittedAt: new Date().toISOString(),
          };
          set((state) => ({
            ptoRequests: [newRequest, ...state.ptoRequests],
          }));
        },

        // Drop Request Actions
        approveDropRequest: (requestId, approverId) => {
          set((state) => {
            const request = state.dropRequests.find((r) => r.id === requestId);
            if (!request) {
              console.error("Drop request not found");
              return;
            }

            // Find and update the corresponding shift in all schedules
            const allSchedules = [
              ...state.schedulePeriods,
              ...state.weeklySchedules,
            ];
            for (const schedule of allSchedules) {
              const shift = schedule.shifts.find(
                (s) => s.id === request.shift.id
              );
              if (shift) {
                shift.status = "open";
              }
            }

            // Remove the approved request from the list
            state.dropRequests = state.dropRequests.filter(
              (r) => r.id !== requestId
            );
          });
        },

        denyDropRequest: (requestId, approverId, reason) => {
          set((state) => {
            const request = state.dropRequests.find((r) => r.id === requestId);
            if (request) {
              request.status = "denied";
              request.approverId = approverId;
              request.denialReason = reason;

              // Revert the shift's status to 'confirmed'
              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];
              for (const schedule of allSchedules) {
                const shift = schedule.shifts.find(
                  (s) => s.id === request.shift.id
                );
                if (shift) {
                  shift.status = "confirmed";
                }
              }
            }
          });
        },

        cancelDropRequest: (requestId) => {
          set((state) => {
            const request = state.dropRequests.find(
              (r) => r.id === requestId && r.status === "pending"
            );
            if (!request) return;

            // Revert the shift's status to 'confirmed'
            const allSchedules = [
              ...state.schedulePeriods,
              ...state.weeklySchedules,
            ];
            for (const schedule of allSchedules) {
              const shift = schedule.shifts.find(
                (s) => s.id === request.shift.id
              );
              if (shift) {
                shift.status = "confirmed";
              }
            }

            // Remove the request from the list
            state.dropRequests = state.dropRequests.filter(
              (r) => r.id !== requestId
            );
          });
        },

        // PTO Request Actions
        approvePTORequest: (requestId, approverId) => {
          set((state) => {
            const request = state.ptoRequests.find((r) => r.id === requestId);
            if (!request) {
              console.error(`PTO Request with ID ${requestId} not found.`);
              return;
            }

            // Update its status and approverId
            request.status = "approved";
            request.approverId = approverId;
            request.reviewedAt = new Date().toISOString();

            // Crucially, iterate through all schedules
            const allSchedules = [
              ...state.schedulePeriods,
              ...state.weeklySchedules,
            ];

            for (const schedule of allSchedules) {
              // Find all shifts for the employee
              for (const shift of schedule.shifts) {
                if (shift.employeeId === request.employeeId) {
                  // Check if the shift's date falls within the approved PTO range
                  const shiftIsInPTORange =
                    shift.date >= request.startDate &&
                    shift.date <= request.endDate;

                  if (shiftIsInPTORange) {
                    // Convert the conflicting shift to an open shift
                    shift.employeeId = null;
                    shift.status = "open";
                  }
                }
              }
            }
          });
        },

        denyPTORequest: (requestId, approverId, reason) => {
          set((state) => {
            const request = state.ptoRequests.find((r) => r.id === requestId);
            if (!request) {
              console.error(`PTO Request with ID ${requestId} not found.`);
              return;
            }

            // Update its status, approverId, and denialReason
            request.status = "denied";
            request.approverId = approverId;
            request.denialReason = reason;
            request.reviewedAt = new Date().toISOString(); // Add reviewedAt timestamp
          });
        },

        cancelPTORequest: (requestId) => {
          set((state) => {
            // Find the PTORequest and ensure it\'s still pending
            const request = state.ptoRequests.find(
              (r) => r.id === requestId && r.status === "pending"
            );
            if (!request) {
              console.warn(
                `PTO Request with ID ${requestId} not found or not pending.`
              );
              return;
            }

            // Filter the ptoRequests array to remove the specified pending request.
            state.ptoRequests = state.ptoRequests.filter(
              (r) => r.id !== requestId
            );
          });
        },

        checkPtoConflict: (employeeId, newStartDate, newEndDate) => {
          const conflictingPto = get().ptoRequests.find((pto) => {
            if (pto.employeeId !== employeeId) return false;

            const existingStart = new Date(pto.startDate);
            const existingEnd = new Date(pto.endDate);
            const newRequestStart = new Date(newStartDate);
            const newRequestEnd = new Date(newEndDate);

            return areIntervalsOverlapping(
              { start: newRequestStart, end: newRequestEnd },
              { start: existingStart, end: existingEnd }
            );
          });
          return !!conflictingPto;
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

          // Fix the periodId for each shift in the new draft
          draftSchedule.shifts.forEach((shift: Shift) => {
            shift.periodId = draftId;
          });

          set((state) => {
            if (scheduleType === "period") {
              state.schedulePeriods.push(draftSchedule as SchedulePeriod);
            } else {
              state.weeklySchedules.push(draftSchedule as WeeklySchedule);
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

          console.log("Original Schedule:", originalSchedule);
          console.log("Draft Schedule:", draftSchedule);

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

              // Create copies and remove the property that is expected to be different
              const tempOriginal = { ...originalShift };
              const tempDraft = { ...draftShift };
              // @ts-ignore - periodId is expected to be different, so ignore for comparison
              delete tempOriginal.periodId;
              // @ts-ignore
              delete tempDraft.periodId;

              // Now compare the modified copies
              if (JSON.stringify(tempOriginal) !== JSON.stringify(tempDraft)) {
                updated++;
              }
            }
          });

          return { added, updated, removed };
        },

        getSwappableShiftsForPeer: (peerId, requesterId) => {
          const allShifts = [
            ...get().schedulePeriods.flatMap((p) => p.shifts),
            ...get().weeklySchedules.flatMap((w) => w.shifts),
          ];

          const requesterShifts = allShifts.filter(
            (s) => s.employeeId === requesterId
          );
          const peerShifts = allShifts.filter(
            (s) => s.employeeId === peerId && s.status === "confirmed"
          );

          return peerShifts.filter((peerShift) => {
            return !requesterShifts.some((requesterShift) =>
              areIntervalsOverlapping(
                {
                  start: new Date(peerShift.startTime),
                  end: new Date(peerShift.endTime),
                },
                {
                  start: new Date(requesterShift.startTime),
                  end: new Date(requesterShift.endTime),
                }
              )
            );
          });
        },

        getCompatiblePeersForSwap: (shiftToOffer) => {
          if (!shiftToOffer.employeeId) {
            return [];
          }
          const { employees } = useEmployeeStore.getState();
          const allShifts = [
            ...get().schedulePeriods.flatMap((p) => p.shifts),
            ...get().weeklySchedules.flatMap((w) => w.shifts),
          ];

          const peers = employees.filter(
            (emp) => emp.id !== shiftToOffer.employeeId
          );

          const compatiblePeers = peers.filter((peer) => {
            const peerShifts = allShifts.filter(
              (s) => s.employeeId === peer.id
            ) as Shift[];
            return !peerShifts.some((peerShift) =>
              areIntervalsOverlapping(
                {
                  start: new Date(shiftToOffer.startTime),
                  end: new Date(shiftToOffer.endTime),
                },
                {
                  start: new Date(peerShift.startTime),
                  end: new Date(peerShift.endTime),
                }
              )
            );
          });

          return compatiblePeers.map((peer) => ({
            employee: peer,
            swappableShiftsCount: get().getSwappableShiftsForPeer(
              peer.id,
              shiftToOffer.employeeId as string
            ).length,
          }));
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
