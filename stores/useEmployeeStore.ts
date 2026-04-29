import { secureMMKVStorage } from "@/lib/storage";
import { MerchantRole } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Sentinel value stored in pendingAuthError to signal STATION_IN_USE (not a user-visible message). */
export const STATION_IN_USE_AUTH_ERROR = "STATION_IN_USE" as const;

export interface EmployeeProfile {
  id: string; // location_members.id
  profileId: string; // staff_profiles.id
  fullName: string;
  displayName: string;
  role: MerchantRole;
  profilePictureUrl?: string;
  pin: string | null; // plain-text PIN for instant local matching
  email?: string;
  phone?: string;
  shiftStatus: "clocked_in" | "clocked_out";
  // Fields for future backend support:
  dob?: string;
  gender?: string;
  country?: string;
  address?: string;
  clockInAt?: string | null;
  baseWage?: number;
}

export interface PendingStationLogin {
  id: string;
  pin: string;
  locationId: string;
  stationId: string;
  deviceId: string;
  timestamp: string;
  retryCount: number;
}

interface EmployeeState {
  employees: EmployeeProfile[];
  activeEmployeeId: string | null;
  loggedInEmployee: EmployeeProfile | null;
  isLoading: boolean;
  error: string | null;

  // In-flight sign-in tracking (in-memory only, NOT persisted)
  pendingSignInEmployeeId: string | null;
  /** True when beginOptimisticSignIn started a new clock-in (so rollback should undo it). */
  pendingSignInStartedClockIn: boolean;
  pendingAuthError: string | null;

  // Offline queue for station logins (persisted)
  pendingStationLogins: PendingStationLogin[];
  isStationLoginSyncing: boolean;

  // Ready flag: true when employees[] is populated from MMKV or fresh sync
  isEmployeesReady: boolean;

  // Actions
  setEmployees: (employees: EmployeeProfile[]) => void;
  setSyncState: (state: { isLoading: boolean; error: string | null }) => void;
  updateSecurity: (
    employeeId: string,
    data: { email?: string; phone?: string },
  ) => void;
  clockIn: (employeeId: string) => void;
  clockOut: (employeeId: string) => void;
  signInWithPin: (
    pin: string,
    locationId: string,
    deviceId: string,
  ) => Promise<{ ok: true } | { ok: false; reason: "invalid_pin" }>;
  signOut: () => void;

  // Optimistic sign-in flow
  beginOptimisticSignIn: (
    employee: EmployeeProfile,
    hasExistingSession: boolean,
  ) => void;
  commitSignIn: (sessionId?: string) => void;
  rollbackSignIn: () => void;
  setPendingAuthError: (error: string | null) => void;

  // Station login queue
  queueStationLogin: (params: {
    pin: string;
    locationId: string;
    stationId: string;
    deviceId: string;
  }) => void;
  removeStationLoginFromQueue: (id: string) => void;
  setStationLoginSyncing: (syncing: boolean) => void;

  // Helpers
  getEmployeeById: (id: string) => EmployeeProfile | undefined;
  getEmployeeByStaffId: (staffId: string) => EmployeeProfile | undefined;
  findEmployeeByPin: (pin: string) => EmployeeProfile | null;
  setActiveSession: (employee: EmployeeProfile) => void;
}

export const useEmployeeStore = create<EmployeeState>()(
  persist(
    (set, get) => ({
      employees: [],
      activeEmployeeId: null,
      loggedInEmployee: null,
      isLoading: false,
      error: null,
      pendingSignInEmployeeId: null,
      pendingSignInStartedClockIn: false,
      pendingAuthError: null,
      pendingStationLogins: [],
      isStationLoginSyncing: false,
      isEmployeesReady: false,

      getEmployeeById: (id) => get().employees.find((e) => e.id === id),

      findEmployeeByPin: (pin: string) => {
        const { employees } = get();
        return employees.find((emp) => emp.pin === pin) ?? null;
      },

      setActiveSession: (employee: EmployeeProfile) => {
        const { useTimeclockStore } = require("./useTimeclockStore") as {
          useTimeclockStore: typeof import("./useTimeclockStore").useTimeclockStore;
        };
        const { setActiveEmployee } = useTimeclockStore.getState();
        set({
          activeEmployeeId: employee.id,
          loggedInEmployee: employee,
        });
        setActiveEmployee(employee.id);
      },

      getEmployeeByStaffId: (staffId: string) => {
        const { employees } = get();
        return employees.find((e) => e.profileId === staffId);
      },

      setEmployees: (employees) =>
        set({ employees, isEmployeesReady: employees.length > 0 }),

      setSyncState: ({ isLoading, error }) => set({ isLoading, error }),

      updateSecurity: (employeeId, data) => {
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === employeeId ? { ...e, ...data } : e,
          ),
        }));
      },

      clockIn: (employeeId) => {
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === employeeId
              ? {
                  ...e,
                  shiftStatus: "clocked_in",
                  clockInAt: new Date().toISOString(),
                }
              : e,
          ),
        }));
        // NOTE: No longer cascading to timeclock store here.
        // The timeclock store clockIn is called directly by the caller (pin-login, etc.)
      },

      clockOut: (employeeId) => {
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === employeeId
              ? { ...e, shiftStatus: "clocked_out", clockInAt: null }
              : e,
          ),
        }));
        // NOTE: No longer cascading to timeclock store here.
        // The timeclock store clockOut calls employeeStore.clockOut, not the other way around.
      },

      /**
       * Sign in with PIN using local plain-text comparison (offline fallback).
       * For online verification, use the useTimeClock hook in components.
       */
      signInWithPin: async (
        pin: string,
        _locationId: string,
        _deviceId: string,
      ) => {
        const { employees } = get();

        // Find employee by plain PIN
        const foundEmployee = employees.find((emp) => emp.pin === pin) ?? null;

        if (!foundEmployee) {
          return { ok: false as const, reason: "invalid_pin" as const };
        }

        // Set as active employee
        const { useTimeclockStore } = require("./useTimeclockStore") as {
          useTimeclockStore: typeof import("./useTimeclockStore").useTimeclockStore;
        };
        const {
          setActiveEmployee,
          getSession,
          clockIn: timeclockClockIn,
        } = useTimeclockStore.getState();

        // Check if already in session
        const existingSession = getSession(foundEmployee.id);
        if (!existingSession) {
          // Start a new local session
          get().clockIn(foundEmployee.id);
          timeclockClockIn(foundEmployee.id);
        }

        set({
          activeEmployeeId: foundEmployee.id,
          loggedInEmployee: foundEmployee,
        });
        setActiveEmployee(foundEmployee.id);

        return { ok: true as const };
      },

      signOut: () => {
        set({ activeEmployeeId: null, loggedInEmployee: null });
        const { useTimeclockStore } = require("./useTimeclockStore") as {
          useTimeclockStore: typeof import("./useTimeclockStore").useTimeclockStore;
        };
        const tcStore = useTimeclockStore.getState();
        tcStore.setActiveEmployee(null);
        // Clear persisted break time to prevent stale data on next sign-in
        tcStore.setBreakStartTime(null);
      },

      // ── Optimistic sign-in flow ───────────────────────────────────────────────

      beginOptimisticSignIn: (employee, hasExistingSession) => {
        // Guard: if another sign-in is already in-flight, roll it back first
        const current = get();
        if (current.pendingSignInEmployeeId) {
          current.rollbackSignIn();
        }
        const startedClockIn = !hasExistingSession;
        set({
          pendingSignInEmployeeId: employee.id,
          pendingSignInStartedClockIn: startedClockIn,
        });
        get().setActiveSession(employee);
        if (startedClockIn) {
          get().clockIn(employee.id);
          const { useTimeclockStore } = require("./useTimeclockStore") as {
            useTimeclockStore: typeof import("./useTimeclockStore").useTimeclockStore;
          };
          useTimeclockStore.getState().clockIn(employee.id);
        }
      },

      commitSignIn: (sessionId) => {
        set({
          pendingSignInEmployeeId: null,
          pendingSignInStartedClockIn: false,
        });
        if (sessionId) {
          const { useStoreSettingsStore } =
            require("./useStoreSettingsStore") as {
              useStoreSettingsStore: typeof import("./useStoreSettingsStore").useStoreSettingsStore;
            };
          useStoreSettingsStore.getState().setStationSessionId(sessionId);
        }
      },

      rollbackSignIn: () => {
        const { pendingSignInEmployeeId, pendingSignInStartedClockIn } = get();
        if (!pendingSignInEmployeeId) return;
        get().signOut();
        get().clockOut(pendingSignInEmployeeId);
        // Only undo the timeclock session if WE started it (avoid false PTO accrual
        // if the employee was already clocked in before the optimistic sign-in)
        if (pendingSignInStartedClockIn) {
          const { useTimeclockStore } = require("./useTimeclockStore") as {
            useTimeclockStore: typeof import("./useTimeclockStore").useTimeclockStore;
          };
          useTimeclockStore.getState().clockOut(pendingSignInEmployeeId);
        }
        set({
          pendingSignInEmployeeId: null,
          pendingSignInStartedClockIn: false,
        });
      },

      setPendingAuthError: (error) => set({ pendingAuthError: error }),

      // ── Station login queue ───────────────────────────────────────────────────

      queueStationLogin: (params) => {
        set((state) => ({
          pendingStationLogins: [
            ...state.pendingStationLogins,
            {
              id: uuidv4(),
              pin: params.pin,
              locationId: params.locationId,
              stationId: params.stationId,
              deviceId: params.deviceId,
              timestamp: new Date().toISOString(),
              retryCount: 0,
            },
          ],
        }));
      },

      removeStationLoginFromQueue: (id) => {
        set((state) => ({
          pendingStationLogins: state.pendingStationLogins.filter(
            (l) => l.id !== id,
          ),
        }));
      },

      setStationLoginSyncing: (syncing) =>
        set({ isStationLoginSyncing: syncing }),
    }),
    {
      name: "dexa-employee-storage",
      storage: createJSONStorage(() => secureMMKVStorage),
      version: 1,
      migrate: (persistedState) => persistedState as any,
      partialize: (state) => ({
        employees: state.employees,
        pendingStationLogins: state.pendingStationLogins,
        // Do NOT persist loggedInEmployee - require fresh login on app restart
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.employees.length > 0) {
          state.isEmployeesReady = true;
        }
      },
    },
  ),
);
