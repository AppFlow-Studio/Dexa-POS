import { TableType } from "@/lib/types";
import { create } from "zustand";

interface DineInState {
  selectedTable: TableType | null;
  setSelectedTable: (table: TableType | null) => void;
  clearSelectedTable: () => void;
}

export const useDineInStore = create<DineInState>((set) => ({
  selectedTable: null,
  setSelectedTable: (table) => set({ selectedTable: table }),
  clearSelectedTable: () => set({ selectedTable: null }),
}));