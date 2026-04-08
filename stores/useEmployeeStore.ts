import { secureMMKVStorage } from "@/lib/storage";
import { MerchantRole } from "@/lib/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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

interface EmployeeState {
  employees: EmployeeProfile[];
  activeEmployeeId: string | null;
  loggedInEmployee: EmployeeProfile | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setEmployees: (employees: EmployeeProfile[]) => void;
  setSyncState: (state: { isLoading: boolean; error: string | null }) => void;
  updateSecurity: (
    employeeId: string,
    data: { email?: string; phone?: string }
  ) => void;
  clockIn: (employeeId: string) => void;
  clockOut: (employeeId: string) => void;
  signInWithPin: (
    pin: string,
    locationId: string,
    deviceId: string
  ) => Promise<{ ok: true } | { ok: false; reason: "invalid_pin" }>;
  signOut: () => void;

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

      getEmployeeById: (id) => get().employees.find((e) => e.id === id),

      findEmployeeByPin: (pin: string) => {
        const { employees } = get();
        return employees.find((emp) => emp.pin === pin) ?? null;
      },

      setActiveSession: (employee: EmployeeProfile) => {
        const { useTimeclockStore } = require("./useTimeclockStore") as { useTimeclockStore: typeof import("./useTimeclockStore").useTimeclockStore };
        const { setActiveEmployee } = useTimeclockStore.getState();
        set({
          activeEmployeeId: employee.id,
          loggedInEmployee: employee,
        });
        setActiveEmployee(employee.id);
      },

      getEmployeeByStaffId: (staffId: string) => {
        console.log("getEmployeeByStaffId", staffId);
        // console.log("employees", get().employees);

        console.log("staffId", get().employees.find((e) => e.profileId === staffId));
        return get().employees.find((e) => e.profileId === staffId);
      },

      setEmployees: (employees) => set({ employees }),

      setSyncState: ({ isLoading, error }) => set({ isLoading, error }),

      updateSecurity: (employeeId, data) => {
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === employeeId ? { ...e, ...data } : e
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
              : e
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
              : e
          ),
        }));
        // NOTE: No longer cascading to timeclock store here.
        // The timeclock store clockOut calls employeeStore.clockOut, not the other way around.
      },

      /**
       * Sign in with PIN using local plain-text comparison (offline fallback).
       * For online verification, use the useTimeClock hook in components.
       */
      signInWithPin: async (pin: string, _locationId: string, _deviceId: string) => {
        const { employees } = get();

        // Find employee by plain PIN
        const foundEmployee = employees.find((emp) => emp.pin === pin) ?? null;

        if (!foundEmployee) {
          return { ok: false as const, reason: "invalid_pin" as const };
        }

        // Set as active employee
        const { useTimeclockStore } = require("./useTimeclockStore") as { useTimeclockStore: typeof import("./useTimeclockStore").useTimeclockStore };
        const { setActiveEmployee, getSession, clockIn: timeclockClockIn } = useTimeclockStore.getState();

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
        const { useTimeclockStore } = require("./useTimeclockStore") as { useTimeclockStore: typeof import("./useTimeclockStore").useTimeclockStore };
        useTimeclockStore.getState().setActiveEmployee(null);
      },
    }),
    {
      name: "dexa-employee-storage",
      storage: createJSONStorage(() => secureMMKVStorage),
      partialize: (state) => ({
        employees: state.employees,
        // Do NOT persist loggedInEmployee - require fresh login on app restart
      }),
    }
  )
);
