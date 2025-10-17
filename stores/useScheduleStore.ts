import { MOCK_DROP_REQUESTS, MOCK_SWAP_REQUESTS } from "@/lib/mockData";
import { ShiftRequest } from "@/lib/types";
import { create } from "zustand";

interface ScheduleRequestState {
  dropRequests: ShiftRequest[];
  swapRequests: ShiftRequest[];
  addDropRequest: (request: Omit<ShiftRequest, "id" | "type">) => void;
  addSwapRequest: (request: Omit<ShiftRequest, "id" | "type">) => void;
}

export const useScheduleStore = create<ScheduleRequestState>((set) => ({
  dropRequests: MOCK_DROP_REQUESTS,
  swapRequests: MOCK_SWAP_REQUESTS,
  addDropRequest: (request) => {
    const newRequest: ShiftRequest = {
      ...request,
      id: `drop_${Date.now()}`,
      type: "drop",
    };
    set((state) => ({ dropRequests: [...state.dropRequests, newRequest] }));
  },
  addSwapRequest: (request) => {
    const newRequest: ShiftRequest = {
      ...request,
      id: `swap_${Date.now()}`,
      type: "swap",
    };
    set((state) => ({ swapRequests: [...state.swapRequests, newRequest] }));
  },
}));
