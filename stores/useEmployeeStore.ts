import { secureMMKVStorage } from "@/lib/storage";
import { MerchantRole } from "@/lib/types";
import bcrypt from "bcryptjs";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useTimeclockStore } from "./useTimeclockStore";
export interface EmployeeProfile {
  id: string; // location_members.id
  profileId: string; // staff_profiles.id
  fullName: string;
  displayName: string;
  role: MerchantRole;
  profilePictureUrl?: string;
  pinHash: string | null; // bcrypt hash (NOT plain PIN)
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
  findEmployeeByPin: (pin: string) => Promise<EmployeeProfile | null>;
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

      findEmployeeByPin: async (pin: string) => {
        // Local bcrypt comparison for offline support
        // Online verification is handled in components using useTimeClock hook
        const { employees } = get();
        for (const emp of employees) {
          if (!emp.pinHash) continue;
          const isMatch = await bcrypt.compare(pin, emp.pinHash);
          if (isMatch) {
            return emp;
          }
        }
        return null;
      },

      setActiveSession: (employee: EmployeeProfile) => {
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
        // Also update timeclock store status
        useTimeclockStore.getState().clockIn(employeeId);
      },

      clockOut: (employeeId) => {
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === employeeId
              ? { ...e, shiftStatus: "clocked_out", clockInAt: null }
              : e
          ),
        }));
        // Also update timeclock store status
        useTimeclockStore.getState().clockOut(employeeId);
      },

      /**
       * Sign in with PIN using local bcrypt comparison (offline fallback).
       * For online verification, use the useTimeClock hook in components.
       */
      signInWithPin: async (pin: string, _locationId: string, _deviceId: string) => {
        const { employees } = get();

        // Find employee by PIN hash
        let foundEmployee: EmployeeProfile | null = null;
        for (const emp of employees) {
          if (!emp.pinHash) continue;
          const isMatch = await bcrypt.compare(pin, emp.pinHash);
          if (isMatch) {
            foundEmployee = emp;
            break;
          }
        }

        if (!foundEmployee) {
          return { ok: false as const, reason: "invalid_pin" as const };
        }

        // Set as active employee
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
