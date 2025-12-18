import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { create } from "zustand";

interface DineInState {
  selectedTable: FloorPlanObject | null;
  setSelectedTable: (table: FloorPlanObject | null) => void;
  clearSelectedTable: () => void;
}

export const useDineInStore = create<DineInState>((set) => ({
  selectedTable: null,
  setSelectedTable: (table) => set({ selectedTable: table }),
  clearSelectedTable: () => set({ selectedTable: null }),
}));
