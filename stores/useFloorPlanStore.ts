import { MOCK_TABLES } from "@/lib/mockData";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { Layout, TableStatus, TableType } from "@/lib/types";
import { create } from "zustand";

interface NewTableData {
  name: string;
  shapeId: keyof typeof TABLE_SHAPES;
  x?: number;
  y?: number;
}

interface FloorPlanState {
  layouts: Layout[];
  activeLayoutId: string | null;
  selectedTableIds: string[];

  // Undo/Redo
  past: Layout[][];
  future: Layout[][];
  undo: () => void;
  redo: () => void;
  saveSnapshot: () => void;
  clearHistory: () => void;

  // Actions
  addLayout: (name: string) => void;
  updateLayoutName: (layoutId: string, newName: string) => void;
  deleteLayout: (layoutId: string) => void;
  setActiveLayout: (layoutId: string | null) => void;
  addTable: (layoutId: string, tableData: NewTableData) => void;
  addMultipleTables: (
    layoutId: string,
    items: { shapeId: keyof typeof TABLE_SHAPES; quantity: number }[]
  ) => void;
  updateTableName: (layoutId: string, tableId: string, newName: string) => void;
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
  toggleTableSelection: (tableId: string) => void;
  mergeTables: (tableIds: string[], primaryOrderId: string) => string | null;
  unmergeTables: (tableId: string) => void;
  clearSelection: () => void;
}

// Helper to sanitize layout for history (removes function components)
const sanitizeForHistory = (layouts: Layout[]) => {
  return JSON.parse(
    JSON.stringify(layouts, (key, value) => {
      if (key === "component") return undefined; // Remove components from history
      return value;
    })
  );
};

// Initial Mock Setup - ensuring shapeId exists if possible, fallback to 'square-4'
const initialLayouts: Layout[] = [
  {
    id: "layout_1",
    name: "Main Dining Room",
    tables: MOCK_TABLES.map((t) => ({
      ...t,
      // Default to a shape if missing in mock data
      shapeId: (t as any).shapeId || "square-4",
    })),
  },
];

const findNextAvailablePosition = (
  existingTables: TableType[],
  newTableDimensions: { width: number; height: number }
): { x: number; y: number } => {
  const GRID_SIZE = 40;
  const PADDING = 20;
  const CANVAS_WIDTH = 1200;

  for (let y = GRID_SIZE; y < 800; y += GRID_SIZE) {
    for (let x = GRID_SIZE; x < CANVAS_WIDTH; x += GRID_SIZE) {
      const candidateRect = {
        x,
        y,
        width: newTableDimensions.width,
        height: newTableDimensions.height,
      };

      let isOverlapping = false;
      for (const table of existingTables) {
        // Look up shape using shapeId if component is missing
        const shapeInfo = table.shapeId
          ? TABLE_SHAPES[table.shapeId]
          : Object.values(TABLE_SHAPES).find(
              (s) => s.component === table.component
            );

        if (!shapeInfo) continue;

        const existingRect = {
          x: table.x - PADDING,
          y: table.y - PADDING,
          width: shapeInfo.width + PADDING * 2,
          height: shapeInfo.height + PADDING * 2,
        };

        if (
          candidateRect.x < existingRect.x + existingRect.width &&
          candidateRect.x + candidateRect.width > existingRect.x &&
          candidateRect.y < existingRect.y + existingRect.height &&
          candidateRect.y + candidateRect.height > existingRect.y
        ) {
          isOverlapping = true;
          break;
        }
      }
      if (!isOverlapping) return { x, y };
    }
  }
  return { x: 50, y: 50 };
};

export const useFloorPlanStore = create<FloorPlanState>((set, get) => ({
  layouts: initialLayouts,
  activeLayoutId: initialLayouts[0]?.id || null,
  selectedTableIds: [],
  past: [],
  future: [],

  // --- HISTORY MANAGEMENT ---
  saveSnapshot: () => {
    set((state) => ({
      past: [...state.past, sanitizeForHistory(state.layouts)],
      future: [],
    }));
  },

  clearHistory: () => {
    set({ past: [], future: [] });
  },

  undo: () => {
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return {
        layouts: previous, // Restore previous state
        past: newPast,
        future: [sanitizeForHistory(state.layouts), ...state.future],
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        layouts: next,
        past: [...state.past, sanitizeForHistory(state.layouts)],
        future: newFuture,
      };
    });
  },

  // --- ACTIONS ---
  addLayout: (name) => {
    get().saveSnapshot();
    const newLayout: Layout = {
      id: `layout_${Date.now()}`,
      name,
      tables: [],
    };
    set((state) => ({ layouts: [...state.layouts, newLayout] }));
  },

  updateLayoutName: (layoutId, newName) => {
    get().saveSnapshot();
    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.id === layoutId ? { ...l, name: newName } : l
      ),
    }));
  },

  deleteLayout: (layoutId) => {
    get().saveSnapshot();
    set((state) => ({
      layouts: state.layouts.filter((l) => l.id !== layoutId),
      activeLayoutId:
        state.activeLayoutId === layoutId ? null : state.activeLayoutId,
    }));
  },

  setActiveLayout: (layoutId) => {
    set({ activeLayoutId: layoutId });
  },

  addTable: (layoutId, tableData) => {
    get().saveSnapshot();
    const shape = TABLE_SHAPES[tableData.shapeId];
    if (!shape) return;

    const activeLayout = get().layouts.find((l) => l.id === layoutId);
    if (!activeLayout) return;

    let finalX = tableData.x;
    let finalY = tableData.y;

    if (finalX === undefined || finalY === undefined) {
      const newPosition = findNextAvailablePosition(activeLayout.tables, {
        width: shape.width,
        height: shape.height,
      });
      finalX = newPosition.x;
      finalY = newPosition.y;
    }

    const newTable: TableType = {
      id: `${layoutId}_table_${Date.now()}`,
      name: tableData.name,
      capacity: shape.capacity,
      component: shape.component, // Don't save component to state
      shapeId: tableData.shapeId, // Save ID instead
      status: shape.type === "table" ? "Available" : "Not in Service",
      x: finalX!,
      y: finalY!,
      rotation: 0,
      order: null,
      type: shape.type,
    };

    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.id === layoutId ? { ...l, tables: [...l.tables, newTable] } : l
      ),
    }));
  },

  addMultipleTables: (layoutId, items) => {
    get().saveSnapshot();
    let layout = get().layouts.find((l) => l.id === layoutId);
    if (!layout) return;

    let tablesToAdd: TableType[] = [];
    let tempTables = [...layout.tables];

    items.forEach((item) => {
      const shape = TABLE_SHAPES[item.shapeId];
      if (!shape) return;

      for (let i = 0; i < item.quantity; i++) {
        const newPosition = findNextAvailablePosition(tempTables, {
          width: shape.width,
          height: shape.height,
        });

        const newTable: TableType = {
          id: `${layoutId}_table_${Date.now()}_${i}`,
          name: `${shape.label.split("-")[0]} ${
            layout.tables.length + tablesToAdd.length + 1
          }`,
          capacity: shape.capacity,
          component: shape.component,
          shapeId: item.shapeId,
          status: "Available",
          x: newPosition.x,
          y: newPosition.y,
          rotation: 0,
          order: null,
          type: shape.type,
        };
        tablesToAdd.push(newTable);
        tempTables.push(newTable);
      }
    });

    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.id === layoutId ? { ...l, tables: [...l.tables, ...tablesToAdd] } : l
      ),
    }));
  },

  updateTableName: (layoutId, tableId, newName) => {
    get().saveSnapshot();
    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.id === layoutId
          ? {
              ...l,
              tables: l.tables.map((t) =>
                t.id === tableId ? { ...t, name: newName } : t
              ),
            }
          : l
      ),
    }));
  },

  updateTablePosition: (layoutId, tableId, newPosition) => {
    // Note: saveSnapshot is handled by the component via gesture onStart
    // We assume the component calls saveSnapshot() before dragging starts
    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.id === layoutId
          ? {
              ...l,
              tables: l.tables.map((t) =>
                t.id === tableId ? { ...t, ...newPosition } : t
              ),
            }
          : l
      ),
    }));
  },

  updateTableRotation: (layoutId, tableId, newRotation) => {
    // Note: saveSnapshot is handled by component onStart
    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.id === layoutId
          ? {
              ...l,
              tables: l.tables.map((t) =>
                t.id === tableId ? { ...t, rotation: newRotation } : t
              ),
            }
          : l
      ),
    }));
  },

  removeTable: (layoutId, tableId) => {
    get().saveSnapshot();
    set((state) => ({
      layouts: state.layouts.map((l) =>
        l.id === layoutId
          ? {
              ...l,
              tables: l.tables.filter((t) => t.id !== tableId),
            }
          : l
      ),
    }));
  },

  updateTableStatus: (tableId, newStatus) => {
    get().saveSnapshot();
    set((state) => ({
      layouts: state.layouts.map((l) => ({
        ...l,
        tables: l.tables.map((t) =>
          t.id === tableId ? { ...t, status: newStatus } : t
        ),
      })),
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
    get().saveSnapshot();
    const { activeLayoutId, layouts } = get();
    if (!activeLayoutId || tableIds.length < 2) return null;

    set((state) => ({
      layouts: state.layouts.map((l) => {
        if (l.id === activeLayoutId) {
          const updatedTables = l.tables.map((t) => {
            if (tableIds.includes(t.id)) {
              return {
                ...t,
                isPrimary: t.id === tableIds[0],
                mergedWith: tableIds.filter((id) => id !== t.id),
              };
            }
            return t;
          });
          return { ...l, tables: updatedTables };
        }
        return l;
      }),
    }));
    get().clearSelection();
    return tableIds[0];
  },

  unmergeTables: (tableId) => {
    get().saveSnapshot();
    const { activeLayoutId } = get();
    if (!activeLayoutId) return;

    set((state) => ({
      layouts: state.layouts.map((l) => {
        if (l.id === activeLayoutId) {
          return {
            ...l,
            tables: l.tables.map((t) => {
              if (t.id === tableId || t.mergedWith?.includes(tableId)) {
                return {
                  ...t,
                  isPrimary: undefined,
                  mergedWith: undefined,
                };
              }
              return t;
            }),
          };
        }
        return l;
      }),
    }));
    get().clearSelection();
  },

  clearSelection: () => set({ selectedTableIds: [] }),
}));
