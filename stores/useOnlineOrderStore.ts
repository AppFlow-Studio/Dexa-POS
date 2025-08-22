import { MOCK_ONLINE_ORDERS } from "@/lib/mockData";
import { OnlineOrder, OnlineOrderStatus } from "@/lib/types";
import { create } from "zustand";

interface OnlineOrderState {
  orders: OnlineOrder[];
  updateOrderStatus: (orderId: string, newStatus: OnlineOrderStatus) => void;
  rejectOrder: (orderId: string) => void;
  archiveOrder: (orderId: string) => void;
}

export const useOnlineOrderStore = create<OnlineOrderState>((set) => ({
  orders: MOCK_ONLINE_ORDERS,

  updateOrderStatus: (orderId, newStatus) => {
    set((state) => ({
      orders: state.orders.map((order) =>
        order.id === orderId ? { ...order, status: newStatus } : order
      ),
    }));
  },

  rejectOrder: (orderId) => {
    set((state) => ({
      orders: state.orders.filter((order) => order.id !== orderId),
    }));
  },
  archiveOrder: (orderId) => {
    set((state) => ({
      orders: state.orders.filter((order) => order.id !== orderId),
    }));
  },
}));
