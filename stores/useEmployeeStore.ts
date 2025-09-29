import { create } from 'zustand';

export interface EmployeeProfile {
    id: string;
    fullName: string;
    profilePictureUrl?: string;
    pin: string; // 4-digit for demo
    shiftStatus: 'clocked_in' | 'clocked_out';
    dob?: string;
    gender?: string;
    country?: string;
    address?: string;
    clockInAt?: string | null; // ISO string while clocked in
}

interface EmployeeState {
    employees: EmployeeProfile[];
    activeEmployeeId: string | null; // signed-in employee for terminal session
    isLoading: boolean;
    error: string | null;

    // actions
    loadMockEmployees: (count?: number) => Promise<void>;
    setEmployees: (employees: EmployeeProfile[]) => void;
    clockIn: (employeeId: string) => void;
    clockOut: (employeeId: string) => void;
    signIn: (employeeId: string, pin: string) => { ok: true } | { ok: false; reason: 'not_clocked_in' | 'invalid_pin' };
    signOut: () => void;
}



export const useEmployeeStore = create<EmployeeState>((set, get) => ({
    employees: [],
    activeEmployeeId: null,
    isLoading: false,
    error: null,

    setEmployees: (employees) => set({ employees }),

    loadMockEmployees: async (count: number = 8) => {
        const state = get();
        if (state.employees.length > 0) return; // already loaded
        set({ isLoading: true, error: null });

        try {
            const resp = await fetch(`https://randomuser.me/api/?results=${count}&nat=us,ca,gb,au`);
            const data = await resp.json();
            const mapped: EmployeeProfile[] = (data.results || []).map((u: any, idx: number) => ({
                id: `emp_${Date.now()}_${idx}`,
                fullName: `${u.name?.first ?? 'User'} ${u.name?.last ?? idx}`,
                profilePictureUrl: u.picture?.large,
                pin: '1234',
                shiftStatus: 'clocked_out',
                dob: u.dob?.date ? new Date(u.dob.date).toLocaleDateString() : undefined,
                gender: u.gender,
                country: u.location?.country,
                address: u.location ? `${u.location.street?.number ?? ''} ${u.location.street?.name ?? ''}, ${u.location.city ?? ''}`.trim() : undefined,
            }));
            set({ employees: mapped, isLoading: false });
        } catch (e: any) {
            set({ isLoading: false, error: e?.message || 'Failed to load employees' });
        }
    },

    clockIn: (employeeId) => {
        set((state) => ({
            employees: state.employees.map((e) => e.id === employeeId ? { ...e, shiftStatus: 'clocked_in', clockInAt: new Date().toISOString() } : e)
        }));
    },

    clockOut: (employeeId) => {
        const { activeEmployeeId } = get();
        set((state) => ({
            employees: state.employees.map((e) => e.id === employeeId ? { ...e, shiftStatus: 'clocked_out', clockInAt: null } : e),
            activeEmployeeId: activeEmployeeId === employeeId ? null : activeEmployeeId,
        }));
    },

    signIn: (employeeId, pin) => {
        const employee = get().employees.find((e) => e.id === employeeId);
        if (!employee || employee.shiftStatus !== 'clocked_in') {
            return { ok: false as const, reason: 'not_clocked_in' as const };
        }
        if (employee.pin !== pin) {
            return { ok: false as const, reason: 'invalid_pin' as const };
        }
        set({ activeEmployeeId: employeeId });
        return { ok: true as const };
    },

    signOut: () => set({ activeEmployeeId: null }),
}));


