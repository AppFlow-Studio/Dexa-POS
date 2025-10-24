import {
  MOCK_DROP_REQUESTS,
  MOCK_PTO_REQUESTS,
  MOCK_SWAP_REQUESTS,
  mockShiftsScheudleGrid,
} from "@/lib/mockData";
import { PTORequest, Shift, ShiftRequest } from "@/lib/types";
import { create } from "zustand";

interface ScheduleRequestState {
  shifts: Shift[];
  dropRequests: ShiftRequest[];
  swapRequests: ShiftRequest[];
  ptoRequests: PTORequest[];
  addDropRequest: (request: Omit<ShiftRequest, "id" | "type">) => void;
  addSwapRequest: (request: Omit<ShiftRequest, "id" | "type">) => void;
  addPTORequest: (request: Omit<PTORequest, "id" | "submittedAt">) => void;
  addShift: (newShift: Omit<Shift, "id">) => void;
  updateShift: (updatedShift: Partial<Shift> & { id: string }) => void;
  deleteShift: (shiftId: string) => void;
  publishSchedule: (periodId: string) => void;
}

export const useScheduleStore = create<ScheduleRequestState>((set) => ({
  shifts: mockShiftsScheudleGrid,
  dropRequests: MOCK_DROP_REQUESTS,
  swapRequests: MOCK_SWAP_REQUESTS,
  ptoRequests: MOCK_PTO_REQUESTS,
  addDropRequest: (request) => {
    const newRequest: ShiftRequest = {
      ...request,
      id: `drop_${Date.now()}`,
      type: "drop",
    };
    set((state) => ({ dropRequests: [newRequest, ...state.dropRequests] }));
  },
  addSwapRequest: (request) => {
    const newRequest: ShiftRequest = {
      ...request,
      id: `swap_${Date.now()}`,
      type: "swap",
    };
    set((state) => ({ swapRequests: [newRequest, ...state.swapRequests] }));
  },
  addPTORequest: (request) => {
    const newRequest: PTORequest = {
      ...request,
      id: `pto_${Date.now()}`,
      submittedAt: new Date().toISOString(),
    };
    set((state) => ({ ptoRequests: [newRequest, ...state.ptoRequests] }));
  },
  addShift: (newShift) => {
    const newShiftWithId: Shift = {
      ...newShift,
      id: `shift_${Date.now()}`,
    };
    set((state) => ({ shifts: [...state.shifts, newShiftWithId] }));
  },
  updateShift: (updatedShift) => {
    set((state) => ({
      shifts: state.shifts.map((shift) =>
        shift.id === updatedShift.id ? { ...shift, ...updatedShift } : shift
      ),
    }));
  },
  deleteShift: (shiftId) => {
    set((state) => ({
      shifts: state.shifts.filter((shift) => shift.id !== shiftId),
    }));
  },
  publishSchedule: (periodId) => {
    console.log(`Publishing schedule for period ${periodId}`);
    // In a real app, this would likely involve an API call
    // and then updating the local state based on the response.
  },
}));
