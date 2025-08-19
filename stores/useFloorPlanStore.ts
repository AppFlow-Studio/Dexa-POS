import { MOCK_TABLES } from "@/lib/mockData";
import { TableStatus, TableType } from "@/lib/types";
import { create } from "zustand";

interface FloorPlanState {
  tables: TableType[];
  updateTablePosition: (
    tableId: string,
    newPosition: { x: number; y: number }
  ) => void;
  updateTableStatus: (tableId: string, newStatus: TableStatus) => void;
}

export const useFloorPlanStore = create<FloorPlanState>((set) => ({
  tables: MOCK_TABLES,
  updateTablePosition: (tableId, newPosition) => {
    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === tableId ? { ...t, ...newPosition } : t
      ),
    }));
  },
  updateTableStatus: (tableId, newStatus) => {
    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === tableId ? { ...t, status: newStatus } : t
      ),
    }));
  },
}));
