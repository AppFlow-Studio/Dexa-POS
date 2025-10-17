import {
  MOCK_DROP_REQUESTS,
  MOCK_PTO_REQUESTS,
  MOCK_SWAP_REQUESTS,
} from "@/lib/mockData";
import { PTORequest, ShiftRequest } from "@/lib/types";
import { create } from "zustand";

interface ScheduleRequestState {
  dropRequests: ShiftRequest[];
  swapRequests: ShiftRequest[];
  ptoRequests: PTORequest[];
  addDropRequest: (request: Omit<ShiftRequest, "id" | "type">) => void;
  addSwapRequest: (request: Omit<ShiftRequest, "id" | "type">) => void;
  addPTORequest: (request: Omit<PTORequest, "id" | "submittedAt">) => void;
}

export const useScheduleStore = create<ScheduleRequestState>((set) => ({
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
}));
