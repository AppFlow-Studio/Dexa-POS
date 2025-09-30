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

const MockEmployees = [{ "address": "1388 West Ave, Chelsea", "country": "Canada", "dob": "2/5/1967", "fullName": "Philippe Ennis", "gender": "male", "id": "emp_1759078476073_0", "pin": "1234", "profilePictureUrl": "https://randomuser.me/api/portraits/men/33.jpg", "shiftStatus": "clocked_out" }, { "address": "7860 Pecan Acres Ln, Hobart", "country": "Australia", "dob": "12/12/1969", "fullName": "Richard Holland", "gender": "male", "id": "emp_1759078476073_1", "pin": "1234", "profilePictureUrl": "https://randomuser.me/api/portraits/men/40.jpg", "shiftStatus": "clocked_out" }, { "address": "298 Grand Marais Ave, St. George", "country": "Canada", "dob": "10/22/1981", "fullName": "Zackary Young", "gender": "male", "id": "emp_1759078476073_2", "pin": "1234", "profilePictureUrl": "https://randomuser.me/api/portraits/men/28.jpg", "shiftStatus": "clocked_out" }, { "address": "6730 Avondale Ave, Tweed", "country": "Australia", "dob": "1/12/1949", "fullName": "Rafael Boyd", "gender": "male", "id": "emp_1759078476073_3", "pin": "1234", "profilePictureUrl": "https://randomuser.me/api/portraits/men/8.jpg", "shiftStatus": "clocked_out" }, { "address": "4625 20th Ave, Beaumont", "country": "Canada", "dob": "1/9/1955", "fullName": "Alice Gagné", "gender": "female", "id": "emp_1759078476073_4", "pin": "1234", "profilePictureUrl": "https://randomuser.me/api/portraits/women/48.jpg", "shiftStatus": "clocked_out" }, { "address": "4431 Regent Ave, Cochrane", "country": "Canada", "dob": "3/6/1976", "fullName": "Vincent Macdonald", "gender": "male", "id": "emp_1759078476073_5", "pin": "1234", "profilePictureUrl": "https://randomuser.me/api/portraits/men/1.jpg", "shiftStatus": "clocked_out" }, { "address": "4291 St. Catherine St, Bath", "country": "Canada", "dob": "12/22/1951", "fullName": "Hannah Mitchell", "gender": "female", "id": "emp_1759078476073_6", "pin": "1234", "profilePictureUrl": "https://randomuser.me/api/portraits/women/90.jpg", "shiftStatus": "clocked_out" }, { "address": "9794 Frederick Ave, Inverness", "country": "Canada", "dob": "4/13/1950", "fullName": "Alicia Côté", "gender": "female", "id": "emp_1759078476073_7", "pin": "1234", "profilePictureUrl": "https://randomuser.me/api/portraits/women/15.jpg", "shiftStatus": "clocked_out" }]


export const useEmployeeStore = create<EmployeeState>((set, get) => ({
    employees: MockEmployees,
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


