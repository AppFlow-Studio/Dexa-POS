import { toastService } from "@/lib/toastService";
import { CartItem, Discount, OrderProfile, PaymentType } from "@/lib/types";
import { create } from "zustand";
import { useCoursingStore } from "./useCoursingStore";
import { useEmployeeStore } from "./useEmployeeStore";
import { useFloorPlanStore } from "./useFloorPlanStore";
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
    status: "Preparing" | "Ready" | "Served"
  ) => void;
  setOpenedAt: (orderId: string, openedAt: string) => void;
  setClosedAt: (orderId: string, closedAt: string) => void;
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
  addPaymentToOrder: (paymentDetails: {
    orderId: string;
    amount: number;
    method: PaymentType;
    cardBrand?: string;
    last4?: string;
  }) => void;

  markOrderAsPaid: (orderId: string) => void;
  setPendingTableSelection: (tableId: string | null) => void;
  syncOrderStatus: (orderId: string) => void;

  archiveOrder: (orderId: string) => string | null; // Returns the tableId if it exists
  markAllItemsAsReady: (orderId: string) => void;
  markAllItemsAsServed: (orderId: string) => void;
  consolidateOrdersForTables: (
    tableIds: string[],
    tableNames: string[]
  ) => string;
  fireActiveOrderToKitchen: () => void;
  sendNewItemsToKitchen: () => void;
  sendNewItemsToKitchenForOrder: (orderId: string) => void;
  transferOrderToTable: (orderId: string, newTableId: string) => void;
  generateCartItemId: (
    menuItemId: string,
    customizations: CartItem["customizations"],
    isDraft?: boolean
  ) => string;
  deleteOrder: (orderId: string) => void;
  clearCart: () => void;
  voidOrder: (orderId: string) => void;
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
      const addOnIds = customizations.addOns.map((a) => a.id).sort();
      keyParts.push(`addons:${addOnIds.join(",")}`);
    }

    // Add modifiers (sorted for consistency)
    if (customizations.modifiers && customizations.modifiers.length > 0) {
      const modifierKeys = customizations.modifiers
        .map(
          (mod) =>
            `${mod.categoryId}:${mod.options
              .map((opt) => opt.id)
              .sort()
              .join(",")}`
        )
        .sort();
      keyParts.push(`modifiers:${modifierKeys.join("|")}`);
    }

    return keyParts.join("|");
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
    const modifiersA =
      custA.modifiers
        ?.map((mod) => ({
          categoryId: mod.categoryId,
          options: mod.options.map((opt) => opt.id).sort(),
        }))
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId)) || [];
    const modifiersB =
      custB.modifiers
        ?.map((mod) => ({
          categoryId: mod.categoryId,
          options: mod.options.map((opt) => opt.id).sort(),
        }))
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId)) || [];

    if (modifiersA.length !== modifiersB.length) {
      return false;
    }

    for (let i = 0; i < modifiersA.length; i++) {
      if (
        modifiersA[i].categoryId !== modifiersB[i].categoryId ||
        modifiersA[i].options.length !== modifiersB[i].options.length ||
        !modifiersA[i].options.every(
          (opt, idx) => opt === modifiersB[i].options[idx]
        )
      ) {
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
      const { activeEmployeeId, employees } = useEmployeeStore.getState();
      const activeEmployee = employees.find((e) => e.id === activeEmployeeId);

      const newOrder: OrderProfile = {
        id: `order_${Date.now()}`,
        service_location_id: details?.tableId || null,
        order_status: "Building",
        customer_name: "",
        check_status: "Opened",
        paid_status: "Unpaid",
        order_type: details?.tableId ? "Dine In" : "Takeaway",
        items: [],
        opened_at: null,
        guest_count: details?.guestCount || 1,
        server_name: activeEmployee?.fullName || "Unknown",
      };
      set((state) => ({ orders: [...state.orders, newOrder] }));
      return newOrder;
    },

    addItemToActiveOrder: (newItem) => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const activeOrder = orders.find((o) => o.id === activeOrderId);
      if (!activeOrder) return;

      const coursingState = useCoursingStore.getState();
      const currentCourse =
        coursingState.getForOrder(activeOrderId)?.currentCourse ?? 1;
      const newItemKey = generateItemCompositeKey(
        newItem.menuItemId,
        newItem.customizations
      );

      let updatedCart: CartItem[] = activeOrder.items;

      // 1. If newItem is NOT a draft, remove any existing drafts for this MenuItemId
      if (!newItem.isDraft) {
        updatedCart = updatedCart.filter(
          (item) => !(item.isDraft && item.menuItemId === newItem.menuItemId)
        );
      }

      // 2. Find a potential candidate for merging with the (possibly filtered) cart
      const mergeCandidate = updatedCart.find((cartItem) => {
        // Must be a "new" item, not a draft, and in the same course
        if (
          cartItem.isDraft ||
          (cartItem.kitchen_status && cartItem.kitchen_status !== "new")
        ) {
          return false;
        }
        const existingItemCourse =
          coursingState.getForOrder(activeOrderId)?.itemCourseMap?.[
            cartItem.id
          ] ?? 1;
        if (existingItemCourse !== currentCourse) {
          return false;
        }
        // Must have the exact same customizations
        const existingItemKey = generateItemCompositeKey(
          cartItem.menuItemId,
          cartItem.customizations
        );
        return existingItemKey === newItemKey;
      });

      if (mergeCandidate) {
        // 3. If a candidate exists, create a new cart array with the updated quantity
        updatedCart = updatedCart.map((item) =>
          item.id === mergeCandidate.id
            ? { ...item, quantity: item.quantity + newItem.quantity }
            : item
        );
      } else {
        // 4. If no candidate, create a new item and add it to a new cart array
        const newCartItem: CartItem = {
          ...newItem,
          paidQuantity: 0,
          item_status:
            activeOrder.order_type === "Dine In" ? "Preparing" : undefined,
          kitchen_status: newItem.isDraft ? undefined : ("new" as const), // Only mark as 'new' if not a draft
        };
        updatedCart = [...updatedCart, newCartItem];
        coursingState.setItemCourse(
          activeOrderId,
          newCartItem.id,
          currentCourse
        );
      }

      // 5. Update the state with the new cart array
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId ? { ...o, items: updatedCart } : o
        ),
      }));

      recalculateTotals(activeOrderId);
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
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const activeOrder = orders.find((o) => o.id === activeOrderId);
      if (!activeOrder) return;

      // Find the item being updated
      const itemToUpdate = activeOrder.items.find((i) => i.id === itemId);

      // Trigger inventory depletion when an item is marked as "Ready" or "Served"
      if ((status === "Ready" || status === "Served") && itemToUpdate) {
        useInventoryStore.getState().decrementStockFromItem(itemToUpdate);
      }

      set((state) => {
        const updatedOrders = state.orders.map((o) => {
          if (o.id === activeOrderId) {
            const updatedItems = o.items.map((i) => {
              if (i.id === itemId) {
                const updatedItem = { ...i, item_status: status };

                // Update kitchen_status based on item_status
                if (
                  status === "Preparing" &&
                  (!i.kitchen_status || i.kitchen_status === "new")
                ) {
                  updatedItem.kitchen_status = "sent";
                } else if (status === "Ready") {
                  updatedItem.kitchen_status = "ready";
                } else if (status === "Served") {
                  updatedItem.kitchen_status = "served";
                }

                return updatedItem;
              }
              return i;
            });

            // Only sync order status for dine-in orders that are assigned to tables
            // Don't sync for orders that are still being built or takeaway orders
            if (
              o.order_type === "Dine In" &&
              o.order_status !== "Building" &&
              o.service_location_id !== null
            ) {
              const allItemsServed = updatedItems.every(
                (item) => item.item_status === "Served"
              );
              const allItemsReady = updatedItems.every(
                (item) =>
                  item.item_status === "Ready" || item.item_status === "Served"
              );
              const anyItemsPreparing = updatedItems.some(
                (item) => item.item_status === "Preparing"
              );

              let newOrderStatus = o.order_status;
              if (allItemsServed && updatedItems.length > 0) {
                newOrderStatus = "Served";
              } else if (allItemsReady && updatedItems.length > 0) {
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
        toastService.show({
          title: "Empty Cart",
          message: "Cannot assign an empty order to a table.",
          type: "error",
        });
        return;
      }

      // For dine-in orders, check if the order is paid before assigning to table
      if (
        orderToAssign.order_type === "Dine In" &&
        orderToAssign.paid_status !== "Paid"
      ) {
        toastService.show({
          title: "Payment Required",
          message:
            "This order must be paid before it can be assigned to a table.",
          type: "error",
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

    addPaymentToOrder: ({ orderId, amount, method, cardBrand, last4 }) => {
      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === orderId) {
            const newPayment = {
              amount,
              method,
              ...(cardBrand && { cardBrand }),
              ...(last4 && { last4 }),
            };

            const newPayments = [...(o.payments || []), newPayment];

            // Mark items as paid in FIFO order until amount is exhausted
            let remaining = amount;
            const updatedItems = o.items.map((item) => {
              const unitPrice = item.price;
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

      // Trigger inventory depletion when order is paid (alternative trigger point)
      if (
        order.items.length > 0 &&
        order.order_status !== "Ready" &&
        order.order_status !== "Served"
      ) {
        useInventoryStore.getState().decrementStockFromSale(order.items);
      }

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

      if (!order) return null;

      // Trigger stock deduction before archiving
      if (order.items.length > 0) {
        useInventoryStore.getState().decrementStockFromSale(order.items);
      }

      const tableId = order.service_location_id;

      // Ensure the order has a final status. If not "Voided", set it to "Closed".
      const finalOrder = {
        ...order,
        order_status:
          order.order_status === "Voided" ? ("Voided" as const) : ("Closed" as const),
        closed_at: order.closed_at || new Date().toISOString(),
        total_amount:
          order.total_amount ||
          order.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          ) ||
          0,
        total_tax:
          order.total_tax ||
          (order.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          ) || 0) * TAX_RATE,
      };

      // Save to previous orders
      const { addOrderToHistory } = usePreviousOrdersStore.getState();
      addOrderToHistory(finalOrder);

      // Finally, remove the order from the active orders list
      set((state) => ({
        orders: state.orders.filter((o) => o.id !== orderId),
        activeOrderId:
          state.activeOrderId === orderId ? null : state.activeOrderId,
      }));

      recalculateTotals(null);

      return tableId;
    },
    setOpenedAt: (orderId, openedAt) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, opened_at: openedAt } : o
        ),
      }));
    },
    setClosedAt: (orderId, closedAt) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, closed_at: closedAt } : o
        ),
      }));
    },
    markAllItemsAsReady: (orderId) => {
      const { orders } = get();
      const order = orders.find((o) => o.id === orderId);

      if (!order) return;

      if (order.items.length > 0) {
        useInventoryStore.getState().decrementStockFromSale(order.items);
      }

      const mergedItemsMap = new Map<string, CartItem>();

      for (const item of order.items) {
        // Don't process draft items
        if (item.isDraft) continue;

        const itemKey = generateItemCompositeKey(
          item.menuItemId,
          item.customizations
        );

        if (mergedItemsMap.has(itemKey)) {
          // If this item already exists in our map, just update its quantity
          const existingItem = mergedItemsMap.get(itemKey)!;
          existingItem.quantity += item.quantity;
        } else {
          // If it's the first time we've seen this item, add it to the map
          // and set its status to Ready.
          mergedItemsMap.set(itemKey, {
            ...item,
            item_status: "Ready" as const,
            kitchen_status: "ready" as const,
          });
        }
      }

      // Convert the map back to an array of items
      const updatedItems = Array.from(mergedItemsMap.values());

      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === orderId) {
            return {
              ...o,
              items: updatedItems, // Use the new, consolidated list
              order_status: "Ready" as const,
            };
          }
          return o;
        }),
      }));
    },

    markAllItemsAsServed: (orderId) => {
      const { orders } = get();
      const order = orders.find((o) => o.id === orderId);

      if (!order) return;

      // Trigger inventory depletion when all items are marked as served
      if (order.items.length > 0) {
        useInventoryStore.getState().decrementStockFromSale(order.items);
      }

      set((state) => ({
        orders: state.orders.map((order) => {
          if (order.id === orderId) {
            // Create a new items array where every item's status is "Served"
            const updatedItems = order.items.map((item) => ({
              ...item,
              item_status: "Served" as const, // Use 'as const' for strict typing
              kitchen_status: "served" as const, // Update kitchen status to served
            }));

            // Return the order with the updated items and the overall order status also set to "Served"
            return {
              ...order,
              items: updatedItems,
              order_status: "Served" as const,
            };
          }
          return order;
        }),
      }));
    },
    consolidateOrdersForTables: (tableIds, tableNames) => {
      const { orders, startNewOrder } = get();
      const ordersToMerge = orders.filter(
        (o) => o.service_location_id && tableIds.includes(o.service_location_id)
      );

      const allItems = ordersToMerge.flatMap((o) => o.items);
      const oldOrderIds = ordersToMerge.map((o) => o.id);
      const primaryTableId = tableIds[0];

      // 1. Find the earliest start time ONLY if one already exists.
      const earliestStartTime = ordersToMerge.reduce(
        (earliest: number | null, currentOrder) => {
          if (currentOrder.opened_at) {
            const currentOpenTime = new Date(currentOrder.opened_at).getTime();
            // If earliest is null or current time is earlier, update.
            if (earliest === null || currentOpenTime < earliest) {
              return currentOpenTime;
            }
          }
          return earliest;
        },
        null // Initialize with null
      );

      const newMergedOrderData = {
        id: `order_${Date.now()}`,
        service_location_id: primaryTableId,
        order_status: "Preparing" as const,
        order_type: "Dine In" as const,
        check_status: "Opened" as const,
        paid_status: "Unpaid" as const,
        items: allItems,
        server_name: ordersToMerge[0]?.server_name || "Unknown",
        guest_count: ordersToMerge.reduce(
          (sum, o) => sum + (o.guest_count || 1),
          0
        ),
        opened_at: earliestStartTime
          ? new Date(earliestStartTime).toISOString()
          : null,
        customer_name: `Merged Table (${tableNames.join(", ")})`,
      };

      set((state) => {
        const newOrdersList = state.orders.filter(
          (o) => !oldOrderIds.includes(o.id)
        );
        newOrdersList.push(newMergedOrderData);
        return { orders: newOrdersList };
      });

      const finalMergedOrderId = newMergedOrderData.id;
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
        const startTime = o.opened_at ? o.opened_at : new Date().toISOString();
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
          opened_at: startTime,
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
      toastService.show({
        title: "Order Sent",
        message: "The order has been successfully sent to the kitchen.",
        type: "success",
      });
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
    sendNewItemsToKitchen: () => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const currentOrder = orders.find((o) => o.id === activeOrderId);
      if (!currentOrder) return;

      const newItems = currentOrder.items.filter(
        (item) => !item.kitchen_status || item.kitchen_status === "new"
      );

      if (newItems.length === 0) return;

      let cartToProcess = [...currentOrder.items];
      const itemsToKeep: CartItem[] = [];
      const mergedItemIds = new Set<string>();

      // Iterate through each new item to see if it can be merged
      for (const newItem of newItems) {
        // Find a candidate for merging (must be already 'sent' and identical)
        const mergeCandidate = cartToProcess.find((item) => {
          if (item.id === newItem.id) return false; // Don't match self
          if (item.kitchen_status !== "sent") return false; // Must be already sent

          const key1 = generateItemCompositeKey(
            item.menuItemId,
            item.customizations
          );
          const key2 = generateItemCompositeKey(
            newItem.menuItemId,
            newItem.customizations
          );

          return key1 === key2;
        });

        if (mergeCandidate) {
          // If we found a match, update its quantity in the final list
          const existingInFinal = itemsToKeep.find(
            (i) => i.id === mergeCandidate.id
          );
          if (existingInFinal) {
            existingInFinal.quantity += newItem.quantity;
          } else {
            const updatedCandidate = {
              ...mergeCandidate,
              quantity: mergeCandidate.quantity + newItem.quantity,
            };
            itemsToKeep.push(updatedCandidate);
          }
          mergedItemIds.add(mergeCandidate.id); // Mark original as processed
        } else {
          // If no merge candidate, just mark this new item as 'sent' and add it
          itemsToKeep.push({
            ...newItem,
            kitchen_status: "sent",
            item_status: "Preparing",
          });
        }
      }

      // Add back all items that were not part of the merge logic (drafts, other sent items)
      const finalCart = [
        ...itemsToKeep,
        ...cartToProcess.filter((item) => {
          const isNew = !item.kitchen_status || item.kitchen_status === "new";
          const wasMerged = mergedItemIds.has(item.id);
          // Keep if it's not a new item and was not a merge target
          return !isNew && !wasMerged;
        }),
      ];

      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === activeOrderId) {
            return {
              ...o,
              items: finalCart, // Use the newly constructed final cart
              order_status: "Preparing",
            };
          }
          return o;
        }),
      }));

      recalculateTotals(activeOrderId); // Recalculate totals after merging

      toastService.show({
        title: "Items Sent",
        message: `${newItems.length} new item${
          newItems.length > 1 ? "s" : ""
        } sent to the kitchen.`,
        type: "success",
      });
    },

    sendNewItemsToKitchenForOrder: (orderId: string) => {
      set((state) => {
        const order = state.orders.find((o) => o.id === orderId);
        if (
          !order ||
          order.items.filter(
            (item) => !item.kitchen_status || item.kitchen_status === "new"
          ).length === 0
        ) {
          return state; // No new items to send, no state change
        }

        return {
          orders: state.orders.map((o) => {
            if (o.id === orderId) {
              const updatedItems = o.items.map((item) => {
                if (!item.kitchen_status || item.kitchen_status === "new") {
                  return {
                    ...item,
                    kitchen_status: "sent" as const,
                    item_status: "Preparing" as const,
                  };
                }
                return item;
              });

              // Check if the timer needs to be started
              const shouldStartTimer =
                o.order_type === "Dine In" && !o.opened_at;

              return {
                ...o,
                items: updatedItems,
                order_status: "Preparing",
                // Set opened_at timestamp if it's not already set for a Dine In order
                opened_at: shouldStartTimer
                  ? new Date().toISOString()
                  : o.opened_at,
              } as OrderProfile;
            }
            return o;
          }),
        };
      });

      // Show toast after the state update
      toastService.show({
        title: "Items Sent",
        message: "New items have been sent to the kitchen.",
        type: "success",
      });
    },

    generateCartItemId: (menuItemId, customizations, isDraft = false) => {
      return generateCartItemId(menuItemId, customizations, isDraft);
    },
    deleteOrder: (orderId: string) => {
      set((state) => ({
        orders: state.orders.filter((o) => o.id !== orderId),
      }));
    },
    clearCart: () => {
      const { activeOrderId } = get();
      if (!activeOrderId) return;

      set((state) => ({
        orders: state.orders.map(
          (o) => (o.id === activeOrderId ? { ...o, items: [] } : o) // Set items to an empty array
        ),
      }));

      // After clearing the cart, recalculate totals to update them to $0.00
      recalculateTotals(activeOrderId);

      toastService.show({
        title: "Cart Cleared",
        message: "All items have been removed from the current order.",
        type: "success",
      });
    },
    voidOrder: (orderId: string) => {
      const { archiveOrder } = get();

      // Update the order's status
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId
            ? { ...o, order_status: "Voided", check_status: "Closed" }
            : o
        ),
      }));

      // Directly call archiveOrder after the state has been updated
      archiveOrder(orderId);
    },
  };
});
