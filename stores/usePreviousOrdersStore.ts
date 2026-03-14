import { OrderProfile, PaymentType, PreviousOrder } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { RefundService } from "@/services/refundService";
import type { RefundReasonType, RefundRequest } from "@/types/refunds";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  FetchedOrderData,
  normalizeFetchedOrder,
  transformBroadcastToOrder,
} from "@/utils/orderTransformers";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";

// Global client reference
let _supabaseClient: SupabaseClient | null = null;
export const setPreviousOrdersSupabaseClient = (
  client: SupabaseClient | null,
) => {
  _supabaseClient = client;
};

interface RefundItem {
  itemId: string;
  quantity: number;
  reason: string;
  refundedAt: string;
  refundedBy: string;
}

interface RefundRecord {
  id: string;
  orderId: string;
  type: "full" | "partial";
  items: RefundItem[];
  totalRefunded: number;
  reason: string;
  refundedAt: string;
  refundedBy: string;
  paymentMethod: PaymentType;
}

const toRefundReasonType = (reason: string): RefundReasonType => {
  switch (reason) {
    case "customer_request":
    case "item_quality":
    case "wrong_item":
    case "never_received":
    case "duplicate_charge":
    case "price_adjustment":
    case "order_cancelled":
    case "kitchen_error":
    case "manager_comp":
    case "other":
      return reason;
    default:
      return "other";
  }
};


interface PreviousOrdersState {
  previousOrders: PreviousOrder[];
  refunds: RefundRecord[];
  newOrdersCount: number; // Tracks how many new orders are available on server
  _orderLookup: Record<string, PreviousOrder>;

  // Actions
  addOrderToHistory: (order: OrderProfile) => void;
  getOrderById: (orderId: string) => PreviousOrder | undefined;
  searchOrders: (query: string) => PreviousOrder[];
  getOrdersByDate: (date: Date) => PreviousOrder[];
  refreshPreviousOrders: () => Promise<void>; // Full refresh from backend
  checkForNewOrders: () => Promise<number>; // Check for new orders (lightweight)
  clearNewOrdersCount: () => void; // Reset new orders counter

  // Refund actions
  refundFullOrder: (
    orderId: string,
    reason: string,
    refundedBy: string,
    paymentMethod: PaymentType,
  ) => Promise<void>;
  refundItems: (
    orderId: string,
    items: Array<{ itemId: string; quantity: number; reason: string }>,
    refundedBy: string,
    paymentMethod: PaymentType,
  ) => Promise<void>;
  getRefundsForOrder: (orderId: string) => RefundRecord[];
}

export const usePreviousOrdersStore = create<PreviousOrdersState>(
  (set, get) => ({
    previousOrders: [],
    refunds: [],
    newOrdersCount: 0,
    _orderLookup: {},

    addOrderToHistory: (order: OrderProfile) => {
      // An order should be added to history if it has reached a final state.
      // Final states are:
      // 1. Order Status: completed, void, or cancelled (order lifecycle complete)
      // 2. Check Status: Closed (dine-in check has been closed for audit trail)
      // 3. Payment Status: Paid (order has been fully paid regardless of other status)

      const isFinalOrderStatus =
        order.order_status === "completed" ||
        order.order_status === "void" ||
        order.order_status === "cancelled";

      const isClosedCheck = order.check_status === "Closed";

      const isPaid = order.paid_status === "Paid";

      const isFinalState = isFinalOrderStatus || isClosedCheck || isPaid;

      if (!isFinalState) {
        return;
      }

      // Check if order already exists in history (O(1) lookup)
      const lookup = get()._orderLookup;
      const lookupKey = order.db_order_id || order.id;
      if (lookup[lookupKey]) {
        return; // Don't add duplicates
      }

      // Use the actual order timestamp, not current time
      const orderTimestamp = order.opened_at || new Date().toISOString();
      const orderDate = new Date(orderTimestamp);

      const serialNo = (get().previousOrders.length + 1)
        .toString()
        .padStart(3, "0");

      // Calculate total from items if total_amount is not available
      const finalTotal = order.total_amount || 0;

      // Determine order type with proper casting
      const orderType = (order.order_type || "Dine In") as
        | "Dine In"
        | "Takeaway"
        | "Delivery";

      const previousOrder: PreviousOrder = {
        serialNo,
        // Store ISO timestamp for filtering/sorting
        timestamp: orderTimestamp,
        // Keep formatted strings for display
        orderDate: orderDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        orderTime: orderDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        orderId: order.id,
        display_number: order.display_number || `#${serialNo}`,
        paymentStatus: order.paid_status === "Paid" ? "Paid" : "Unpaid",
        customer: order.customer_name || "Walk-In Customer",
        server: order.server_name || "Unknown",
        opened_at: order.opened_at || orderTimestamp,
        closed_at: order.closed_at || "",
        sent_to_kitchen_at: order.sent_to_kitchen_at || "",
        last_activity_at: order.last_activity_at || orderTimestamp,
        itemCount: order.items.length,
        amount_paid: order.amount_paid || 0,
        amount_due: order.amount_due || 0,
        cash_amount_due: order.cash_amount_due || 0,
        type: orderType,
        total: finalTotal,
        items: order.items,
        notes: order.notes, // Order-level notes (customer requests, special instructions)
        // Additional fields for refund tracking
        refunded: false,
        refundedAmount: 0,
        originalTotal: finalTotal,
        payments: order.payments,
        service_location_id: order.service_location_id ?? undefined,
        service_location_name: order.service_location_name,
        // Station tracking for view_scope awareness
        station_id: order.station_id,
        station_name: order._sourceStationName || undefined,
        // Check management
        checkStatus: order.check_status || "Opened",
        db_order_id: order.db_order_id,
        reversals: order.reversals,
        order_refund_items: order.order_refund_items,
      };

      set((state) => {
        const key = previousOrder.db_order_id || previousOrder.orderId;
        return {
          previousOrders: [...state.previousOrders, previousOrder],
          _orderLookup: { ...state._orderLookup, [key]: previousOrder },
        };
      });
    },

    getOrderById: (orderId: string) => {
      const lookup = get()._orderLookup;
      // Try direct lookup first, then scan for orderId match
      return lookup[orderId] ?? get().previousOrders.find((order) => order.orderId === orderId);
    },

    searchOrders: (query: string) => {
      const orders = get().previousOrders;
      const lowerQuery = query.toLowerCase();

      return orders.filter(
        (order) =>
          order.orderId.toLowerCase().includes(lowerQuery) ||
          order.server.toLowerCase().includes(lowerQuery) ||
          order.items.some((item) =>
            item.name.toLowerCase().includes(lowerQuery),
          ) ||
          order.customer.toLowerCase().includes(lowerQuery),
      );
    },

    getOrdersByDate: (date: Date) => {
      const orders = get().previousOrders;
      const targetDate = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return orders.filter((order) => order.orderDate === targetDate);
    },

    refreshPreviousOrders: async () => {
      const client = _supabaseClient;
      if (!client) {
        console.warn(
          "Supabase client not initialized in usePreviousOrdersStore",
        );
        return;
      }

      const locationId = useFloorPlanStore.getState().locationId;
      if (!locationId) {
        console.warn("Location ID not found in useFloorPlanStore");
        return;
      }

      if (__DEV__) console.log("Refreshing previous orders data from backend...");

      try {
        // Fetch last 50 orders with full history details
        const { data: fetchedOrders, error } =
          await OrderService.getHistoryOrders(
            client,
            locationId,
            50, // Limit to 50 as requested
            null, // Fetch all statuses (not filtering by "final" as requested)
          );

        if (error) {
          console.error("Failed to fetch previous orders:", error);
          return;
        }

        if (!fetchedOrders) return;

        // Transform fetched data into PreviousOrder objects
        const newPreviousOrders: PreviousOrder[] = fetchedOrders.map(
          (fo, index) => {
            // 1. Normalize DB structure to Broadcast structure
            const broadcastData = normalizeFetchedOrder(fo as FetchedOrderData);

            // 2. Transform to OrderProfile (frontend model)
            // We pass undefined for viewScopeStationId to show all items (full history)
            const profile = transformBroadcastToOrder(broadcastData, undefined);

            // 3. Map to PreviousOrder (history model)
            // Use display_number from backend if available, or generate a serial
            // Note: profile.display_number comes from order.display_number or order.order_number
            const serialNo = profile.display_number
              ? profile.display_number.replace(/\D/g, "") // remove non-digits
              : (fetchedOrders.length - index).toString().padStart(3, "0");

            const orderTimestamp =
              profile.opened_at || new Date().toISOString();
            const orderDate = new Date(orderTimestamp);

            return {
              serialNo,
              timestamp: orderTimestamp,
              orderDate: orderDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              orderTime: orderDate.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              }),
              orderId: profile.id,
              display_number: profile.display_number || `#${serialNo}`,
              paymentStatus: profile.paid_status === "Paid" ? "Paid" : "Unpaid",
              customer: profile.customer_name || "Walk-In Customer",
              server: profile.server_name || "Unknown",
              opened_at: profile.opened_at || orderTimestamp,
              closed_at: profile.closed_at || "",
              sent_to_kitchen_at: profile.sent_to_kitchen_at || "",
              last_activity_at: profile.last_activity_at || orderTimestamp,
              itemCount: profile.items.length,
              amount_paid: profile.amount_paid || 0,
              amount_due: profile.amount_due || 0,
              cash_amount_due: profile.cash_amount_due || 0,
              type: (profile.order_type || "Dine In") as any,
              total: profile.total_amount || 0,
              items: profile.items,
              notes: profile.notes,
              refunded: profile.order_status === "refunded",
              refundedAmount: 0, // Backend might calculate this, but defaulting to 0 for now
              originalTotal: profile.total_amount || 0,
              payments: profile.payments,
              service_location_id: profile.service_location_id ?? undefined,
              service_location_name: profile.service_location_name,
              station_id: profile.station_id,
              station_name: profile._sourceStationName || undefined,
              checkStatus: profile.check_status || "Opened",
              db_order_id: profile.db_order_id,
              order_source: profile.order_source ?? null,
              reversals: profile.reversals,
              order_refund_items: profile.order_refund_items,
            };
          },
        );

        // Skip pre-sort: the merged result is sorted below, and the Map merge
        // loses ordering anyway.

        const existingPreviousOrders = get().previousOrders;

        // Create a map for existing orders for quick lookup and to preserve local state
        const ordersMap = new Map<string, PreviousOrder>();
        existingPreviousOrders.forEach((order) => {
          const key = order.db_order_id || order.orderId;
          ordersMap.set(key, order);
        });

        // Add or update with new previous orders, prioritizing fetched data
        newPreviousOrders.forEach((order) => {
          const key = order.db_order_id || order.orderId;
          ordersMap.set(key, order); // Overwrite if already exists, ensuring server data is prioritized
        });

        // Convert map values back to an array
        let mergedPreviousOrders = Array.from(ordersMap.values());

        // Sort by timestamp descending (newest first)
        mergedPreviousOrders.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        const newLookup: Record<string, PreviousOrder> = {};
        for (const order of mergedPreviousOrders) {
          newLookup[order.db_order_id || order.orderId] = order;
        }
        set({ previousOrders: mergedPreviousOrders, newOrdersCount: 0, _orderLookup: newLookup });
        if (__DEV__) console.log(
          `Previous orders refreshed: ${mergedPreviousOrders.length} orders loaded.`,
        );
      } catch (err) {
        console.error("Error in refreshPreviousOrders:", err);
      }
    },

    // Check for new orders by fetching latest 10 and comparing IDs
    checkForNewOrders: async () => {
      const client = _supabaseClient;
      if (!client) {
        return 0;
      }

      const locationId = useFloorPlanStore.getState().locationId;
      if (!locationId) {
        return 0;
      }

      try {
        // Fetch only the latest 10 orders (lightweight check)
        const { data: latestOrders, error } =
          await OrderService.getHistoryOrders(client, locationId, 10, null);

        if (error || !latestOrders) {
          return 0;
        }

        // Use O(1) lookup instead of building a Set
        const lookup = get()._orderLookup;

        // Count how many fetched orders are NOT in local state
        let newCount = 0;
        for (const order of latestOrders) {
          if (!lookup[order.id]) {
            newCount++;
          }
        }

        // Update state
        set({ newOrdersCount: newCount });
        return newCount;
      } catch (err) {
        console.error("Error checking for new orders:", err);
        return 0;
      }
    },

    // Clear the new orders counter (called after user taps refresh)
    clearNewOrdersCount: () => {
      set({ newOrdersCount: 0 });
    },

    refundFullOrder: async (
      orderId: string,
      reason: string,
      refundedBy: string,
      paymentMethod: PaymentType,
    ) => {
      const order = get().getOrderById(orderId);
      if (!order || order.refunded) {
        return;
      }

      if (_supabaseClient) {
        const refundService = new RefundService(_supabaseClient);
        const station = useStoreSettingsStore.getState().selectedStation;
        const refundRequest: RefundRequest = {
          orderId,
          refundType: { type: "full_payment" },
          reason: toRefundReasonType(reason),
          reasonDetail: reason,
          initiatedBy: refundedBy,
          payment_terminal_id: station?.payment_terminal?.id || "",
          payment_terminal: station?.payment_terminal || undefined,
          stationId: station?.id,
        };
        const result = await refundService.processRefund(refundRequest);
        if (!result.success) {
          console.error("Refund failed:", result.error);
          return;
        }
      }

      const refundRecord: RefundRecord = {
        id: `refund_${Date.now()}`,
        orderId,
        type: "full",
        items: order.items.map((item) => ({
          itemId: item.id,
          quantity: item.quantity,
          reason,
          refundedAt: new Date().toISOString(),
          refundedBy,
        })),
        totalRefunded: order.total,
        reason,
        refundedAt: new Date().toISOString(),
        refundedBy,
        paymentMethod,
      };

      // Update the order to mark it as refunded
      set((state) => {
        // Capture the updated order during the map pass (avoids redundant .find())
        let updatedOrder: PreviousOrder | undefined;
        const updatedOrders = state.previousOrders.map((o) => {
          if (o.orderId === orderId) {
            updatedOrder = {
              ...o,
              refunded: true,
              refundedAmount: o.total,
              paymentStatus: "Refunded" as const,
            };
            return updatedOrder;
          }
          return o;
        });
        const newLookup = { ...state._orderLookup };
        if (updatedOrder) {
          newLookup[updatedOrder.db_order_id || updatedOrder.orderId] = updatedOrder;
        }
        return {
          refunds: [...state.refunds, refundRecord],
          previousOrders: updatedOrders,
          _orderLookup: newLookup,
        };
      });
    },

    refundItems: async (
      orderId: string,
      itemsToRefund: Array<{
        itemId: string;
        quantity: number;
        reason: string;
      }>,
      refundedBy: string,
      paymentMethod: PaymentType,
    ) => {
      const order = get().previousOrders.find((o) => o.orderId === orderId);
      if (!order) {
        console.error("Refund failed: Order not found");
        return;
      }

      let totalRefundedInThisTx = 0;
      const refundItemsForRecord: RefundItem[] = [];

      // --- THIS IS THE CORRECTED LOGIC ---

      // 1. Calculate the total refund amount for this transaction
      // and prepare the items for the refund record.
      itemsToRefund.forEach(({ itemId, quantity, reason }) => {
        const item = order.items.find((i) => i.id === itemId);
        // Ensure we are refunding a valid item and a valid quantity
        const maxRefundable =
          (item?.quantity || 0) - (item?.refundedQuantity || 0);
        if (item && quantity > 0 && quantity <= maxRefundable) {
          totalRefundedInThisTx += item.price * quantity;
          refundItemsForRecord.push({
            itemId,
            quantity,
            reason,
            refundedAt: new Date().toISOString(),
            refundedBy,
          });
        }
      });

      if (refundItemsForRecord.length === 0) {
        console.error("Refund failed: No valid items to refund.");
        return;
      }

      if (_supabaseClient) {
        const refundService = new RefundService(_supabaseClient);
        const station = useStoreSettingsStore.getState().selectedStation;
        const refundRequest: RefundRequest = {
          orderId,
          refundType: {
            type: "item_return",
            items: itemsToRefund.map((item) => ({
              orderItemId: item.itemId,
              quantityToRefund: item.quantity,
              reason: toRefundReasonType(item.reason),
              reasonDetail: item.reason,
            })),
          },
          reason: toRefundReasonType(
            itemsToRefund.map((i) => i.reason).find(Boolean) || "other",
          ),
          reasonDetail: itemsToRefund.map((i) => i.reason).join(", "),
          initiatedBy: refundedBy,
          payment_terminal_id: station?.payment_terminal?.id || "",
          payment_terminal: station?.payment_terminal || undefined,
          stationId: station?.id,
        };
        const result = await refundService.processRefund(refundRequest);
        if (!result.success) {
          console.error("Refund failed:", result.error);
          return;
        }
      }

      // 2. Create the new refund record object
      const newRefundRecord: RefundRecord = {
        id: `refund_${Date.now()}`,
        orderId,
        type: "partial",
        items: refundItemsForRecord,
        totalRefunded: totalRefundedInThisTx,
        reason: itemsToRefund
          .map((i) => i.reason)
          .filter(Boolean)
          .join(", "),
        refundedAt: new Date().toISOString(),
        refundedBy,
        paymentMethod,
      };

      // 3. Update the state in a single `set` call
      set((state) => {
        // Capture updated order during map pass (avoids redundant .find())
        let updatedRefundOrder: PreviousOrder | undefined;
        const updatedPreviousOrders = state.previousOrders.map((o) => {
          if (o.orderId === orderId) {
            // Update the refunded quantities on the original order's items
            const updatedItems = o.items.map((originalItem) => {
              const refundInfo = itemsToRefund.find(
                (ri) => ri.itemId === originalItem.id,
              );
              if (refundInfo) {
                return {
                  ...originalItem,
                  refundedQuantity:
                    (originalItem.refundedQuantity || 0) + refundInfo.quantity,
                };
              }
              return originalItem;
            });

            const newTotalRefundedAmount =
              (o.refundedAmount || 0) + totalRefundedInThisTx;
            const isFullyRefunded = newTotalRefundedAmount >= o.total - 0.001; // Epsilon for float safety

            updatedRefundOrder = {
              ...o,
              items: updatedItems,
              refunded: true,
              refundedAmount: newTotalRefundedAmount,
              paymentStatus: isFullyRefunded
                ? ("Refunded" as const)
                : ("Partially Refunded" as const),
            };
            return updatedRefundOrder;
          }
          return o;
        });

        const newLookup = { ...state._orderLookup };
        if (updatedRefundOrder) {
          newLookup[updatedRefundOrder.db_order_id || updatedRefundOrder.orderId] = updatedRefundOrder;
        }
        return {
          previousOrders: updatedPreviousOrders,
          refunds: [...state.refunds, newRefundRecord],
          _orderLookup: newLookup,
        };
      });
    },

    getRefundsForOrder: (orderId: string) => {
      return get().refunds.filter((refund) => refund.orderId === orderId);
    },
  }),
);
