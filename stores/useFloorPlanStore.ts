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
    set((state) => {
      const tableToUpdate = state.tables.find((t) => t.id === tableId);
      if (!tableToUpdate) return state;

      let groupIdsToUpdate: string[] = [tableId];

      if (tableToUpdate.mergedWith || tableToUpdate.isPrimary) {
        const primaryTable = tableToUpdate.isPrimary
          ? tableToUpdate
          : state.tables.find(
              (t) => t.isPrimary && t.mergedWith?.includes(tableId)
            );

        if (primaryTable) {
          groupIdsToUpdate = [
            primaryTable.id,
            ...(primaryTable.mergedWith || []),
          ];
        }
      }

      return {
        tables: state.tables.map((t) => {
          if (groupIdsToUpdate.includes(t.id)) {
            // Clear order when table needs cleaning or becomes available
            if (newStatus === "Available" || newStatus === "Needs Cleaning") {
              return { ...t, status: newStatus, order: null };
            }
            return { ...t, status: newStatus };
          }
          return t;
        }),
      };
    });
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
    // Find the original names before they get overwritten
    const tableNames = tableIds.map(
      (id) => get().tables.find((t) => t.id === id)?.name || id
    );
    const newName = tableNames.join("-");
    let mergedCapacity = 0;

    set((state) => ({
      tables: state.tables.map((table) => {
        if (tableIds.includes(table.id)) {
          mergedCapacity += table.capacity;
          return {
            ...table,
            name: newName, // Apply new name to ALL tables in the group ---
            isPrimary: table.id === primaryTableId,
            mergedWith: tableIds.filter((id) => id !== table.id),
            status: "In Use" as TableStatus,
            order:
              table.id === primaryTableId
                ? {
                    id: primaryOrderId,
                    customerName: `Group (${newName})`,
                    total: 0,
                  }
                : null,
          };
        }
        return table;
      }),
    }));

    // This second loop is now only for updating capacity on the primary table
    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === primaryTableId
          ? { ...table, capacity: mergedCapacity }
          : table
      ),
    }));

    get().clearSelection();
    return primaryTableId;
  },

  unmergeTables: (tableId) => {
    const table = get().tables.find((t) => t.id === tableId);
    if (!table || (!table.isPrimary && !table.mergedWith?.length)) return;

    let groupIds: string[] = [];

    if (table.isPrimary) {
      // If the selected table is the primary one, the group is easy to find.
      groupIds = [table.id, ...(table.mergedWith || [])];
    } else {
      // If the selected table is NOT primary, find the primary table it's linked to.
      // Its `mergedWith` array will contain the primary table's ID.
      const primaryTableId = table.mergedWith![0];
      const primaryTable = get().tables.find((t) => t.id === primaryTableId);
      if (primaryTable) {
        groupIds = [primaryTable.id, ...(primaryTable.mergedWith || [])];
      }
    }

    if (groupIds.length === 0) return; // Safety check

    set((state) => ({
      tables: state.tables.map((t) => {
        if (groupIds.includes(t.id)) {
          // Reset logic remains the same
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
            order: null,
          };
        }
        return t;
      }),
    }));

    get().clearSelection(); // Clear selection after unmerging
  },

  clearSelection: () => set({ selectedTableIds: [] }),
}));
