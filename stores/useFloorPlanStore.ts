import { MOCK_TABLES } from "@/lib/mockData";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { TableStatus, TableType } from "@/lib/types";
import { create } from "zustand";

interface NewTableData {
  name: string;
  shapeId: keyof typeof TABLE_SHAPES;
}

interface FloorPlanState {
  tables: TableType[];
  updateTablePosition: (
    tableId: string,
    newPosition: { x: number; y: number }
  ) => void;
  updateTableStatus: (tableId: string, newStatus: TableStatus) => void;
  addTable: (tableData: NewTableData) => void;
  updateTableRotation: (tableId: string, newRotation: number) => void;
  removeTable: (tableId: string) => void;
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
  addTable: (tableData) => {
    const shape = TABLE_SHAPES[tableData.shapeId];
    if (!shape) return; // Safety check

    const newTable: TableType = {
      id: tableData.name,
      name: tableData.name,
      capacity: shape.capacity,
      component: shape.component,
      status: "Available",
      // Place new tables in a default position on the canvas
      x: 50,
      y: 50,
      rotation: 0,
      order: null,
      type: "table",
    };

    set((state) => ({
      tables: [...state.tables, newTable],
    }));
  },

  updateTableRotation: (tableId, newRotation) => {
    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === tableId ? { ...t, rotation: newRotation } : t
      ),
    }));
  },
  removeTable: (tableId) => {
    set((state) => ({
      tables: state.tables.filter((t) => t.id !== tableId),
    }));
  },
}));
