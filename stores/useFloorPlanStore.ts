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
  selectedTableIds: string[];
  updateTablePosition: (
    tableId: string,
    newPosition: { x: number; y: number }
  ) => void;
  updateTableStatus: (tableId: string, newStatus: TableStatus) => void;
  addTable: (tableData: NewTableData) => void;
  updateTableRotation: (tableId: string, newRotation: number) => void;
  removeTable: (tableId: string) => void;
  toggleTableSelection: (tableId: string) => void;
  mergeTables: (tableIds: string[], primaryOrderId: string) => string | null; // Returns the new primary table ID
  unmergeTables: (tableId: string) => void;
  clearSelection: () => void;
}

export const useFloorPlanStore = create<FloorPlanState>((set, get) => ({
  tables: MOCK_TABLES,
  selectedTableIds: [],
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
  toggleTableSelection: (tableId) => {
    set((state) => {
      const isSelected = state.selectedTableIds.includes(tableId);
      const newSelection = isSelected
        ? state.selectedTableIds.filter((id) => id !== tableId)
        : [...state.selectedTableIds, tableId];
      return { selectedTableIds: newSelection };
    });
  },

  mergeTables: (tableIds, primaryOrderId) => {
    if (tableIds.length < 2) return null;

    const primaryTableId = tableIds[0];
    const newName = tableIds
      .map((id) => get().tables.find((t) => t.id === id)?.name)
      .join("-");
    let mergedCapacity = 0;

    set((state) => ({
      tables: state.tables.map((table) => {
        if (tableIds.includes(table.id)) {
          mergedCapacity += table.capacity;
          return {
            ...table,
            isPrimary: table.id === primaryTableId,
            mergedWith: tableIds.filter((id) => id !== table.id),
            status: "In Use" as TableStatus,
            // Link the new consolidated order to the primary table
            order:
              table.id === primaryTableId
                ? { id: primaryOrderId, customerName: "Merged Party", total: 0 }
                : null,
          };
        }
        return table;
      }),
    }));

    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === primaryTableId
          ? { ...table, name: newName, capacity: mergedCapacity }
          : table
      ),
    }));

    get().clearSelection();
    return primaryTableId;
  },

  unmergeTables: (tableId) => {
    const table = get().tables.find((t) => t.id === tableId);
    if (!table || (!table.isPrimary && !table.mergedWith?.length)) return;

    const groupIds = table.isPrimary
      ? [table.id, ...table.mergedWith!]
      : [
          table.id,
          ...get().tables.find((t) => t.id === table.mergedWith![0])!
            .mergedWith!,
        ];

    set((state) => ({
      tables: state.tables.map((t) => {
        if (groupIds.includes(t.id)) {
          // Reset to original name and capacity (assuming name is like "T-10")
          const originalName = `T-${t.id}`;
          const originalCapacity =
            MOCK_TABLES.find((mt) => mt.id === t.id)?.capacity || t.capacity;
          return {
            ...t,
            isPrimary: undefined,
            mergedWith: undefined,
            status: "Available" as TableStatus,
            name: originalName,
            capacity: originalCapacity,
          };
        }
        return t;
      }),
    }));
  },

  clearSelection: () => set({ selectedTableIds: [] }),
}));
