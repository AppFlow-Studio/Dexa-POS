import { validatePtoRequest } from "@/lib/rules";
import { createLazyPersistStorage } from "@/lib/storage";
import {
    ApplyMode,
    ConflictInfo,
    PTORequest,
    SchedulePeriod,
    ScheduleTemplate,
    Shift,
    ShiftRequest,
    WeeklySchedule,
} from "@/lib/types";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import {
    addDays,
    areIntervalsOverlapping,
    format,
    getDay,
    parseISO,
    startOfDay,
} from "date-fns";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { useNotificationStore } from "./useNotificationStore";
import { usePtoStore } from "./usePtoStore";
import { useStoreSettingsStore } from "./useStoreSettingsStore";

// Helper to generate unique IDs
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2);

// ptoRequests is persisted (MMKV) and append-on-submit / remove-on-cancel only,
// so without a retention bound it grows for the app's lifetime. Keep the
// current + prior calendar year of RESOLVED requests; pending requests are
// always kept (an old-but-unactioned request is still actionable). Mirrors the
// current-year retention applied to usePtoStore.accrualHistory.
const PTO_REQUEST_RETENTION_YEARS = 1;
function prunePtoRequests(requests: PTORequest[]): PTORequest[] {
  const cutoffYear = new Date().getFullYear() - PTO_REQUEST_RETENTION_YEARS;
  return requests.filter((r) => {
    if (r.status === "pending") return true; // never drop unactioned requests
    const submittedYear = new Date(r.submittedAt).getFullYear();
    return !Number.isNaN(submittedYear) && submittedYear >= cutoffYear;
  });
}

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
  revertSwapApproval: (requestId: string) => void;
  addPTORequest: (
    request: Omit<PTORequest, "id" | "submittedAt" | "status">,
  ) => void;

  // Drop Request Actions
  approveDropRequest: (requestId: string, approverId: string) => void;
  revertDropRequestApproval: (requestId: string) => void;
  denyDropRequest: (
    requestId: string,
    approverId: string,
    reason: string,
  ) => void;
  cancelDropRequest: (requestId: string) => void;

  // PTO Request Actions
  approvePTORequest: (requestId: string, approverId: string) => void;
  revertPTORequestApproval: (requestId: string) => void;
  denyPTORequest: (
    requestId: string,
    approverId: string,
    reason: string,
  ) => void;
  cancelPTORequest: (requestId: string) => void;
  checkPtoConflict: (
    employeeId: string,
    newStartDate: string,
    newEndDate: string,
  ) => boolean;

  addShift: (
    scheduleId: string,
    scheduleType: "period" | "week",
    newShift: Omit<Shift, "id">,
  ) => void;
  pickupShift: (shiftId: string, employeeId: string) => void;
  updateShift: (
    scheduleId: string,
    scheduleType: "period" | "week",
    updatedShift: Partial<Shift> & { id: string },
  ) => void;
  deleteShift: (
    scheduleId: string,
    scheduleType: "period" | "week",
    shiftId: string,
  ) => void;

  addWeeklySchedule: (
    newSchedule: Omit<
      WeeklySchedule,
      "id" | "createdAt" | "updatedAt" | "shifts"
    >,
  ) => string;
  addSchedulePeriod: (
    newPeriod: Omit<
      SchedulePeriod,
      "id" | "createdAt" | "updatedAt" | "shifts"
    >,
  ) => string;
  updateSchedulePeriod: (
    periodId: string,
    updates: Partial<SchedulePeriod>,
  ) => void;
  updateWeeklySchedule: (
    scheduleId: string,
    updates: Partial<WeeklySchedule>,
  ) => void;
  deleteSchedule: (scheduleId: string, scheduleType: "period" | "week") => void; // Added function signature
  checkDateConflicts: (
    startDate: string,
    endDate: string,
    excludePeriodId?: string,
  ) => ConflictInfo;
  checkShiftConflicts: (
    scheduleId: string,
    scheduleType: "period" | "week",
  ) => { employeeName: string; date: string }[];
  getDashboardSchedulePeriods: () => SchedulePeriod[];
  getDashboardWeeklySchedules: () => WeeklySchedule[];
  publishSchedule: (
    scheduleId: string,
    scheduleType: "period" | "week",
  ) => void;
  findOrCreateDraft: (
    originalScheduleId: string,
    scheduleType: "period" | "week",
  ) => string;
  compareSchedules: (
    originalId: string,
    draftId: string,
  ) => { added: number; updated: number; removed: number };
  getSwappableShiftsForPeer: (peerId: string, requesterId: string) => Shift[];
  getCompatiblePeersForSwap: (
    shiftToOffer: Shift,
  ) => { employee: EmployeeProfile; swappableShiftsCount: number }[];
  discardDraft: (draftId: string, scheduleType: "period" | "week") => void;
  applyTemplate: (
    scheduleId: string,
    scheduleType: "period" | "week",
    template: ScheduleTemplate,
    mode: ApplyMode,
  ) => void;
  getAdvancedConflicts: (
    startDate: string,
    endDate: string,
  ) => {
    type: "overtime" | "minStaffing" | "backToBack" | "doubleBooked";
    details: string;
    shiftIds?: string[];
    date?: string;
  }[];
}

export const useScheduleStore = create<ScheduleRequestState>()(
  devtools(
    persist(
      immer((set, get) => {
        const getEmployeeName = (employeeId: string): string => {
          const { employees } = useEmployeeStore.getState();
          return (
            employees.find((e) => e.id === employeeId)?.fullName ||
            "Unknown Employee"
          );
        };

        return {
          // Initial State
          schedulePeriods: [],
          weeklySchedules: [],
          dropRequests: [],
          swapRequests: [],
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
                  (s) => s.id === request.shift.id,
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
                  "Cannot propose a swap for shifts without employees.",
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

              const initiatorName = getEmployeeName(myShift.employeeId);
              useNotificationStore.getState().addNotification({
                employeeId: peerShift.employeeId,
                type: "swap_request_received",
                message: `${initiatorName} has requested to swap their shift on ${format(new Date(myShift.date), "MMM d")} for your shift on ${format(new Date(peerShift.date), "MMM d")}.`,
                payload: { requestId: newRequest.id },
              });

              // Update status for both shifts across all schedules
              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];
              for (const schedule of allSchedules) {
                const myShiftInSchedule = schedule.shifts.find(
                  (s) => s.id === myShift.id,
                );
                if (myShiftInSchedule) {
                  myShiftInSchedule.status = "pending-swap";
                }
                const peerShiftInSchedule = schedule.shifts.find(
                  (s) => s.id === peerShift.id,
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
                (r) => r.id === requestId,
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
                  "Unauthorized or invalid status to cancel swap request.",
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
                  (s) => s.id === request.myShiftId,
                );
                if (myShift) {
                  myShift.status = "confirmed";
                }
                const peerShift = schedule.shifts.find(
                  (s) => s.id === request.peerShiftId,
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
              const request = state.swapRequests.find(
                (r) => r.id === requestId,
              );
              if (!request) {
                console.error("Swap request not found");
                return;
              }

              if (
                request.peerId !== peerId ||
                request.status !== "pending-peer"
              ) {
                console.error(
                  "Unauthorized or invalid status to accept swap request.",
                );
                return;
              }

              request.status = "pending-manager";

              const peerName = getEmployeeName(peerId);
              useNotificationStore.getState().addNotification({
                employeeId: request.ownerId,
                type: "swap_request_peer_accepted",
                message: `${peerName} accepted your swap request. It is now pending manager approval.`,
                payload: { requestId: request.id },
              });
            });
          },
          denySwap: (requestId, reason) => {
            set((state) => {
              const request = state.swapRequests.find(
                (r) => r.id === requestId,
              );
              if (!request) {
                console.error("Swap request not found");
                return;
              }

              const wasPendingPeer = request.status === "pending-peer";
              const wasPendingManager = request.status === "pending-manager";

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
                  (s) => s.id === request.myShiftId,
                );
                if (myShift) {
                  myShift.status = "confirmed";
                }
                const peerShift = schedule.shifts.find(
                  (s) => s.id === request.peerShiftId,
                );
                if (peerShift) {
                  peerShift.status = "confirmed";
                }
              }

              if (wasPendingPeer) {
                const peerName = getEmployeeName(request.peerId as string);
                useNotificationStore.getState().addNotification({
                  employeeId: request.ownerId,
                  type: "swap_request_peer_denied",
                  message: `${peerName} denied your swap request.`,
                  payload: { requestId: request.id },
                });
              } else if (wasPendingManager) {
                const ownerName = getEmployeeName(request.ownerId);
                const peerName = getEmployeeName(request.peerId as string);

                // Notify owner
                useNotificationStore.getState().addNotification({
                  employeeId: request.ownerId,
                  type: "swap_denied",
                  message: `Your shift swap with ${peerName} was denied by management.`,
                  payload: { requestId: request.id },
                });

                // Notify peer
                useNotificationStore.getState().addNotification({
                  employeeId: request.peerId as string,
                  type: "swap_denied",
                  message: `Your shift swap with ${ownerName} was denied by management.`,
                  payload: { requestId: request.id },
                });
              }
            });
          },
          approveSwap: (requestId) => {
            set((state) => {
              const request = state.swapRequests.find(
                (r) => r.id === requestId,
              );
              if (!request || request.status !== "pending-manager") {
                console.error(
                  "Swap request not found or not in a pending-manager state.",
                );
                return;
              }

              const { ownerId, peerId, myShiftId, peerShiftId } = request;
              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];

              let myShift, peerShift;
              for (const schedule of allSchedules) {
                if (!myShift)
                  myShift = schedule.shifts.find((s) => s.id === myShiftId);
                if (!peerShift)
                  peerShift = schedule.shifts.find((s) => s.id === peerShiftId);
              }

              if (myShift && peerShift) {
                request.revertedMyShift = JSON.parse(JSON.stringify(myShift));
                request.revertedPeerShift = JSON.parse(
                  JSON.stringify(peerShift),
                );

                myShift.employeeId = peerId ?? null;
                myShift.status = "confirmed";
                peerShift.employeeId = ownerId;
                peerShift.status = "confirmed";

                const ownerName = getEmployeeName(ownerId);
                const peerName = getEmployeeName(peerId as string);

                // Notify owner
                useNotificationStore.getState().addNotification({
                  employeeId: ownerId,
                  type: "swap_approved",
                  message: `Your shift swap with ${peerName} for ${format(new Date(myShift.date), "MMM d")} has been approved.`,
                  payload: { requestId: request.id },
                });

                // Notify peer
                useNotificationStore.getState().addNotification({
                  employeeId: peerId as string,
                  type: "swap_approved",
                  message: `Your shift swap with ${ownerName} for ${format(new Date(peerShift.date), "MMM d")} has been approved.`,
                  payload: { requestId: request.id },
                });
              }

              request.status = "approved";
            });
          },
          revertSwapApproval: (requestId) => {
            set((state) => {
              const request = state.swapRequests.find(
                (r) => r.id === requestId,
              );
              if (
                !request ||
                !request.revertedMyShift ||
                !request.revertedPeerShift
              ) {
                console.error(
                  `Swap request with ID ${requestId} not found or no reverted shifts stored.`,
                );
                return;
              }

              request.status = "pending-manager";

              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];
              for (const schedule of allSchedules) {
                const myShiftIndex = schedule.shifts.findIndex(
                  (s) => s.id === request.revertedMyShift!.id,
                );
                if (myShiftIndex !== -1) {
                  schedule.shifts[myShiftIndex] = JSON.parse(
                    JSON.stringify(request.revertedMyShift),
                  );
                }
                const peerShiftIndex = schedule.shifts.findIndex(
                  (s) => s.id === request.revertedPeerShift!.id,
                );
                if (peerShiftIndex !== -1) {
                  schedule.shifts[peerShiftIndex] = JSON.parse(
                    JSON.stringify(request.revertedPeerShift),
                  );
                }
              }

              // Remove notifications
              useNotificationStore.getState().removeNotification({
                type: "swap_approved",
                payload: { requestId },
              });

              request.revertedMyShift = undefined;
              request.revertedPeerShift = undefined;
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
              // Prune resolved requests outside the retention window so the
              // persisted list can't grow unbounded across the app lifetime.
              ptoRequests: prunePtoRequests([newRequest, ...state.ptoRequests]),
            }));
          },

          // Drop Request Actions
          approveDropRequest: (requestId, approverId) => {
            set((state) => {
              const request = state.dropRequests.find(
                (r) => r.id === requestId,
              );
              if (!request) {
                console.error("Drop request not found");
                return;
              }

              // Store original shift before modification
              request.revertedShift = JSON.parse(JSON.stringify(request.shift));

              // Find and update the corresponding shift in all schedules
              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];
              for (const schedule of allSchedules) {
                const shift = schedule.shifts.find(
                  (s) => s.id === request.shift.id,
                );
                if (shift) {
                  shift.status = "open";
                  shift.employeeId = null;
                }
              }

              // Update the request status
              request.status = "approved";
              request.approverId = approverId;

              useNotificationStore.getState().addNotification({
                employeeId: request.ownerId,
                type: "drop_request_approved",
                message: `Your request to drop your shift on ${format(new Date(request.shift.date), "MMM d")} has been approved.`,
                payload: { requestId: request.id, shiftId: request.shift.id },
              });
            });
          },

          revertDropRequestApproval: (requestId) => {
            set((state) => {
              const request = state.dropRequests.find(
                (r) => r.id === requestId,
              );
              if (!request || !request.revertedShift) {
                console.error(
                  `Drop request with ID ${requestId} not found or no reverted shift stored.`,
                );
                return;
              }

              // Revert the request's status
              request.status = "pending";
              request.approverId = undefined;

              // Restore the original shift
              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];
              for (const schedule of allSchedules) {
                const shiftIndex = schedule.shifts.findIndex(
                  (s) => s.id === request.revertedShift!.id,
                );
                if (shiftIndex !== -1) {
                  schedule.shifts[shiftIndex] = JSON.parse(
                    JSON.stringify(request.revertedShift),
                  );
                }
              }

              // Remove notification
              useNotificationStore.getState().removeNotification({
                type: "drop_request_approved",
                payload: { requestId: request.id, shiftId: request.shift.id },
              });

              // Clear the reverted shift
              request.revertedShift = undefined;
            });
          },

          denyDropRequest: (requestId, approverId, reason) => {
            set((state) => {
              const request = state.dropRequests.find(
                (r) => r.id === requestId,
              );
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
                    (s) => s.id === request.shift.id,
                  );
                  if (shift) {
                    shift.status = "confirmed";
                  }
                }

                useNotificationStore.getState().addNotification({
                  employeeId: request.ownerId,
                  type: "drop_request_denied",
                  message: `Your request to drop your shift on ${format(new Date(request.shift.date), "MMM d")} has been denied.`,
                  payload: { requestId: request.id, shiftId: request.shift.id },
                });
              }
            });
          },

          cancelDropRequest: (requestId) => {
            set((state) => {
              const request = state.dropRequests.find(
                (r) => r.id === requestId && r.status === "pending",
              );
              if (!request) return;

              // Revert the shift's status to 'confirmed'
              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];
              for (const schedule of allSchedules) {
                const shift = schedule.shifts.find(
                  (s) => s.id === request.shift.id,
                );
                if (shift) {
                  shift.status = "confirmed";
                }
              }

              // Remove the request from the list
              state.dropRequests = state.dropRequests.filter(
                (r) => r.id !== requestId,
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

              // Validate the PTO request
              const validationErrors = validatePtoRequest(request);
              if (validationErrors.length > 0) {
                console.error(
                  "PTO Request validation failed:",
                  validationErrors,
                );
                // Optionally, update request status to 'denied' or add a denial reason
                request.status = "denied";
                request.denialReason = validationErrors.join("; ");
                request.approverId = approverId;
                request.reviewedAt = new Date().toISOString();
                return;
              }

              // Store original shifts before modification
              const originalShifts: Shift[] = [];
              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];

              for (const schedule of allSchedules) {
                for (const shift of schedule.shifts) {
                  if (
                    shift.employeeId === request.employeeId &&
                    shift.date >= request.startDate &&
                    shift.date <= request.endDate
                  ) {
                    originalShifts.push(JSON.parse(JSON.stringify(shift)));
                  }
                }
              }
              request.revertedShifts = originalShifts;

              // Update its status and approverId
              request.status = "approved";
              request.approverId = approverId;
              request.reviewedAt = new Date().toISOString();

              // Record PTO usage
              usePtoStore
                .getState()
                .recordPtoUsage(request.employeeId, request.hours);

              // Crucially, iterate through all schedules
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

              // Add notification after PTO is approved
              useNotificationStore.getState().addNotification({
                employeeId: request.employeeId,
                type: "pto_request_approved",
                message: `Your PTO request for ${format(new Date(request.startDate), "MMM d")} - ${format(new Date(request.endDate), "MMM d")} has been approved.`,
                payload: { requestId: request.id },
              });
            });
          },
          revertPTORequestApproval: (requestId) => {
            set((state) => {
              const request = state.ptoRequests.find((r) => r.id === requestId);
              if (!request || !request.revertedShifts) {
                console.error(
                  `PTO Request with ID ${requestId} not found or no reverted shifts stored.`,
                );
                return;
              }

              // Revert the request's status
              request.status = "pending";
              request.approverId = undefined;
              request.reviewedAt = undefined;

              // Revert PTO usage by subtracting the hours from the used total
              usePtoStore
                .getState()
                .revertPtoUsage(request.employeeId, request.hours);

              // Restore the original shifts
              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];
              for (const originalShift of request.revertedShifts) {
                for (const schedule of allSchedules) {
                  const shiftIndex = schedule.shifts.findIndex(
                    (s) => s.id === originalShift.id,
                  );
                  if (shiftIndex !== -1) {
                    schedule.shifts[shiftIndex] = JSON.parse(
                      JSON.stringify(originalShift),
                    );
                  }
                }
              }

              // Remove notification
              useNotificationStore.getState().removeNotification({
                type: "pto_request_approved",
                payload: { requestId },
              });

              // Clear the reverted shifts
              request.revertedShifts = [];
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

              useNotificationStore.getState().addNotification({
                employeeId: request.employeeId,
                type: "pto_request_denied",
                message: `Your PTO request was denied. Reason: ${reason}`,
                payload: { requestId: request.id },
              });
            });
          },

          cancelPTORequest: (requestId) => {
            set((state) => {
              // Find the PTORequest
              const request = state.ptoRequests.find((r) => r.id === requestId);
              if (!request) {
                console.warn(`PTO Request with ID ${requestId} not found.`);
                return;
              }

              // If the request was approved, revert the PTO usage
              if (request.status === "approved") {
                usePtoStore
                  .getState()
                  .revertPtoUsage(request.employeeId, request.hours);

                // Restore the original shifts if they were stored
                if (
                  request.revertedShifts &&
                  request.revertedShifts.length > 0
                ) {
                  const allSchedules = [
                    ...state.schedulePeriods,
                    ...state.weeklySchedules,
                  ];
                  for (const originalShift of request.revertedShifts) {
                    for (const schedule of allSchedules) {
                      const shiftIndex = schedule.shifts.findIndex(
                        (s) => s.id === originalShift.id,
                      );
                      if (shiftIndex !== -1) {
                        schedule.shifts[shiftIndex] = JSON.parse(
                          JSON.stringify(originalShift),
                        );
                      }
                    }
                  }
                }
              }

              // Remove the request from the list
              state.ptoRequests = state.ptoRequests.filter(
                (r) => r.id !== requestId,
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
                { start: existingStart, end: existingEnd },
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
                (s: SchedulePeriod | WeeklySchedule) => s.id === scheduleId,
              );
              if (schedule) {
                schedule.shifts.push({ ...newShift, id: generateId() });
                schedule.updatedAt = new Date().toISOString();
              }
            });
          },

          pickupShift: (shiftId, employeeId) => {
            set((state) => {
              const allSchedules = [
                ...state.schedulePeriods,
                ...state.weeklySchedules,
              ];
              for (const schedule of allSchedules) {
                const shift = schedule.shifts.find((s) => s.id === shiftId);
                if (shift) {
                  shift.employeeId = employeeId;
                  shift.status = "confirmed";
                  schedule.updatedAt = new Date().toISOString();
                  return; // Stop searching once found
                }
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
                (s: SchedulePeriod | WeeklySchedule) => s.id === scheduleId,
              );
              if (schedule) {
                const shiftIndex = schedule.shifts.findIndex(
                  (s: Shift) => s.id === updatedShift.id,
                );
                if (shiftIndex !== -1) {
                  const previousShift = { ...schedule.shifts[shiftIndex] }; // Capture previous state
                  Object.assign(schedule.shifts[shiftIndex], updatedShift);
                  schedule.updatedAt = new Date().toISOString();

                  const currentShift = schedule.shifts[shiftIndex];
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
                (s: SchedulePeriod | WeeklySchedule) => s.id === scheduleId,
              );
              if (schedule) {
                schedule.shifts = schedule.shifts.filter(
                  (s: Shift) => s.id !== shiftId,
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
            const id = generateId();
            const newSchedulePeriod: SchedulePeriod = {
              ...newPeriod,
              id,
              shifts: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              type: "period",
            };
            set((state) => {
              state.schedulePeriods.push(newSchedulePeriod);
            });
            return id;
          },

          updateSchedulePeriod: (periodId, updates) => {
            set((state) => {
              const period = state.schedulePeriods.find(
                (p) => p.id === periodId,
              );
              if (period) {
                Object.assign(period, updates);
                period.updatedAt = new Date().toISOString();
              }
            });
          },

          updateWeeklySchedule: (scheduleId, updates) => {
            set((state) => {
              const schedule = state.weeklySchedules.find(
                (s) => s.id === scheduleId,
              );
              if (schedule) {
                Object.assign(schedule, updates);
                schedule.updatedAt = new Date().toISOString();
              }
            });
          },

          deleteSchedule: (scheduleId, scheduleType) => {
            set((state) => {
              const targetArray =
                scheduleType === "period"
                  ? state.schedulePeriods
                  : state.weeklySchedules;

              const scheduleToDelete = targetArray.find(
                (s) => s.id === scheduleId,
              );

              if (!scheduleToDelete) {
                console.error("Schedule to delete not found");
                return;
              }

              // Case 1 & 2: If we are deleting a draft or a draft-edit, just remove it.
              if (
                scheduleToDelete.status === "draft" ||
                scheduleToDelete.status === "draft-edit"
              ) {
                if (scheduleType === "period") {
                  state.schedulePeriods = state.schedulePeriods.filter(
                    (p) => p.id !== scheduleId,
                  );
                } else {
                  state.weeklySchedules = state.weeklySchedules.filter(
                    (w) => w.id !== scheduleId,
                  );
                }
                return;
              }

              // Case 3 & 4: If we are deleting an original schedule (active/completed)
              // First, find and delete its draft, if it exists.
              const draftToDelete = targetArray.find(
                (s) => s.originalScheduleId === scheduleId,
              );
              if (draftToDelete) {
                if (scheduleType === "period") {
                  state.schedulePeriods = state.schedulePeriods.filter(
                    (p) => p.id !== draftToDelete.id,
                  );
                } else {
                  state.weeklySchedules = state.weeklySchedules.filter(
                    (w) => w.id !== draftToDelete.id,
                  );
                }
              }

              // Finally, delete the original schedule itself.
              if (scheduleType === "period") {
                state.schedulePeriods = state.schedulePeriods.filter(
                  (p) => p.id !== scheduleId,
                );
              } else {
                state.weeklySchedules = state.weeklySchedules.filter(
                  (w) => w.id !== scheduleId,
                );
              }
            });
          },

          checkDateConflicts: (startDate, endDate, excludePeriodId) => {
            const periods = get().schedulePeriods.filter(
              (p) => p.id !== excludePeriodId,
            );
            const conflictingPeriods = periods.filter((period) => {
              return areIntervalsOverlapping(
                { start: new Date(startDate), end: new Date(endDate) },
                {
                  start: new Date(period.startDate),
                  end: new Date(period.endDate),
                },
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
            const employees = useEmployeeStore.getState()?.employees || [];

            const conflicts: { employeeName: string; date: string }[] = [];

            const targetSchedule = allSchedules.find(
              (s) => s.id === scheduleId,
            );

            if (!targetSchedule) {
              console.warn(`Target schedule ${scheduleId} not found.`);
              return [];
            }

            const otherShifts: Shift[] = allSchedules
              .filter(
                (s) =>
                  s.id !== scheduleId &&
                  s.id !== targetSchedule.originalScheduleId,
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
                    (emp) => emp.id === targetShift.employeeId,
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
              new Set(conflicts.map((c) => `${c.employeeName}-${c.date}`)),
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
                .filter(
                  (p) => p.status === "draft-edit" && p.originalScheduleId,
                )
                .map((p) => p.originalScheduleId),
            );
            return schedulePeriods.filter((p) => !draftedIds.has(p.id));
          },

          getDashboardWeeklySchedules: () => {
            const { weeklySchedules } = get();
            const draftedIds = new Set(
              weeklySchedules
                .filter(
                  (w) => w.status === "draft-edit" && w.originalScheduleId,
                )
                .map((w) => w.originalScheduleId),
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
                    (s) => s.id === schedule.originalScheduleId,
                  );
                  if (originalIndex !== -1) {
                    const updatedOriginal = {
                      ...JSON.parse(JSON.stringify(schedule)),
                      id: schedule.originalScheduleId,
                      status: "active",
                      originalScheduleId: undefined,
                    };
                    updatedOriginal.shifts.forEach((shift: Shift) => {
                      // Only mark as confirmed if it's not an open shift
                      if (shift.status !== "open") {
                        shift.status = "confirmed";
                      }
                      shift.periodId = updatedOriginal.id;
                    });
                    (targetArray as any)[originalIndex] = updatedOriginal;
                    if (scheduleType === "period") {
                      state.schedulePeriods = state.schedulePeriods.filter(
                        (p) => p.id !== scheduleId,
                      );
                    } else {
                      state.weeklySchedules = state.weeklySchedules.filter(
                        (w) => w.id !== scheduleId,
                      );
                    }
                  }
                } else {
                  schedule.status = "active";
                  schedule.updatedAt = new Date().toISOString();
                  schedule.shifts.forEach((shift) => {
                    // Only mark as confirmed if it's not an open shift
                    if (shift.status !== "open") {
                      shift.status = "confirmed";
                    }
                  });
                }

                // Send notifications to all employees with shifts in the published schedule
                const employeeIdsToNotify = new Set<string>();
                schedule.shifts.forEach((shift) => {
                  if (shift.employeeId) {
                    employeeIdsToNotify.add(shift.employeeId);
                  }
                });

                employeeIdsToNotify.forEach((employeeId) => {
                  const isUpdate = !!schedule.originalScheduleId;
                  const message = isUpdate
                    ? `The schedule for ${schedule.name} (${format(new Date(schedule.startDate), "MMM d")} - ${format(new Date(schedule.endDate), "MMM d")}) has been updated.`
                    : `A new schedule for ${schedule.name} (${format(new Date(schedule.startDate), "MMM d")} - ${format(new Date(schedule.endDate), "MMM d")}) has been published.`;

                  useNotificationStore.getState().addNotification({
                    employeeId: employeeId,
                    type: "schedule_published",
                    message: message,
                    payload: {
                      scheduleId: schedule.originalScheduleId
                        ? schedule.originalScheduleId
                        : schedule.id,
                      scheduleType: scheduleType,
                    },
                  });
                });
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
              (s) => s.originalScheduleId === originalScheduleId,
            );
            if (existingDraft) {
              return existingDraft.id;
            }
            console.log("originalScheduleId", originalScheduleId);
            console.log("targetArray", targetArray);
            console.log("scheduleType", scheduleType);

            const originalSchedule = targetArray.find(
              (s) => s.id === originalScheduleId,
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

            if (!originalSchedule || !draftSchedule) {
              return { added: 0, updated: 0, removed: 0 };
            }

            const originalShiftIds = new Set(
              originalSchedule.shifts.map((s) => s.id),
            );
            const draftShiftIds = new Set(
              draftSchedule.shifts.map((s) => s.id),
            );

            const added = draftSchedule.shifts.filter(
              (s) => !originalShiftIds.has(s.id),
            ).length;
            const removed = originalSchedule.shifts.filter(
              (s) => !draftShiftIds.has(s.id),
            ).length;
            let updated = 0;

            draftSchedule.shifts.forEach((draftShift) => {
              if (originalShiftIds.has(draftShift.id)) {
                const originalShift = originalSchedule.shifts.find(
                  (s) => s.id === draftShift.id,
                );

                // Create copies and remove the property that is expected to be different
                const tempOriginal = { ...originalShift };
                const tempDraft = { ...draftShift };
                // @ts-ignore - periodId is expected to be different, so ignore for comparison
                delete tempOriginal.periodId;
                // @ts-ignore
                delete tempDraft.periodId;

                // Now compare the modified copies
                if (
                  JSON.stringify(tempOriginal) !== JSON.stringify(tempDraft)
                ) {
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
              (s) => s.employeeId === requesterId,
            );
            const peerShifts = allShifts.filter(
              (s) => s.employeeId === peerId && s.status === "confirmed",
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
                  },
                ),
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
              (emp) => emp.id !== shiftToOffer.employeeId,
            );

            const compatiblePeers = peers.filter((peer) => {
              const peerShifts = allShifts.filter(
                (s) => s.employeeId === peer.id,
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
                  },
                ),
              );
            });

            return compatiblePeers.map((peer) => ({
              employee: peer,
              swappableShiftsCount: get().getSwappableShiftsForPeer(
                peer.id,
                shiftToOffer.employeeId as string,
              ).length,
            }));
          },

          discardDraft: (draftId, scheduleType) => {
            set((state) => {
              if (scheduleType === "period") {
                state.schedulePeriods = state.schedulePeriods.filter(
                  (p) => p.id !== draftId,
                );
              } else {
                state.weeklySchedules = state.weeklySchedules.filter(
                  (w) => w.id !== draftId,
                );
              }
            });
          },

          applyTemplate: (scheduleId, scheduleType, template, mode) => {
            set((state) => {
              const targetArray =
                scheduleType === "period"
                  ? state.schedulePeriods
                  : state.weeklySchedules;
              const schedule = targetArray.find((s) => s.id === scheduleId);

              if (!schedule) {
                console.error("Schedule not found");
                return;
              }

              const scheduleStartDate = startOfDay(
                parseISO(schedule.startDate),
              );
              const scheduleEndDate = startOfDay(parseISO(schedule.endDate));

              const templateShiftsToApply: Omit<Shift, "id">[] = [];
              let currentDate = scheduleStartDate;
              while (currentDate <= scheduleEndDate) {
                const dayOfWeek = getDay(currentDate);

                template.shifts.forEach((templateShift) => {
                  if (templateShift.dayOfWeek === dayOfWeek) {
                    const shiftDateISO = format(currentDate, "yyyy-MM-dd");
                    const newShift: Omit<Shift, "id"> = {
                      employeeId: templateShift.employeeId,
                      role: templateShift.role,
                      date: shiftDateISO,
                      startTime: `${shiftDateISO}T${
                        templateShift.startTime.split("T")[1]
                      }`,
                      endTime: `${shiftDateISO}T${
                        templateShift.endTime.split("T")[1]
                      }`,
                      status: "confirmed",
                      periodId: schedule.id,
                    };
                    templateShiftsToApply.push(newShift);
                  }
                });
                currentDate = addDays(currentDate, 1);
              }

              switch (mode) {
                case "replace-all":
                  schedule.shifts = []; // Clear all existing shifts
                  templateShiftsToApply.forEach((newShift) => {
                    schedule.shifts.push({ ...newShift, id: generateId() });
                  });
                  break;

                case "fill-gaps":
                  templateShiftsToApply.forEach((newShift) => {
                    const hasConflict = schedule.shifts.some(
                      (existingShift) =>
                        existingShift.employeeId === newShift.employeeId &&
                        areIntervalsOverlapping(
                          {
                            start: new Date(newShift.startTime),
                            end: new Date(newShift.endTime),
                          },
                          {
                            start: new Date(existingShift.startTime),
                            end: new Date(existingShift.endTime),
                          },
                        ),
                    );
                    if (!hasConflict) {
                      schedule.shifts.push({ ...newShift, id: generateId() });
                    }
                  });
                  break;

                case "merge":
                  const shiftsToDelete = new Set<string>();
                  templateShiftsToApply.forEach((newShift) => {
                    schedule.shifts.forEach((existingShift) => {
                      if (
                        existingShift.employeeId === newShift.employeeId &&
                        areIntervalsOverlapping(
                          {
                            start: new Date(newShift.startTime),
                            end: new Date(newShift.endTime),
                          },
                          {
                            start: new Date(existingShift.startTime),
                            end: new Date(existingShift.endTime),
                          },
                        )
                      ) {
                        shiftsToDelete.add(existingShift.id);
                      }
                    });
                  });

                  schedule.shifts = schedule.shifts.filter(
                    (s) => !shiftsToDelete.has(s.id),
                  );

                  templateShiftsToApply.forEach((newShift) => {
                    schedule.shifts.push({ ...newShift, id: generateId() });
                  });
                  break;
              }
              schedule.updatedAt = new Date().toISOString();
            });
          },

          getAdvancedConflicts: (startDate, endDate) => {
            const { scheduling } = useStoreSettingsStore.getState();
            const { conflictTypes } = scheduling;
            const state = get();
            const allShifts = [
              ...state.schedulePeriods.flatMap((p) => p.shifts),
              ...state.weeklySchedules.flatMap((w) => w.shifts),
            ];

            const conflicts: {
              type: "overtime" | "minStaffing" | "backToBack" | "doubleBooked";
              details: string;
              shiftIds?: string[];
              date?: string;
            }[] = [];

            // Filter shifts within range
            const rangeStart = new Date(startDate);
            const rangeEnd = new Date(endDate);
            const relevantShifts = allShifts.filter((s) => {
              const sDate = new Date(s.date);
              return sDate >= rangeStart && sDate <= rangeEnd;
            });

            // Group by employee
            const shiftsByEmployee: Record<string, Shift[]> = {};
            relevantShifts.forEach((s) => {
              if (s.employeeId) {
                if (!shiftsByEmployee[s.employeeId])
                  shiftsByEmployee[s.employeeId] = [];
                shiftsByEmployee[s.employeeId].push(s);
              }
            });

            // 1. Double Booked & 2. Back to Back (Clopening) & 3. Overtime
            Object.entries(shiftsByEmployee).forEach(([empId, shifts]) => {
              // Sort by start time
              shifts.sort(
                (a, b) =>
                  new Date(a.startTime).getTime() -
                  new Date(b.startTime).getTime(),
              );

              let totalHours = 0;

              for (let i = 0; i < shifts.length; i++) {
                const current = shifts[i];
                const start = new Date(current.startTime);
                const end = new Date(current.endTime);
                const durationHours =
                  (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                totalHours += durationHours;

                if (i < shifts.length - 1) {
                  const next = shifts[i + 1];
                  const nextStart = new Date(next.startTime);

                  // Double Booked
                  if (
                    conflictTypes.doubleBooked &&
                    areIntervalsOverlapping(
                      { start, end },
                      { start: nextStart, end: new Date(next.endTime) },
                    )
                  ) {
                    conflicts.push({
                      type: "doubleBooked",
                      details: `Overlap between ${format(
                        start,
                        "HH:mm",
                      )} and ${format(nextStart, "HH:mm")}`,
                      shiftIds: [current.id, next.id],
                      date: current.date,
                    });
                  }

                  // Back to Back (Clopening) - say < 10 hours rest
                  if (conflictTypes.backToBack) {
                    const restHours =
                      (nextStart.getTime() - end.getTime()) / (1000 * 60 * 60);
                    if (restHours < 10 && restHours >= 0) {
                      // Positive but small rest
                      conflicts.push({
                        type: "backToBack",
                        details: `Only ${restHours.toFixed(
                          1,
                        )} hours rest between shifts`,
                        shiftIds: [current.id, next.id],
                        date: current.date,
                      });
                    }
                  }
                }
              }

              if (conflictTypes.overtime && totalHours > 40) {
                const employeeName =
                  useEmployeeStore
                    .getState()
                    .employees.find((e) => e.id === empId)?.fullName ||
                  "Unknown";
                conflicts.push({
                  type: "overtime",
                  details: `${employeeName} scheduled for ${totalHours.toFixed(
                    1,
                  )} hours (exceeds 40)`,
                  date: startDate, // Just mark the period start or the first shift's date
                });
              }
            });

            return conflicts;
          },
        };
      }),
      {
        name: "schedule-storage",
        storage: createLazyPersistStorage(),
        version: 1,
        migrate: (persistedState) => persistedState as any,
        partialize: (state) => ({
          schedulePeriods: state.schedulePeriods,
          weeklySchedules: state.weeklySchedules,
          dropRequests: state.dropRequests,
          swapRequests: state.swapRequests,
          ptoRequests: state.ptoRequests,
        }),
        // Prune on boot so an already-accumulated persisted list gets trimmed
        // even without a new submission to trigger the in-action prune.
        onRehydrateStorage: () => (state) => {
          if (state?.ptoRequests) {
            state.ptoRequests = prunePtoRequests(state.ptoRequests);
          }
        },
      },
    ),
  ),
);
