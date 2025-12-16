import { MerchantRole } from "@/lib/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
    pin: string
  ) => Promise<{ ok: true } | { ok: false; reason: "invalid_pin" }>;
  signOut: () => void;

  // Helpers
  getEmployeeById: (id: string) => EmployeeProfile | undefined;
  findEmployeeByPin: (pin: string) => Promise<EmployeeProfile | null>;
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
       * Sign in with PIN using bcrypt comparison.
       * Iterates through all employees to find matching PIN hash.
       */
      signInWithPin: async (pin: string) => {
        const { employees, clockIn } = get();

        let foundEmployee: EmployeeProfile | null = null;

        for (const emp of employees) {
          if (!emp.pinHash) continue;

          // Compare input PIN with stored bcrypt hash
          const isMatch = await bcrypt.compare(pin, emp.pinHash);
          if (isMatch) {
            foundEmployee = emp;
            break;
          }
        }

        if (!foundEmployee) {
          return { ok: false as const, reason: "invalid_pin" as const };
        }

        // Check if already clocked in via Timeclock
        const {
          getSession,
          clockIn: timeclockClockIn,
          setActiveEmployee,
        } = useTimeclockStore.getState();
        const existingSession = getSession(foundEmployee.id);

        if (!existingSession) {
          // Fresh clock-in for the shift
          clockIn(foundEmployee.id);
          timeclockClockIn(foundEmployee.id);
        }

        // Set this employee as active
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
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        employees: state.employees,
        // Do NOT persist loggedInEmployee - require fresh login on app restart
      }),
    }
  )
);
