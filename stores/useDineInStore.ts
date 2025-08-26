import { MOCK_TABLES } from "@/lib/mockData";
import { CartItem, OrderProfile, TableType } from "@/lib/types";
import { create } from "zustand";

// Mimic the database tables in our store's state
interface DineInState {
  tables: TableType[];
  orders: OrderProfile[];

  // ACTIONS
  // Step 2: Seating Guests and Starting an Order
  startOrderAtTable: (tableId: string) => OrderProfile;

  // Step 3: Managing the Active Order
  addItemToOrder: (orderId: string, newItem: CartItem) => void;
  getActiveOrderByTableId: (tableId: string) => OrderProfile | undefined;

  // Step 4: Payment and Closing the Order
  closeOrderAndCleanTable: (orderId: string) => void;

  // Step 5: Cleaning and Resetting the Table
  markTableAsAvailable: (tableId: string) => void;

  // Helper for layout editing
  updateTablePosition: (
    tableId: string,
    newPosition: { x: number; y: number }
  ) => void;
}

export const useDineInStore = create<DineInState>((set, get) => ({
  // Initialize state from mock data
  tables: MOCK_TABLES,
  orders: [], // Start with no active orders

  startOrderAtTable: (tableId) => {
    const newOrder: OrderProfile = {
      id: `order_${Date.now()}`,
      service_location_id: tableId,
      order_status: "Open", // Default status for a new order
      order_type: "Dine In", // Since it's from a table
      items: [],
      opened_at: new Date().toISOString(), // Current timestamp
      paid_status: "Unpaid",
      // ... other properties
    };

    set((state) => ({
      // Add the new order to the list of orders
      orders: [...state.orders, newOrder],
      // Update the specific table's status to 'Occupied'
      tables: state.tables.map((t) =>
        t.id === tableId ? { ...t, status: "In Use" } : t
      ),
    }));

    return newOrder;
  },

  addItemToOrder: (orderId, newItem) => {
    set((state) => ({
      orders: state.orders.map((order) =>
        order.id === orderId
          ? { ...order, items: [...order.items, newItem] }
          : order
      ),
    }));
  },

  getActiveOrderByTableId: (tableId) => {
    return get().orders.find(
      (o) => o.service_location_id === tableId && o.order_status === "Open"
    );
  },

  closeOrderAndCleanTable: (orderId) => {
    const { orders, tables } = get();
    let tableToCleanId: string | null = null;

    const updatedOrders: OrderProfile[] = orders.map((order) => {
      if (order.id === orderId) {
        tableToCleanId = order.service_location_id;
        return {
          ...order,
          order_status: "Closed" as const,
          closed_at: new Date().toISOString(),
        };
      }
      return order;
    });

    if (tableToCleanId) {
      const updatedTables = tables.map((t) =>
        t.id === tableToCleanId
          ? { ...t, status: "Needs Cleaning" as const }
          : t
      );
      set({ orders: updatedOrders, tables: updatedTables });
    } else {
      set({ orders: updatedOrders });
    }
  },

  markTableAsAvailable: (tableId) => {
    set((state) => ({
      tables: state.tables.map((t: TableType) =>
        t.id === tableId ? { ...t, status: "Available" } : t
      ),
    }));
  },

  updateTablePosition: (tableId, newPosition) => {
    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === tableId ? { ...t, ...newPosition } : t
      ),
    }));
  },
}));
