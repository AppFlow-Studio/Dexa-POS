import { CartItem, Discount, OrderProfile, PaymentType } from "@/lib/types";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { create } from "zustand";
import { useInventoryStore } from "./useInventoryStore";
import { usePreviousOrdersStore } from "./usePreviousOrdersStore";

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
  startNewOrder: (details?: {
    tableId?: string;
    guestCount?: number;
  }) => OrderProfile;
  addItemToActiveOrder: (newItem: CartItem) => void;
  updateItemInActiveOrder: (updatedItem: CartItem) => void;
  removeItemFromActiveOrder: (itemId: string) => void;
  confirmDraftItem: (itemId: string) => void;
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
  syncOrderStatus: (orderId: string) => void;

  archiveOrder: (orderId: string) => string | null; // Returns the tableId if it exists
  markAllItemsAsReady: (orderId: string) => void;
  consolidateOrdersForTables: (
    tableIds: string[],
    tableNames: string[]
  ) => string;
  fireActiveOrderToKitchen: () => void;
  sendNewItemsToKitchen: () => void;
  transferOrderToTable: (orderId: string, newTableId: string) => void;
  generateCartItemId: (menuItemId: string, customizations: CartItem["customizations"], isDraft?: boolean) => string;
}

export const useOrderStore = create<OrderState>((set, get) => {
  // --- PRIVATE HELPER FUNCTION ---
  // This function calculates and sets the totals for the currently active order.

  // Helper function to sync order status based on item statuses
  const syncOrderStatus = (orderId: string) => {
    const { orders } = get();
    const order = orders.find((o) => o.id === orderId);
    if (!order || !order.items.length) return;

    // Only sync order status for orders that are assigned to tables or in kitchen workflow
    // Don't sync for orders that are still being built
    if (
      order.order_status === "Building" ||
      order.service_location_id === null
    ) {
      return;
    }

    // For dine-in orders, sync based on individual item statuses
    if (order.order_type === "Dine In") {
      const allItemsReady = order.items.every(
        (item) => item.item_status === "Ready"
      );
      const anyItemsPreparing = order.items.some(
        (item) => item.item_status === "Preparing"
      );

      let newOrderStatus = order.order_status;
      if (allItemsReady) {
        newOrderStatus = "Ready";
      } else if (anyItemsPreparing) {
        newOrderStatus = "Preparing";
      }

      if (newOrderStatus !== order.order_status) {
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === orderId ? { ...o, order_status: newOrderStatus } : o
          ),
        }));
      }
    }
    // For takeaway orders, the order status is managed manually (not based on item statuses)
  };
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

      // Compute outstanding subtotal (unpaid amount) used for badges/logic
      const outstandingSubtotal = activeOrder.items.reduce((acc, item) => {
        const unpaidQty = item.quantity - (item.paidQuantity || 0);
        return acc + unpaidQty * item.price;
      }, 0);

      // This is a fair way to distribute a check-level discount.
      const proportionOfSubtotalOutstanding =
        subtotal > 0 ? outstandingSubtotal / subtotal : 0;
      const outstandingDiscountAmount =
        totalDiscountAmount * proportionOfSubtotalOutstanding; // This line was causing the redeclaration error

      // Calculate the final outstanding total, including discounts
      const outstandingSubtotalAfterDiscount =
        outstandingSubtotal - outstandingDiscountAmount;
      const outstandingTax = outstandingSubtotalAfterDiscount * TAX_RATE;
      const outstandingTotal =
        outstandingSubtotalAfterDiscount + outstandingTax;

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
          outstandingSubtotal > 1e-6 &&
          activeOrder.paid_status === "Paid"
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

  // --- Helper function to generate a unique composite key for cart items ---
  const generateItemCompositeKey = (
    menuItemId: string,
    customizations: CartItem["customizations"]
  ): string => {
    const keyParts: string[] = [menuItemId];

    // Add size information
    if (customizations.size?.id) {
      keyParts.push(`size:${customizations.size.id}`);
    }

    // Add notes
    if (customizations.notes) {
      keyParts.push(`notes:${customizations.notes.trim()}`);
    }

    // Add add-ons (sorted for consistency)
    if (customizations.addOns && customizations.addOns.length > 0) {
      const addOnIds = customizations.addOns.map(a => a.id).sort();
      keyParts.push(`addons:${addOnIds.join(',')}`);
    }

    // Add modifiers (sorted for consistency)
    if (customizations.modifiers && customizations.modifiers.length > 0) {
      const modifierKeys = customizations.modifiers
        .map(mod => `${mod.categoryId}:${mod.options.map(opt => opt.id).sort().join(',')}`)
        .sort();
      keyParts.push(`modifiers:${modifierKeys.join('|')}`);
    }

    return keyParts.join('|');
  };

  // --- Helper function to generate a unique CartItem ID ---
  const generateCartItemId = (
    menuItemId: string,
    customizations: CartItem["customizations"],
    isDraft: boolean = false
  ): string => {
    const compositeKey = generateItemCompositeKey(menuItemId, customizations);
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);

    if (isDraft) {
      return `draft_${compositeKey}_${timestamp}`;
    }

    return `${compositeKey}_${timestamp}_${randomSuffix}`;
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
    // 4. Check if modifiers are the same
    const modifiersA = custA.modifiers?.map(mod => ({
      categoryId: mod.categoryId,
      options: mod.options.map(opt => opt.id).sort()
    })).sort((a, b) => a.categoryId.localeCompare(b.categoryId)) || [];
    const modifiersB = custB.modifiers?.map(mod => ({
      categoryId: mod.categoryId,
      options: mod.options.map(opt => opt.id).sort()
    })).sort((a, b) => a.categoryId.localeCompare(b.categoryId)) || [];

    if (modifiersA.length !== modifiersB.length) {
      return false;
    }

    for (let i = 0; i < modifiersA.length; i++) {
      if (modifiersA[i].categoryId !== modifiersB[i].categoryId ||
        modifiersA[i].options.length !== modifiersB[i].options.length ||
        !modifiersA[i].options.every((opt, idx) => opt === modifiersB[i].options[idx])) {
        return false;
      }
    }

    // 5. If all checks pass, they are equal
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

    startNewOrder: (details) => {
      const newOrder: OrderProfile = {
        id: `order_${Date.now()}`,
        service_location_id: details?.tableId || null,
        order_status: "Building",
        customer_name: "",
        check_status: "Opened",
        paid_status: "Unpaid",
        order_type: details?.tableId ? "Dine In" : "Take Away",
        items: [],
        opened_at: new Date().toISOString(),
        guest_count: details?.guestCount || 1,
      };
      set((state) => ({ orders: [...state.orders, newOrder] }));
      return newOrder;
    },

    addItemToActiveOrder: (newItem) => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const activeOrder = orders.find((o) => o.id === activeOrderId);
      if (!activeOrder) return;

      // Generate composite key for the new item
      const newItemKey = generateItemCompositeKey(newItem.menuItemId, newItem.customizations);

      // Find an existing item in the cart that has the exact same composite key
      const existingItemIndex = activeOrder.items.findIndex((cartItem) => {
        const existingItemKey = generateItemCompositeKey(cartItem.menuItemId, cartItem.customizations);
        return existingItemKey === newItemKey;
      });

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
                    item_status: "Preparing",
                    // Newly added quantities are unpaid
                    paidQuantity: item.paidQuantity || 0,
                    // If existing item was already sent, keep it as sent
                    // If it was new, keep it as new (new quantities are also new)
                    kitchen_status: item.kitchen_status || "new",
                  };
                }
                return item;
              });
            } else {
              // --- Add New Item Logic ---
              // For dine-in orders, set item_status to "Preparing" when assigned to table
              // For takeaway orders, don't set item_status (whole order is managed together)
              const shouldSetItemStatus =
                o.order_type === "Dine In" &&
                o.order_status !== "Building" &&
                o.service_location_id !== null;

              updatedCart = [
                ...o.items,
                {
                  ...newItem,
                  paidQuantity: newItem.paidQuantity ?? 0,
                  item_status: shouldSetItemStatus ? "Preparing" : undefined,
                  kitchen_status: "new",
                },
              ];
            }

            // Only sync order status for dine-in orders that are assigned to tables
            // Don't sync for orders that are still being built or takeaway orders
            if (
              o.order_type === "Dine In" &&
              o.order_status !== "Building" &&
              o.service_location_id !== null
            ) {
              const allItemsReady = updatedCart.every(
                (item) => item.item_status === "Ready"
              );
              const anyItemsPreparing = updatedCart.some(
                (item) => item.item_status === "Preparing"
              );

              let newOrderStatus = o.order_status;
              if (allItemsReady && updatedCart.length > 0) {
                newOrderStatus = "Ready";
              } else if (anyItemsPreparing) {
                newOrderStatus = "Preparing";
              }

              return {
                ...o,
                items: updatedCart,
                order_status: newOrderStatus,
              };
            }

            // For orders still being built or takeaway orders, just update the cart without changing order status
            return {
              ...o,
              items: updatedCart,
            };
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

      set((state) => {
        const updatedOrders = state.orders.map((o) => {
          if (o.id === activeOrderId) {
            const updatedItems = o.items.map((i) =>
              i.id === itemId ? { ...i, item_status: status } : i
            );

            // Only sync order status for dine-in orders that are assigned to tables
            // Don't sync for orders that are still being built or takeaway orders
            if (
              o.order_type === "Dine In" &&
              o.order_status !== "Building" &&
              o.service_location_id !== null
            ) {
              const allItemsReady = updatedItems.every(
                (item) => item.item_status === "Ready"
              );
              const anyItemsPreparing = updatedItems.some(
                (item) => item.item_status === "Preparing"
              );

              let newOrderStatus = o.order_status;
              if (allItemsReady && updatedItems.length > 0) {
                newOrderStatus = "Ready";
              } else if (anyItemsPreparing) {
                newOrderStatus = "Preparing";
              }

              return {
                ...o,
                items: updatedItems,
                order_status: newOrderStatus,
              };
            }

            // For orders still being built or takeaway orders, just update the items without changing order status
            return {
              ...o,
              items: updatedItems,
            };
          }
          return o;
        });

        return { orders: updatedOrders };
      });
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

    confirmDraftItem: (itemId) => {
      const { activeOrderId } = get();
      if (!activeOrderId) return;

      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId
            ? {
              ...o,
              items: o.items.map((i) =>
                i.id === itemId ? { ...i, isDraft: false } : i
              ),
            }
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
          o.id === orderId ? { ...o, service_location_id: tableId } : o
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
      if (
        orderToAssign.order_type === "Dine In" &&
        orderToAssign.paid_status !== "Paid"
      ) {
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
        check_status: "Opened",
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
        orders: state.orders.map((o) => {
          if (o.id !== orderId) return o;
          // Keep check_status in sync for terminal states
          const next: Partial<OrderProfile> = { order_status: status } as any;
          if (status === "Closed" || status === "Voided") {
            (next as any).check_status = "Closed";
          }
          return { ...o, ...next };
        }),
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

              const maxCoverQty = Math.min(
                unpaidQty,
                Math.floor(remaining / unitPrice + 1e-6)
              );
              if (maxCoverQty <= 0) return item;
              remaining -= maxCoverQty * unitPrice;
              return {
                ...item,
                paidQuantity: (item.paidQuantity || 0) + maxCoverQty,
              };
            });

            return { ...o, payments: newPayments, items: updatedItems };
          }
          return o;
        }),
      }));
    },

    markOrderAsPaid: (orderId: string) => {
      const { orders, activeOrderDiscount } = get();
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;

      // Calculate total based on items (this is the subtotal)
      const subtotal = order.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      // The final subtotal is the subtotal MINUS the calculated discount
      const finalSubtotal = subtotal - activeOrderDiscount;
      const tax = finalSubtotal * TAX_RATE;
      const total = finalSubtotal + tax;

      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId
            ? {
              ...o,
              paid_status: "Paid",
              check_status: "Closed",
              total_amount: total, // Save the correct final total
              total_tax: tax,
              total_discount: activeOrderDiscount, // Save the discount amount
            }
            : o
        ),
      }));
    },

    setPendingTableSelection: (tableId) => {
      set({ pendingTableSelection: tableId });
    },

    syncOrderStatus: (orderId) => {
      syncOrderStatus(orderId);
    },

    archiveOrder: (orderId: string) => {
      const { orders } = get();
      const order = orders.find((o) => o.id === orderId);

      // Trigger stock deduction before archiving ---
      if (order && order.items.length > 0) {
        useInventoryStore.getState().decrementStockFromSale(order.items);
      }

      let tableId: string | null = null;

      // Calculate total before closing
      const total =
        order?.items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        ) || 0;
      const tax = total * TAX_RATE;

      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === order?.id) {
            tableId = o.service_location_id;
            return {
              ...o,
              order_status: "Closed",
              closed_at: new Date().toISOString(),
              total_amount: total + tax,
              total_tax: tax,
            };
          }
          return o;
        }),
      }));

      // Save to previous orders when closed
      if (order) {
        const { addOrderToHistory } = usePreviousOrdersStore.getState();
        // Pass the updated order with totals
        const updatedOrder = {
          ...order,
          order_status: "Closed" as const,
          closed_at: new Date().toISOString(),
          total_amount: total + tax,
          total_tax: tax,
        };
        addOrderToHistory(updatedOrder);
      }

      // After closing, there is no active order
      // set({ activeOrderId: null });
      recalculateTotals(null);

      return tableId;
    },
    markAllItemsAsReady: (orderId) => {
      set((state) => ({
        orders: state.orders.map((order) => {
          if (order.id === orderId) {
            // Create a new items array where every item's status is "Ready"
            const updatedItems = order.items.map((item) => ({
              ...item,
              item_status: "Ready" as const, // Use 'as const' for strict typing
              kitchen_status: "ready" as const, // Update kitchen status to ready
            }));

            // Return the order with the updated items and the overall order status also set to "Ready"
            return {
              ...order,
              items: updatedItems,
              order_status: "Ready" as const,
            };
          }
          return order;
        }),
      }));
      const { orders } = get();
      const order = orders.find((o) => o.id === orderId);

      // if (order?.order_type === "Take Away") {
      //   //if order type is take away then add it archive after ready
      //   get().archiveOrder(orderId);
      // }
    },
    consolidateOrdersForTables: (tableIds, tableNames) => {
      const { orders, startNewOrder } = get();
      const ordersToMerge = orders.filter(
        (o) => o.service_location_id && tableIds.includes(o.service_location_id)
      );

      const allItems = ordersToMerge.flatMap((o) => o.items);
      const oldOrderIds = ordersToMerge.map((o) => o.id);
      const primaryTableId = tableIds[0];

      // Create a new order object with all necessary properties
      const newMergedOrderData = {
        id: `order_${Date.now()}`,
        service_location_id: primaryTableId,
        order_status: "Preparing" as const, // Start as preparing
        order_type: "Dine In" as const,
        check_status: "Opened" as const,
        paid_status: "Unpaid" as const,
        items: allItems,
        opened_at: new Date().toISOString(),
        customer_name: `Merged Table (${tableNames.join(", ")})`,
      };

      set((state) => {
        // Remove all old orders and add the new one
        const newOrdersList = state.orders.filter(
          (o) => !oldOrderIds.includes(o.id)
        );
        newOrdersList.push(newMergedOrderData);
        return { orders: newOrdersList };
      });

      const finalMergedOrderId = newMergedOrderData.id;
      // recalculateTotals(finalMergedOrderId);

      return finalMergedOrderId;
    },
    fireActiveOrderToKitchen: () => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;
      const currentOrder = orders.find((o) => o.id === activeOrderId);
      if (!currentOrder) return;
      if ((currentOrder.items?.length || 0) === 0) return;
      // If already fired (not in Building), do nothing
      if (currentOrder.order_status !== "Building") return;

      const updatedOrders = orders.map((o) => {
        if (o.id !== activeOrderId) return o;
        const updatedItems = o.items.map((item) => ({
          ...item,
          item_status: "Preparing" as const,
        }));
        return {
          ...o,
          items: updatedItems,
          order_status: "Preparing" as const,
          check_status: "Opened" as const,
          paid_status: o.paid_status === "Paid" ? "Paid" : "Unpaid",
          order_type: o.order_type,
        } as OrderProfile;
      });

      const newOrder: OrderProfile = {
        id: `order_${Date.now()}`,
        service_location_id: null,
        order_status: "Building",
        check_status: "Opened",
        paid_status: "Unpaid",
        items: [],
        opened_at: new Date().toISOString(),
      };

      set({ orders: [...updatedOrders, newOrder], activeOrderId: newOrder.id });
      // Totals for the new active (empty) order become zero
      recalculateTotals(newOrder.id);
      try {
        toast.success("Order sent to kitchen", {
          duration: 2500,
          position: ToastPosition.BOTTOM,
        });
      } catch { }
    },
    sendNewItemsToKitchen: () => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const currentOrder = orders.find((o) => o.id === activeOrderId);
      if (!currentOrder) return;

      // Filter items that are new (not yet sent to kitchen)
      const newItems = currentOrder.items.filter(item =>
        item.kitchen_status === "new" || !item.kitchen_status
      );

      if (newItems.length === 0) return;

      // Update only the new items to "sent" status
      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === activeOrderId) {
            return {
              ...o,
              items: o.items.map((item) => {
                // Only update items that are new
                if (item.kitchen_status === "new" || !item.kitchen_status) {
                  return {
                    ...item,
                    kitchen_status: "sent" as const,
                    item_status: "Preparing" as const,
                  };
                }
                return item;
              }),
              // Update order status to Preparing if it was Building
              order_status: o.order_status === "Building" ? "Preparing" as const : o.order_status,
            };
          }
          return o;
        }),
      }));

      try {
        toast.success(`${newItems.length} item${newItems.length > 1 ? 's' : ''} sent to kitchen`, {
          duration: 2500,
          position: ToastPosition.BOTTOM,
        });
      } catch { }
    },
    transferOrderToTable: (orderId, newTableId) => {
      set((state) => ({
        orders: state.orders.map((order) =>
          order.id === orderId
            ? { ...order, service_location_id: newTableId }
            : order
        ),
      }));
    },
    generateCartItemId: (menuItemId, customizations, isDraft = false) => {
      return generateCartItemId(menuItemId, customizations, isDraft);
    },
  };
});
