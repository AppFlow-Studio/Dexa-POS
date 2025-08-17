import { MOCK_TABLES } from "@/lib/mockData";
import { CartItem, TableStatus, TableType } from "@/lib/types";
import { create } from "zustand";

// Extend the TableType to include its own cart
export interface TableWithCart extends TableType {
  cart: CartItem[];
}

interface TableState {
  tables: TableWithCart[];
  updateTablePosition: (
    tableId: string,
    newPosition: { x: number; y: number }
  ) => void;
  addItemToTableCart: (tableId: string, newItem: CartItem) => void;
  updateItemInTableCart: (tableId: string, updatedItem: CartItem) => void;
  updateTableStatus: (tableId: string, newStatus: TableStatus) => void;
  getTableById: (tableId: string) => TableWithCart | undefined;
  clearTableCart: (tableId: string) => void;
}

export const useTableStore = create<TableState>((set, get) => ({
  // Initialize tables from mock data, adding an empty cart to each
  tables: MOCK_TABLES.map((table) => ({ ...table, cart: [] })),

  updateTablePosition: (tableId, newPosition) => {
    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === tableId
          ? { ...table, x: newPosition.x, y: newPosition.y }
          : table
      ),
    }));
  },

  addItemToTableCart: (tableId, newItem) => {
    set((state) => ({
      tables: state.tables.map((table) => {
        if (table.id === tableId) {
          const newCart = [...table.cart, newItem];
          return { ...table, cart: newCart, status: "In Use" };
        }
        return table;
      }),
    }));
  },

  updateItemInTableCart: (tableId, updatedItem) => {
    set((state) => ({
      tables: state.tables.map((table) => {
        if (table.id === tableId) {
          // Find the item in this table's cart and update it
          const updatedCart = table.cart.map((item) =>
            item.id === updatedItem.id ? updatedItem : item
          );
          return { ...table, cart: updatedCart };
        }
        return table;
      }),
    }));
  },

  updateTableStatus: (tableId, newStatus) => {
    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === tableId ? { ...table, status: newStatus } : table
      ),
    }));
  },

  clearTableCart: (tableId: string) => {
    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === tableId
          ? { ...table, cart: [], status: "Needs Cleaning" }
          : table
      ),
    }));
  },

  getTableById: (tableId) => {
    return get().tables.find((t) => t.id === tableId);
  },
}));
