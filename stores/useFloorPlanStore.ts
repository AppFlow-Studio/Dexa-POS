import { MOCK_TABLES } from "@/lib/mockData";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { Layout, TableStatus, TableType } from "@/lib/types";
import { create } from "zustand";

interface NewTableData {
  name: string;
  shapeId: keyof typeof TABLE_SHAPES;
}

interface FloorPlanState {
  layouts: Layout[];
  activeLayoutId: string | null;
  selectedTableIds: string[];

  // Layout Actions
  addLayout: (name: string) => void;
  updateLayoutName: (layoutId: string, newName: string) => void;
  deleteLayout: (layoutId: string) => void;
  setActiveLayout: (layoutId: string | null) => void;

  // Table Actions (now require layoutId)
  addTable: (layoutId: string, tableData: NewTableData) => void;
  updateTablePosition: (
    layoutId: string,
    tableId: string,
    newPosition: { x: number; y: number }
  ) => void;
  updateTableRotation: (
    layoutId: string,
    tableId: string,
    newRotation: number
  ) => void;
  removeTable: (layoutId: string, tableId: string) => void;
  updateTableStatus: (
    tableId: string,
    newStatus: TableStatus,
    layoutId?: string
  ) => void;

  // Selection & Merging Actions (operate on active layout)
  toggleTableSelection: (tableId: string) => void;
  mergeTables: (tableIds: string[], primaryOrderId: string) => string | null;
  unmergeTables: (tableId: string) => void;
  clearSelection: () => void;
}

// Initial state with a default layout containing the mock tables
const initialLayouts: Layout[] = [
  {
    id: "layout_1",
    name: "Main Dining Room",
    tables: MOCK_TABLES,
  },
];

export const useFloorPlanStore = create<FloorPlanState>((set, get) => ({
  layouts: initialLayouts,
  activeLayoutId: initialLayouts[0]?.id || null,
  selectedTableIds: [],

  // --- Layout Actions ---
  addLayout: (name) => {
    const newLayout: Layout = {
      id: `layout_${Date.now()}`,
      name,
      tables: [],
    };
    set((state) => ({
      layouts: [...state.layouts, newLayout],
    }));
  },

  updateLayoutName: (layoutId, newName) => {
    set((state) => ({
      layouts: state.layouts.map((layout) =>
        layout.id === layoutId ? { ...layout, name: newName } : layout
      ),
    }));
  },

  deleteLayout: (layoutId) => {
    set((state) => ({
      layouts: state.layouts.filter((layout) => layout.id !== layoutId),
      // If the deleted layout was active, reset the active layout
      activeLayoutId:
        state.activeLayoutId === layoutId ? null : state.activeLayoutId,
    }));
  },

  setActiveLayout: (layoutId) => {
    set({ activeLayoutId: layoutId });
  },

  // --- Table Actions (Refactored) ---
  addTable: (layoutId, tableData) => {
    const shape = TABLE_SHAPES[tableData.shapeId];
    if (!shape) return;

    const newTable: TableType = {
      id: `${layoutId}_table_${Date.now()}`,
      name: tableData.name,
      capacity: shape.capacity,
      component: shape.component,
      status: "Available",
      x: 50,
      y: 50,
      rotation: 0,
      order: null,
      type: "table",
    };

    set((state) => ({
      layouts: state.layouts.map((layout) =>
        layout.id === layoutId
          ? { ...layout, tables: [...layout.tables, newTable] }
          : layout
      ),
    }));
  },

  updateTablePosition: (layoutId, tableId, newPosition) => {
    set((state) => ({
      layouts: state.layouts.map((layout) =>
        layout.id === layoutId
          ? {
            ...layout,
            tables: layout.tables.map((t) =>
              t.id === tableId ? { ...t, ...newPosition } : t
            ),
          }
          : layout
      ),
    }));
  },

  updateTableRotation: (layoutId, tableId, newRotation) => {
    set((state) => ({
      layouts: state.layouts.map((layout) =>
        layout.id === layoutId
          ? {
            ...layout,
            tables: layout.tables.map((t) =>
              t.id === tableId ? { ...t, rotation: newRotation } : t
            ),
          }
          : layout
      ),
    }));
  },

  removeTable: (layoutId, tableId) => {
    set((state) => ({
      layouts: state.layouts.map((layout) =>
        layout.id === layoutId
          ? {
            ...layout,
            tables: layout.tables.filter((t) => t.id !== tableId),
          }
          : layout
      ),
    }));
  },

  updateTableStatus: (tableId, newStatus) => {
    set((state) => ({
      layouts: state.layouts.map((layout) => ({
        ...layout,
        tables: layout.tables.map((table) =>
          table.id === tableId ? { ...table, status: newStatus } : table
        ),
      })),
    }));
  },

  // --- Selection & Merging Actions (Operate on Active Layout) ---
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
    const { activeLayoutId, layouts } = get();
    if (!activeLayoutId || tableIds.length < 2) return null;

    const activeLayout = layouts.find((l) => l.id === activeLayoutId);
    if (!activeLayout) return null;

    const primaryTableId = tableIds[0];
    let mergedCapacity = 0;

    set((state) => ({
      layouts: state.layouts.map((layout) => {
        if (layout.id === activeLayoutId) {
          const updatedTables = layout.tables.map((table) => {
            if (tableIds.includes(table.id)) {
              mergedCapacity += table.capacity;
              return {
                ...table,
                isPrimary: table.id === primaryTableId,
                mergedWith: tableIds.filter((id) => id !== table.id),
                status: "In Use" as TableStatus,
                order:
                  table.id === primaryTableId
                    ? {
                      id: primaryOrderId,
                      // Customer name can be simplified now
                      customerName: `Group at ${table.name}`,
                      total: 0,
                    }
                    : null,
              };
            }
            return table;
          });

          // Second pass to update capacity on the primary table
          return {
            ...layout,
            tables: updatedTables.map((t) =>
              t.id === primaryTableId ? { ...t, capacity: mergedCapacity } : t
            ),
          };
        }
        return layout;
      }),
    }));

    get().clearSelection();
    return primaryTableId;
  },

  unmergeTables: (tableId) => {
    const { activeLayoutId, layouts } = get();
    if (!activeLayoutId) return;

    const activeLayout = layouts.find((l) => l.id === activeLayoutId);
    if (!activeLayout) return;

    const table = activeLayout.tables.find((t) => t.id === tableId);
    if (!table || (!table.isPrimary && !table.mergedWith?.length)) return;

    let groupIds: string[] = [];
    let primaryId: string | null = null;
    if (table.isPrimary) {
      primaryId = table.id;
      groupIds = [table.id, ...(table.mergedWith || [])];
    } else {
      const primaryTable = activeLayout.tables.find(
        (t) => t.isPrimary && t.mergedWith?.includes(tableId)
      );
      if (primaryTable) {
        primaryId = primaryTable.id;
        groupIds = [primaryTable.id, ...(primaryTable.mergedWith || [])];
      }
    }

    if (groupIds.length === 0) return;

    set((state) => ({
      layouts: state.layouts.map((layout) => {
        if (layout.id === activeLayoutId) {
          return {
            ...layout,
            tables: layout.tables.map((t) => {
              if (groupIds.includes(t.id)) {
                // If this is the primary table, only unlink but keep its status and active order
                if (t.id === primaryId) {
                  return {
                    ...t,
                    isPrimary: undefined,
                    mergedWith: undefined,
                    // keep status, name, capacity, and order as-is
                  } as typeof t;
                }

                // For connected tables, unlink and reset to available, no active order
                const originalCapacity =
                  MOCK_TABLES.find((mt) => mt.id === t.id)?.capacity ||
                  t.capacity;
                return {
                  ...t,
                  isPrimary: undefined,
                  mergedWith: undefined,
                  status: "Available",
                  name: `T-${t.id}`,
                  capacity: originalCapacity,
                  order: null,
                };
              }
              return t;
            }),
          };
        }
        return layout;
      }),
    }));

    get().clearSelection();
  },

  clearSelection: () => set({ selectedTableIds: [] }),
}));
