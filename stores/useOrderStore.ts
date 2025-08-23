import { CartItem, Discount, OrderProfile, PaymentType } from "@/lib/types";
import { create } from "zustand";

const TAX_RATE = 0.05;

interface OrderState {
  orders: OrderProfile[];
  activeOrderId: string | null;

  // --- DERIVED STATE (Totals for the ACTIVE order) ---
  // These values will be automatically updated by the store's actions.
  activeOrderSubtotal: number;
  activeOrderTax: number;
  activeOrderTotal: number;
  activeOrderDiscount: number;

  // --- ACTIONS ---
  setActiveOrder: (orderId: string | null) => void;
  startNewOrder: (tableId?: string) => OrderProfile;
  addItemToActiveOrder: (newItem: CartItem) => void;
  updateItemInActiveOrder: (updatedItem: CartItem) => void;
  removeItemFromActiveOrder: (itemId: string) => void;
  updateActiveOrderDetails: (details: Partial<OrderProfile>) => void;
  applyDiscountToCheck: (orderId: string, discount: Discount) => void;
  removeCheckDiscount: (orderId: string) => void;
  applyDiscountToItem: (orderId: string, itemId: string) => void;
  removeDiscountFromItem: (orderId: string, itemId: string) => void;
  assignOrderToTable: (orderId: string, tableId: string) => void;
  updateOrderStatus: (
    orderId: string,
    status: OrderProfile["order_status"]
  ) => void;
  addPaymentToOrder: (
    orderId: string,
    amount: number,
    method: PaymentType
  ) => void;

  closeActiveOrder: () => string | null; // Returns the tableId if it exists
}

export const useOrderStore = create<OrderState>((set, get) => {
  // --- PRIVATE HELPER FUNCTION ---
  // This function calculates and sets the totals for the currently active order.
  const recalculateTotals = (orderId: string | null) => {
    const { orders } = get();
    const activeOrder = orders.find((o) => o.id === orderId);

    if (activeOrder && activeOrder.items) {
      const subtotal = activeOrder.items.reduce(
        (acc, item) => acc + item.originalPrice * item.quantity,
        0
      );

      const itemDiscountsTotal = activeOrder.items.reduce((acc, item) => {
        if (item.appliedDiscount) {
          return (
            acc +
            item.originalPrice * item.appliedDiscount.value * item.quantity
          );
        }
        return acc;
      }, 0);

      const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;

      let checkDiscountAmount = 0;
      if (activeOrder.checkDiscount) {
        checkDiscountAmount =
          subtotalAfterItemDiscounts * activeOrder.checkDiscount.value;
      }

      const totalDiscountAmount = itemDiscountsTotal + checkDiscountAmount;
      const finalSubtotal = subtotal - totalDiscountAmount;
      const tax = finalSubtotal * TAX_RATE;
      const total = finalSubtotal + tax;

      set({
        activeOrderSubtotal: subtotal,
        activeOrderTax: tax,
        activeOrderTotal: total,
        activeOrderDiscount: totalDiscountAmount,
      });
    } else {
      set({
        activeOrderSubtotal: 0,
        activeOrderTax: 0,
        activeOrderTotal: 0,
        activeOrderDiscount: 0,
      });
    }
  };

  // --- Helper function to check for deep equality of customizations ---
  const areCustomizationsEqual = (
    custA: CartItem["customizations"],
    custB: CartItem["customizations"]
  ): boolean => {
    // 1. Check if sizes are the same
    if (custA.size?.id !== custB.size?.id) {
      return false;
    }
    // 2. Check if notes are the same
    if (custA.notes !== custB.notes) {
      return false;
    }
    // 3. Check if add-ons are the same (must have same add-ons in any order)
    const addOnsA = custA.addOns?.map((a) => a.id).sort() || [];
    const addOnsB = custB.addOns?.map((a) => a.id).sort() || [];
    if (
      addOnsA.length !== addOnsB.length ||
      !addOnsA.every((id, index) => id === addOnsB[index])
    ) {
      return false;
    }
    // 4. If all checks pass, they are equal
    return true;
  };

  return {
    // --- INITIAL STATE ---
    orders: [],
    activeOrderId: null,
    activeOrderSubtotal: 0,
    activeOrderTax: 0,
    activeOrderTotal: 0,
    activeOrderDiscount: 0,

    // --- PUBLIC ACTIONS ---
    setActiveOrder: (orderId) => {
      set({ activeOrderId: orderId });
      recalculateTotals(orderId);
    },

    startNewOrder: () => {
      const newOrder: OrderProfile = {
        id: `order_${Date.now()}`,
        service_location_id: null,
        order_status: "Preparing",
        order_type: "Take-Out",
        items: [],
        opened_at: new Date().toISOString(),
      };
      set((state) => ({ orders: [...state.orders, newOrder] }));
      return newOrder;
    },

    addItemToActiveOrder: (newItem) => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const activeOrder = orders.find((o) => o.id === activeOrderId);
      if (!activeOrder) return;

      // Find an existing item in the cart that is an exact match
      const existingItemIndex = activeOrder.items.findIndex(
        (cartItem) =>
          cartItem.menuItemId === newItem.menuItemId &&
          areCustomizationsEqual(
            cartItem.customizations,
            newItem.customizations
          )
      );

      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === activeOrderId) {
            let updatedCart: CartItem[];

            if (existingItemIndex > -1) {
              // --- Item Merge Logic ---
              // If a match is found, update the quantity of the existing item
              updatedCart = o.items.map((item, index) => {
                if (index === existingItemIndex) {
                  return {
                    ...item,
                    quantity: item.quantity + newItem.quantity,
                  };
                }
                return item;
              });
            } else {
              // --- Add New Item Logic ---
              // If no match, add the new item to the cart
              updatedCart = [...o.items, newItem];
            }
            return { ...o, items: updatedCart };
          }
          return o;
        }),
      }));
      recalculateTotals(activeOrderId); // Recalculate after updating the cart
    },

    updateItemInActiveOrder: (updatedItem) => {
      const { activeOrderId } = get();
      if (!activeOrderId) return;

      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId
            ? {
                ...o,
                items: o.items.map((i) =>
                  i.id === updatedItem.id ? updatedItem : i
                ),
              }
            : o
        ),
      }));
      recalculateTotals(activeOrderId);
    },

    removeItemFromActiveOrder: (itemId) => {
      const { activeOrderId } = get();
      if (!activeOrderId) return;

      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId
            ? { ...o, items: o.items.filter((i) => i.id !== itemId) }
            : o
        ),
      }));
      recalculateTotals(activeOrderId);
    },

    updateActiveOrderDetails: (details) => {
      const { activeOrderId } = get();
      if (!activeOrderId) return;

      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId ? { ...o, ...details } : o
        ),
      }));
    },

    applyDiscountToCheck: (orderId, discount) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, checkDiscount: discount } : o
        ),
      }));
      recalculateTotals(get().activeOrderId);
    },

    removeCheckDiscount: (orderId) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, checkDiscount: null } : o
        ),
      }));
      recalculateTotals(get().activeOrderId);
    },

    applyDiscountToItem: (orderId, itemId) => {
      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === orderId) {
            return {
              ...o,
              items: o.items.map((item) => {
                if (item.id === itemId && item.availableDiscount) {
                  return { ...item, appliedDiscount: item.availableDiscount };
                }
                return item;
              }),
            };
          }
          return o;
        }),
      }));
      recalculateTotals(get().activeOrderId);
    },

    removeDiscountFromItem: (orderId, itemId) => {
      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === orderId) {
            return {
              ...o,
              items: o.items.map((item) =>
                item.id === itemId ? { ...item, appliedDiscount: null } : item
              ),
            };
          }
          return o;
        }),
      }));
      recalculateTotals(get().activeOrderId);
    },

    assignOrderToTable: (orderId, tableId) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId
            ? { ...o, service_location_id: tableId, order_type: "Dine-In" }
            : o
        ),
      }));
    },

    updateOrderStatus: (orderId, status) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, order_status: status } : o
        ),
      }));
    },

    addPaymentToOrder: (orderId, amount, method) => {
      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === orderId) {
            const newPayments = [...(o.payments || []), { amount, method }];
            return { ...o, payments: newPayments };
          }
          return o;
        }),
      }));
    },

    closeActiveOrder: () => {
      const { activeOrderId } = get();
      if (!activeOrderId) return null;

      let tableId: string | null = null;
      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === activeOrderId) {
            tableId = o.service_location_id;
            return {
              ...o,
              order_status: "Closed",
              closed_at: new Date().toISOString(),
            };
          }
          return o;
        }),
      }));

      // After closing, there is no active order
      set({ activeOrderId: null });
      recalculateTotals(activeOrderId);

      return tableId;
    },
  };
});
