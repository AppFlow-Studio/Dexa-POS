import { CartItem, Discount, OrderProfile, PaymentType } from "@/lib/types";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
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
  // Outstanding (unpaid) totals for the ACTIVE order
  activeOrderOutstandingSubtotal: number;
  activeOrderOutstandingTax: number;
  activeOrderOutstandingTotal: number;

  // --- PENDING TABLE SELECTION ---
  pendingTableSelection: string | null; // Store pending table selection

  // --- ACTIONS ---
  setActiveOrder: (orderId: string | null) => void;
  startNewOrder: (tableId?: string) => OrderProfile;
  addItemToActiveOrder: (newItem: CartItem) => void;
  updateItemInActiveOrder: (updatedItem: CartItem) => void;
  removeItemFromActiveOrder: (itemId: string) => void;
  updateItemStatusInActiveOrder: (
    itemId: string,
    status: "Preparing" | "Ready"
  ) => void;
  updateActiveOrderDetails: (details: Partial<OrderProfile>) => void;
  applyDiscountToCheck: (orderId: string, discount: Discount) => void;
  removeCheckDiscount: (orderId: string) => void;
  applyDiscountToItem: (orderId: string, itemId: string) => void;
  removeDiscountFromItem: (orderId: string, itemId: string) => void;
  assignOrderToTable: (orderId: string, tableId: string) => void;
  assignActiveOrderToTable: (tableId: string) => void;
  updateOrderStatus: (
    orderId: string,
    status: OrderProfile["order_status"]
  ) => void;
  addPaymentToOrder: (
    orderId: string,
    amount: number,
    method: PaymentType
  ) => void;

  markOrderAsPaid: (orderId: string) => void;
  setPendingTableSelection: (tableId: string | null) => void;

  closeActiveOrder: () => string | null; // Returns the tableId if it exists
}

export const useOrderStore = create<OrderState>((set, get) => {
  // --- PRIVATE HELPER FUNCTION ---
  // This function calculates and sets the totals for the currently active order.
  const normalizePaidQuantitiesFromPayments = (orderId: string | null) => {
    if (!orderId) return;
    const { orders } = get();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const totalPaid = (order.payments || []).reduce(
      (acc, p) => acc + p.amount,
      0
    );
    // Calculate how many units should be marked paid across items FIFO
    let remaining = totalPaid;
    const updatedItems = order.items.map((item) => {
      const unitPrice = item.price;
      const currentPaid = item.paidQuantity || 0;
      const unpaidQty = item.quantity - currentPaid;
      if (remaining <= 0 || unpaidQty <= 0) return item;
      const canCover = Math.min(
        unpaidQty,
        Math.floor(remaining / unitPrice + 1e-6)
      );
      if (canCover <= 0) return item;
      remaining -= canCover * unitPrice;
      return { ...item, paidQuantity: currentPaid + canCover };
    });

    // Return updated items so callers can set state when safe
    return updatedItems;
  };

  const recalculateTotals = (orderId: string | null) => {
    const { orders } = get();
    const activeOrder = orders.find((o) => o.id === orderId);

    if (activeOrder && activeOrder.items) {
      // Subtotal must reflect modifiers (size/add-ons) captured in item.price
      const subtotal = activeOrder.items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      );

      // Compute outstanding subtotal (unpaid amount) used for badges/logic
      const outstandingSubtotal = activeOrder.items.reduce((acc, item) => {
        const unpaidQty = item.quantity - (item.paidQuantity || 0);
        return acc + unpaidQty * item.price;
      }, 0);

      const itemDiscountsTotal = activeOrder.items.reduce((acc, item) => {
        if (item.appliedDiscount) {
          return (
            acc +
            item.price * item.appliedDiscount.value * item.quantity
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

      // Outstanding totals derived from unpaid quantities at item price level
      const outstandingTax = outstandingSubtotal * TAX_RATE;
      const outstandingTotal = outstandingSubtotal + outstandingTax;

      set({
        activeOrderSubtotal: subtotal,
        activeOrderTax: tax,
        activeOrderTotal: total,
        activeOrderDiscount: totalDiscountAmount,
        activeOrderOutstandingSubtotal: outstandingSubtotal,
        activeOrderOutstandingTax: outstandingTax,
        activeOrderOutstandingTotal: outstandingTotal,
      });

      // Auto-manage paid_status only when there are items and at least one payment
      const hasItems = (activeOrder.items?.length || 0) > 0;
      const hasPayments = (activeOrder.payments?.length || 0) > 0;
      if (hasItems && hasPayments) {
        if (outstandingSubtotal <= 1e-6 && activeOrder.paid_status !== "Paid") {
          set((state) => ({
            orders: state.orders.map((o) =>
              o.id === orderId ? { ...o, paid_status: "Paid" } : o
            ),
          }));
        } else if (
          outstandingSubtotal > 1e-6 && activeOrder.paid_status === "Paid"
        ) {
          // If new items were added after full payment, reflect Pending
          set((state) => ({
            orders: state.orders.map((o) =>
              o.id === orderId ? { ...o, paid_status: "Pending" } : o
            ),
          }));
        }
      }
    } else {
      set({
        activeOrderSubtotal: 0,
        activeOrderTax: 0,
        activeOrderTotal: 0,
        activeOrderDiscount: 0,
        activeOrderOutstandingSubtotal: 0,
        activeOrderOutstandingTax: 0,
        activeOrderOutstandingTotal: 0,
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
    activeOrderOutstandingSubtotal: 0,
    activeOrderOutstandingTax: 0,
    activeOrderOutstandingTotal: 0,
    pendingTableSelection: null,

    // --- PUBLIC ACTIONS ---
    setActiveOrder: (orderId) => {
      set({ activeOrderId: orderId });
      // Avoid mutating orders here to prevent effects that depend on `orders` from looping
      // Totals are derived and safe to compute
      recalculateTotals(orderId);
    },

    startNewOrder: () => {
      const newOrder: OrderProfile = {
        id: `order_${Date.now()}`,
        service_location_id: null,
        order_status: "Building",
        paid_status: "Unpaid",
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
                    // Newly added quantities are unpaid
                    paidQuantity: item.paidQuantity || 0,
                  };
                }
                return item;
              });
            } else {
              // --- Add New Item Logic ---
              // If no match, add the new item to the cart
              updatedCart = [
                ...o.items,
                { ...newItem, paidQuantity: newItem.paidQuantity ?? 0 },
              ];
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

    updateItemStatusInActiveOrder: (itemId, status) => {
      const { activeOrderId } = get();
      if (!activeOrderId) return;
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId
            ? {
              ...o,
              items: o.items.map((i) =>
                i.id === itemId ? { ...i, item_status: status } : i
              ),
            }
            : o
        ),
      }));
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
            ? { ...o, service_location_id: tableId, order_type: "Dine In" }
            : o
        ),
      }));
    },

    assignActiveOrderToTable: (tableId) => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const orderToAssign = orders.find((o) => o.id === activeOrderId);
      if (!orderToAssign || orderToAssign.items.length === 0) {
        console.warn("Cannot assign an empty order to a table.");
        toast.error("Cart is empty", {
          duration: 4000,
          position: ToastPosition.BOTTOM,
        });
        return;
      }

      // For dine-in orders, check if the order is paid before assigning to table
      if (orderToAssign.order_type === "Dine In" && orderToAssign.paid_status !== "Paid") {
        toast.error("Order must be paid before assigning to table", {
          duration: 4000,
          position: ToastPosition.BOTTOM,
        });
        return;
      }

      // Update the current order with the table ID and set status to Preparing
      const updatedOrders = orders.map((o) =>
        o.id === activeOrderId
          ? {
            ...o,
            service_location_id: tableId,
            order_type: "Dine In" as const,
            order_status: "Preparing" as const,
          }
          : o
      );

      // Create a new, empty global "walk-in" order for the next customer
      const newGlobalOrder: OrderProfile = {
        id: `order_${Date.now()}`,
        service_location_id: null,
        order_status: "Building",
        order_type: "Take-Away",
        paid_status: "Unpaid",
        items: [],
        opened_at: new Date().toISOString(),
      };

      set({
        orders: [...updatedOrders, newGlobalOrder],
        // Set the new global order as the active one for the home screen
        activeOrderId: newGlobalOrder.id,
      });

      // Recalculate totals, which will now be zero for the active (new global) order
      recalculateTotals(get().activeOrderId);
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
            // Mark items as paid in FIFO order until amount is exhausted
            let remaining = amount;
            const updatedItems = o.items.map((item) => {
              const unitPrice = item.price; // price already includes customizations
              const unpaidQty = item.quantity - (item.paidQuantity || 0);
              if (remaining <= 0 || unpaidQty <= 0) return item;

              const maxCoverQty = Math.min(unpaidQty, Math.floor(remaining / unitPrice + 1e-6));
              if (maxCoverQty <= 0) return item;
              remaining -= maxCoverQty * unitPrice;
              return { ...item, paidQuantity: (item.paidQuantity || 0) + maxCoverQty };
            });

            return { ...o, payments: newPayments, items: updatedItems };
          }
          return o;
        }),
      }));
    },

    markOrderAsPaid: (orderId) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, paid_status: "Paid" } : o
        ),
      }));
    },

    setPendingTableSelection: (tableId) => {
      set({ pendingTableSelection: tableId });
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
