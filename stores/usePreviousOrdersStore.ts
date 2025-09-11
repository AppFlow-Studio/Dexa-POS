import { OrderProfile, PaymentType, PreviousOrder } from "@/lib/types";
import { create } from "zustand";

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

interface PreviousOrdersState {
  previousOrders: PreviousOrder[];
  refunds: RefundRecord[];

  // Actions
  addOrderToHistory: (order: OrderProfile) => void;
  getOrderById: (orderId: string) => PreviousOrder | undefined;
  searchOrders: (query: string) => PreviousOrder[];
  getOrdersByDate: (date: Date) => PreviousOrder[];

  // Refund actions
  refundFullOrder: (
    orderId: string,
    reason: string,
    refundedBy: string,
    paymentMethod: PaymentType
  ) => void;
  refundItems: (
    orderId: string,
    items: Array<{ itemId: string; quantity: number; reason: string }>,
    refundedBy: string,
    paymentMethod: PaymentType
  ) => void;
  getRefundsForOrder: (orderId: string) => RefundRecord[];
}

export const usePreviousOrdersStore = create<PreviousOrdersState>(
  (set, get) => ({
    previousOrders: [],
    refunds: [],

    addOrderToHistory: (order: OrderProfile) => {
      // Only add orders that are closed/paid/completed
      if (order.order_status !== "Closed" && order.paid_status !== "Paid") {
        return;
      }

      const now = new Date();
      const serialNo = (get().previousOrders.length + 1)
        .toString()
        .padStart(3, "0");

      // Calculate total from items if total_amount is not available
      const finalTotal = order.total_amount || 0;

      const previousOrder: PreviousOrder = {
        serialNo,
        orderDate: now.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        orderTime: now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        orderId: order.id,
        paymentStatus: order.paid_status === "Paid" ? "Paid" : "In Progress",
        customer: order.customer_name || "Walk-In Customer",
        server: order.server_name || "Unknown",
        itemCount: order.items.length,
        type: order.order_type || "Dine In",
        total: finalTotal,
        items: order.items,
        // Additional fields for refund tracking
        refunded: false,
        refundedAmount: 0,
        originalTotal: finalTotal,
      };

      set((state) => ({
        previousOrders: [...state.previousOrders, previousOrder],
      }));
    },

    getOrderById: (orderId: string) => {
      return get().previousOrders.find((order) => order.orderId === orderId);
    },

    searchOrders: (query: string) => {
      const orders = get().previousOrders;
      const lowerQuery = query.toLowerCase();

      return orders.filter(
        (order) =>
          order.orderId.toLowerCase().includes(lowerQuery) ||
          order.server.toLowerCase().includes(lowerQuery) ||
          order.items.some((item) =>
            item.name.toLowerCase().includes(lowerQuery)
          ) ||
          order.customer.toLowerCase().includes(lowerQuery)
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

    refundFullOrder: (
      orderId: string,
      reason: string,
      refundedBy: string,
      paymentMethod: PaymentType
    ) => {
      const order = get().getOrderById(orderId);
      if (!order || order.refunded) {
        return;
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
      set((state) => ({
        refunds: [...state.refunds, refundRecord],
        previousOrders: state.previousOrders.map((o) =>
          o.orderId === orderId
            ? {
                ...o,
                refunded: true,
                refundedAmount: o.total,
                paymentStatus: "Refunded" as any,
              }
            : o
        ),
      }));
    },

    refundItems: (
      orderId: string,
      itemsToRefund: Array<{
        itemId: string;
        quantity: number;
        reason: string;
      }>,
      refundedBy: string,
      paymentMethod: PaymentType
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
        const updatedPreviousOrders = state.previousOrders.map((o) => {
          if (o.orderId === orderId) {
            // Update the refunded quantities on the original order's items
            const updatedItems = o.items.map((originalItem) => {
              const refundInfo = itemsToRefund.find(
                (ri) => ri.itemId === originalItem.id
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

            return {
              ...o,
              items: updatedItems,
              refunded: true,
              refundedAmount: newTotalRefundedAmount,
              paymentStatus: isFullyRefunded
                ? ("Refunded" as const)
                : ("Partially Refunded" as const),
            };
          }
          return o;
        });

        return {
          previousOrders: updatedPreviousOrders,
          refunds: [...state.refunds, newRefundRecord],
        };
      });
    },

    getRefundsForOrder: (orderId: string) => {
      return get().refunds.filter((refund) => refund.orderId === orderId);
    },
  })
);
