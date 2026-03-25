/**
 * Unified Timeclock Store
 *
 * Single source of truth for all shift/timeclock state.
 * Merges the previous useTimeClock (persistent) and useTimeclockStore (in-memory)
 * into one store with selective MMKV persistence.
 *
 * Persisted (via MMKV): device state (status, shiftId, staffId, breakStartTime) + offline queue
 * NOT persisted: sessions (hydrated from backend), shift history (fetched on demand), UI state
 */

import { mmkvStorage } from "@/lib/storage";
import { toastService } from "@/lib/toastService";
import { ShiftHistoryEntry, PTOAccrualEntry } from "@/lib/types";
import { TimeClockAction, TimeClockStatus } from "@/types/time-clock";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { useStoreSettingsStore } from "./useStoreSettingsStore";

// ============================================================================
// TYPES
// ============================================================================

export type SessionStatus = "clockedIn" | "onBreak";

export interface ShiftSession {
  employeeId: string;
  status: SessionStatus;
  clockInTime: Date;
  breakStartTime: Date | null;
  breakEndTime: Date | null;
}

/** Alias for backward compatibility (BreakEndedModal imports this) */
export type Shift = ShiftSession;

// ============================================================================
// STATE INTERFACE
// ============================================================================

interface TimeclockState {
  // === Per-employee active sessions (NOT persisted — hydrated from backend) ===
  activeEmployeeId: string | null;
  sessions: Record<string, ShiftSession>;

  // === Device state (persisted via MMKV) ===
  status: TimeClockStatus;
  currentShiftId: string | null;
  currentStaffId: string | null;
  employeeName: string | null;
  breakStartTime: string | null; // ISO timestamp

  // === Offline queue (persisted via MMKV) ===
  offlineQueue: TimeClockAction[];
  isSyncing: boolean;

  // === UI state (NOT persisted) ===
  isClockInWallOpen: boolean;

  // === Shift history (fetched from backend, NOT persisted) ===
  shiftHistory: ShiftHistoryEntry[];
  historyLoading: boolean;

  // === Session actions ===
  setActiveEmployee: (employeeId: string | null) => void;
  clockIn: (employeeId: string) => { ok: boolean; reason?: string };
  signIn: (employeeId: string) => { ok: boolean } | undefined;
  startBreak: () => void;
  endBreak: (employeeId: string) => void;
  clockOut: (employeeId: string) => void;
  forceClockOutAll: () => void;
  getSession: (employeeId: string) => ShiftSession | undefined;
  checkEmployeeInShift: (employeeId: string) => boolean;

  // === Device state actions (previously in useTimeClockStore) ===
  setStatus: (status: TimeClockStatus, shiftId?: string | null) => void;
  setEmployee: (employeeId: string | null, employeeName: string | null) => void;
  setBreakStartTime: (time: string | null) => void;
  clearState: () => void;

  // === Offline queue actions ===
  queueAction: (action: TimeClockAction) => void;
  removeFromQueue: (actionId: string) => void;
  setSyncing: (isSyncing: boolean) => void;

  // === UI actions ===
  showClockInWall: () => void;
  hideClockInWall: () => void;

  // === History actions ===
  /**
   * Hydrate active shifts from staff_shifts table.
   * Creates local sessions for any staff with active (non-completed) shifts.
   */
  hydrateActiveShifts: (
    supabase: any,
    locationId: string
  ) => Promise<void>;

  /**
   * Fetch shift history from staff_shifts table for display.
   */
  fetchShiftHistory: (
    supabase: any,
    locationId: string,
    dateRange?: { start: string; end: string }
  ) => Promise<void>;
}

// ============================================================================
// STORE
// ============================================================================

export const useTimeclockStore = create<TimeclockState>()(
  persist(
    immer((set, get) => ({
      // --- Initial state ---
      activeEmployeeId: null,
      sessions: {},

      status: "idle" as TimeClockStatus,
      currentShiftId: null,
      currentStaffId: null,
      employeeName: null,
      breakStartTime: null,

      offlineQueue: [] as TimeClockAction[],
      isSyncing: false,

      isClockInWallOpen: false,

      shiftHistory: [] as ShiftHistoryEntry[],
      historyLoading: false,

      // =====================================================================
      // SESSION ACTIONS (previously in old useTimeclockStore)
      // =====================================================================

      setActiveEmployee: (employeeId: string | null) => {
        set({ activeEmployeeId: employeeId });
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

        set((state) => {
          state.sessions[employeeId] = newSession;
          state.activeEmployeeId = employeeId;
        });

        return { ok: true };
      },

      signIn: (employeeId: string) => {
        const { sessions } = get();
        if (sessions[employeeId]) {
          return undefined;
        }

        const newSession: ShiftSession = {
          employeeId,
          status: "clockedIn",
          clockInTime: new Date(),
          breakStartTime: null,
          breakEndTime: null,
        };

        set((state) => {
          state.sessions[employeeId] = newSession;
          state.activeEmployeeId = employeeId;
        });

        return { ok: true };
      },

      startBreak: () => {
        const { activeEmployeeId, sessions } = get();
        const { isBreakAndSwitchEnabled } = useStoreSettingsStore.getState();

        if (!activeEmployeeId || !sessions[activeEmployeeId]) return;

        set((state) => {
          state.sessions[activeEmployeeId] = {
            ...state.sessions[activeEmployeeId],
            status: "onBreak",
            breakStartTime: new Date(),
            breakEndTime: null,
          };
          if (isBreakAndSwitchEnabled) {
            state.activeEmployeeId = null;
          }
        });
      },

      endBreak: (employeeId: string) => {
        const { sessions } = get();
        const session = sessions[employeeId];
        if (!session || session.status !== "onBreak") return;

        set((state) => {
          state.sessions[employeeId] = {
            ...state.sessions[employeeId],
            status: "clockedIn",
            breakEndTime: new Date(),
          };
          state.activeEmployeeId = employeeId;
        });

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

        const totalPaidDurationHours = totalDurationMs / (1000 * 60 * 60);

        // Lazy-load to avoid circular dependency
        const { useEmployeeStore } = require("./useEmployeeStore") as {
          useEmployeeStore: typeof import("./useEmployeeStore").useEmployeeStore;
        };

        const employee = useEmployeeStore
          .getState()
          .employees.find((e) => e.id === employeeId);

        const newHistoryEntry: ShiftHistoryEntry = {
          id: `shift_${Date.now()}`,
          employeeId,
          date: sessionToClose.clockInTime.toLocaleDateString(),
          role: employee?.role || "employee",
          clockIn: sessionToClose.clockInTime.toISOString(),
          breakInitiated: sessionToClose.breakStartTime
            ? sessionToClose.breakStartTime.toISOString()
            : "N/A",
          breakEnded: sessionToClose.breakEndTime
            ? sessionToClose.breakEndTime.toISOString()
            : "N/A",
          clockOut: clockOutTime.toISOString(),
          duration: `${totalPaidDurationHours.toFixed(2)}h`,
        };

        set((state) => {
          delete state.sessions[employeeId];
          state.shiftHistory = [newHistoryEntry, ...state.shiftHistory];
          if (state.activeEmployeeId === employeeId) {
            state.activeEmployeeId = null;
          }
        });

        // --- PTO Accrual Logic ---
        try {
          const { usePtoStore } = require("./usePtoStore") as {
            usePtoStore: typeof import("./usePtoStore").usePtoStore;
          };
          const ptoAccrualRate =
            useStoreSettingsStore.getState().ptoAccrualRate;
          const ptoEarned = totalPaidDurationHours * ptoAccrualRate;

          if (ptoEarned > 0) {
            const ptoEntry: PTOAccrualEntry = {
              date: newHistoryEntry.date,
              hoursWorked: totalPaidDurationHours,
              ptoEarned,
              accrualRateUsed: ptoAccrualRate,
              shiftId: newHistoryEntry.id,
              employeeId,
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

        // Cascade the clock-out action to the employee store (only shiftStatus update)
        const { useEmployeeStore: empStore } = require("./useEmployeeStore") as {
          useEmployeeStore: typeof import("./useEmployeeStore").useEmployeeStore;
        };
        empStore.getState().clockOut(employeeId);

        // If the person clocking out is the active user, also sign them out of the terminal
        if (activeEmployeeId === employeeId) {
          empStore.getState().signOut();
        }

        toastService.show({
          title: "Clocked Out",
          message: "You have been successfully clocked out.",
          type: "success",
        });
      },

      forceClockOutAll: () => {
        const { sessions, activeEmployeeId } = get();
        const allIds = Object.keys(sessions);
        if (allIds.length === 0) return;

        const clockOutTime = new Date();
        const newHistoryEntries: ShiftHistoryEntry[] = [];

        const { useEmployeeStore } = require("./useEmployeeStore") as {
          useEmployeeStore: typeof import("./useEmployeeStore").useEmployeeStore;
        };
        const { usePtoStore } = require("./usePtoStore") as {
          usePtoStore: typeof import("./usePtoStore").usePtoStore;
        };
        const ptoAccrualRate = useStoreSettingsStore.getState().ptoAccrualRate;

        for (const employeeId of allIds) {
          const session = sessions[employeeId];
          if (!session) continue;

          let totalDurationMs =
            clockOutTime.getTime() - session.clockInTime.getTime();
          if (session.breakStartTime && session.breakEndTime) {
            totalDurationMs -=
              session.breakEndTime.getTime() -
              session.breakStartTime.getTime();
          }
          const totalPaidDurationHours = Math.max(
            0,
            totalDurationMs / (1000 * 60 * 60)
          );

          const employee = useEmployeeStore
            .getState()
            .employees.find((e) => e.id === employeeId);

          const historyEntry: ShiftHistoryEntry = {
            id: `shift_${Date.now()}_${employeeId}`,
            employeeId,
            date: session.clockInTime.toLocaleDateString(),
            role: employee?.role || "employee",
            clockIn: session.clockInTime.toISOString(),
            breakInitiated: session.breakStartTime?.toISOString() ?? "N/A",
            breakEnded: session.breakEndTime?.toISOString() ?? "N/A",
            clockOut: clockOutTime.toISOString(),
            duration: `${totalPaidDurationHours.toFixed(2)}h`,
          };
          newHistoryEntries.push(historyEntry);

          try {
            const ptoEarned = totalPaidDurationHours * ptoAccrualRate;
            if (ptoEarned > 0) {
              const ptoEntry: PTOAccrualEntry = {
                date: historyEntry.date,
                hoursWorked: totalPaidDurationHours,
                ptoEarned,
                accrualRateUsed: ptoAccrualRate,
                shiftId: historyEntry.id,
                employeeId,
              };
              usePtoStore.getState().recordPtoAccrual(ptoEntry);
            }
          } catch {}

          useEmployeeStore.getState().clockOut(employeeId);
          if (activeEmployeeId === employeeId) {
            useEmployeeStore.getState().signOut();
          }
        }

        set((state) => {
          state.sessions = {};
          state.activeEmployeeId = null;
          state.shiftHistory = [
            ...newHistoryEntries,
            ...state.shiftHistory,
          ];
        });

        toastService.show({
          title: "All Shifts Ended",
          message: `${allIds.length} staff member${allIds.length > 1 ? "s" : ""} clocked out.`,
          type: "success",
        });
      },

      getSession: (employeeId: string) => {
        return get().sessions[employeeId];
      },

      checkEmployeeInShift: (employeeId: string) => {
        const { sessions } = get();
        return sessions[employeeId]?.status === "clockedIn";
      },

      // =====================================================================
      // DEVICE STATE ACTIONS (previously in useTimeClockStore)
      // =====================================================================

      setStatus: (status: TimeClockStatus, shiftId?: string | null) => {
        set((state) => {
          state.status = status;
          if (shiftId !== undefined) {
            state.currentShiftId = shiftId;
          }
        });
      },

      setEmployee: (
        employeeId: string | null,
        employeeName: string | null
      ) => {
        set({ currentStaffId: employeeId, employeeName });
      },

      setBreakStartTime: (time: string | null) => {
        set({ breakStartTime: time });
      },

      clearState: () => {
        set((state) => {
          state.status = "idle";
          state.currentShiftId = null;
          state.currentStaffId = null;
          state.employeeName = null;
          state.breakStartTime = null;
          // Also clear sessions and active employee (cache clear scenario)
          state.activeEmployeeId = null;
          state.sessions = {};
          state.isClockInWallOpen = false;
        });
      },

      // =====================================================================
      // OFFLINE QUEUE ACTIONS
      // =====================================================================

      queueAction: (action: TimeClockAction) => {
        set((state) => {
          state.offlineQueue.push(action);
        });
      },

      removeFromQueue: (actionId: string) => {
        set((state) => {
          state.offlineQueue = state.offlineQueue.filter(
            (a) => a.id !== actionId
          );
        });
      },

      setSyncing: (isSyncing: boolean) => {
        set({ isSyncing });
      },

      // =====================================================================
      // UI ACTIONS
      // =====================================================================

      showClockInWall: () => set({ isClockInWallOpen: true }),
      hideClockInWall: () => set({ isClockInWallOpen: false }),

      // =====================================================================
      // HISTORY ACTIONS (replaces initializeHistory / mock data)
      // =====================================================================

      hydrateActiveShifts: async (supabase: any, locationId: string) => {
        try {
          const { data, error } = await supabase
            .from("staff_shifts")
            .select("id, staff_profile_id, status, clock_in_time, break_logs")
            .eq("location_id", locationId)
            .in("status", ["active", "on_break"]);

          if (error) {
            console.error("[Timeclock] Failed to hydrate active shifts:", error);
            return;
          }

          if (!data || data.length === 0) {
            console.log("[Timeclock] No active shifts to hydrate");
            return;
          }

          // Map staff_profile_id to location_member id via employee store
          const { useEmployeeStore } = require("./useEmployeeStore") as {
            useEmployeeStore: typeof import("./useEmployeeStore").useEmployeeStore;
          };
          const employees = useEmployeeStore.getState().employees;

          const newSessions: Record<string, ShiftSession> = {};
          for (const shift of data) {
            const employee = employees.find(
              (e) => e.profileId === shift.staff_profile_id
            );
            if (!employee) continue;

            // Parse break logs to get current break state
            let breakStart: Date | null = null;
            let breakEnd: Date | null = null;
            if (shift.break_logs && Array.isArray(shift.break_logs)) {
              const lastBreak =
                shift.break_logs[shift.break_logs.length - 1] as any;
              if (lastBreak) {
                breakStart = lastBreak.start
                  ? new Date(lastBreak.start)
                  : null;
                breakEnd = lastBreak.end ? new Date(lastBreak.end) : null;
              }
            }

            newSessions[employee.id] = {
              employeeId: employee.id,
              status: shift.status === "on_break" ? "onBreak" : "clockedIn",
              clockInTime: new Date(shift.clock_in_time),
              breakStartTime: breakStart,
              breakEndTime: breakEnd,
            };
          }

          set((state) => {
            // Merge with existing sessions (don't overwrite if already there)
            for (const [id, session] of Object.entries(newSessions)) {
              if (!state.sessions[id]) {
                state.sessions[id] = session;
              }
            }
          });

          console.log(
            `[Timeclock] Hydrated ${Object.keys(newSessions).length} active shifts`
          );
        } catch (error) {
          console.error("[Timeclock] hydrateActiveShifts error:", error);
        }
      },

      fetchShiftHistory: async (
        supabase: any,
        locationId: string,
        dateRange?: { start: string; end: string }
      ) => {
        set({ historyLoading: true });

        try {
          let query = supabase
            .from("staff_shifts")
            .select(
              "id, staff_profile_id, status, clock_in_time, clock_out_time, break_logs, hourly_rate_snapshot"
            )
            .eq("location_id", locationId)
            .order("clock_in_time", { ascending: false })
            .limit(200);

          if (dateRange) {
            query = query
              .gte("clock_in_time", dateRange.start)
              .lte("clock_in_time", dateRange.end);
          } else {
            // Default: last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            query = query.gte(
              "clock_in_time",
              thirtyDaysAgo.toISOString()
            );
          }

          const { data, error } = await query;

          if (error) {
            console.error("[Timeclock] Failed to fetch shift history:", error);
            set({ historyLoading: false });
            return;
          }

          // Map staff_profile_id to employee names
          const { useEmployeeStore } = require("./useEmployeeStore") as {
            useEmployeeStore: typeof import("./useEmployeeStore").useEmployeeStore;
          };
          const employees = useEmployeeStore.getState().employees;

          const history: ShiftHistoryEntry[] = (data || []).map(
            (shift: any) => {
              const employee = employees.find(
                (e) => e.profileId === shift.staff_profile_id
              );

              // Calculate duration
              const clockIn = new Date(shift.clock_in_time);
              const clockOut = shift.clock_out_time
                ? new Date(shift.clock_out_time)
                : new Date();
              let durationMs = clockOut.getTime() - clockIn.getTime();

              // Subtract break time
              if (shift.break_logs && Array.isArray(shift.break_logs)) {
                for (const brk of shift.break_logs as any[]) {
                  if (brk.start && brk.end) {
                    durationMs -=
                      new Date(brk.end).getTime() -
                      new Date(brk.start).getTime();
                  }
                }
              }

              const hours = durationMs / (1000 * 60 * 60);

              // Get break times from logs
              const breakLogs = (shift.break_logs as any[]) || [];
              const lastBreak = breakLogs[breakLogs.length - 1];

              return {
                id: shift.id,
                employeeId: employee?.id || shift.staff_profile_id,
                date: clockIn.toLocaleDateString(),
                role: employee?.role || "employee",
                clockIn: shift.clock_in_time,
                breakInitiated: lastBreak?.start || "N/A",
                breakEnded: lastBreak?.end || "N/A",
                clockOut: shift.clock_out_time || "N/A",
                duration: `${hours.toFixed(2)}h`,
              };
            }
          );

          set({ shiftHistory: history, historyLoading: false });
          console.log(
            `[Timeclock] Fetched ${history.length} shift history entries`
          );
        } catch (error) {
          console.error("[Timeclock] fetchShiftHistory error:", error);
          set({ historyLoading: false });
        }
      },
    })),
    {
      name: "dexa-pos-timeclock",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        // Only persist device state + offline queue
        status: state.status,
        currentShiftId: state.currentShiftId,
        currentStaffId: state.currentStaffId,
        employeeName: state.employeeName,
        breakStartTime: state.breakStartTime,
        offlineQueue: state.offlineQueue,
        isSyncing: state.isSyncing,
      }),
    }
  )
);
