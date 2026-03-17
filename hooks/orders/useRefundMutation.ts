import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { useToast } from "@/contexts/ToastContext";
import { RefundService } from "@/services/refundService";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { orderHistoryKeys } from "./useOrderHistory";
import { ordersQueryKeys } from "@/hooks/realtime/useOrdersRealtime";
import { applyOptimisticPatch } from "./applyOptimisticPatch";
import type { RefundReasonType, RefundRequest, ReversalRecord, OrderRefundItemRecord } from "@/types/refunds";
import type { OrderProfile, OrderProfilePayment, PreviousOrder } from "@/lib/types";
import * as Haptics from "expo-haptics";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PerPaymentRefundDetail {
  paymentIndex: number;
  originalPaymentId?: string;
  dbPaymentId?: string;
  method: string;
  orderAmountToRefund: number;
  tipAmountToRefund: number;
  totalRefund: number;
  referenceId?: string;
  last4?: string;
  cardBrand?: string;
}

export type RefundMutationInput =
  | {
      type: "items";
      totalAmount: number;
      reason: string;
      perPaymentDetails: PerPaymentRefundDetail[];
      selectedItems: { itemId: string; quantity: number; paymentIndex?: number }[];
      orderId: string; // local store key
      dbOrderId: string;
      paymentTerminalId: string;
      paymentTerminal?: any;
      stationId?: string;
    }
  | {
      type: "full" | "payments";
      totalAmount: number;
      reason: string;
      perPaymentDetails: PerPaymentRefundDetail[];
      orderId: string; // local store key
      dbOrderId: string;
      paymentTerminalId: string;
      paymentTerminal?: any;
      stationId?: string;
    };

// ── Helpers ────────────────────────────────────────────────────────────────

export const toRefundReasonType = (reason: string): RefundReasonType => {
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

// ── Optimistic patch builder ───────────────────────────────────────────────

function buildAndApplyRefundPatch(input: RefundMutationInput): void {
  const now = new Date().toISOString();
  const { loggedInEmployee } = useEmployeeStore.getState();
  const staffId = loggedInEmployee?.profileId || "unknown";

  // Read current order from whichever store has it
  const orderState = useOrderStore.getState();
  const localKey = orderState.dbOrderIdIndex[input.dbOrderId] ?? input.orderId;
  const activeOrder = orderState.ordersById[localKey];
  const prevOrder = usePreviousOrdersStore.getState().getOrderById(input.orderId)
    ?? usePreviousOrdersStore.getState().getOrderById(input.dbOrderId);
  const currentPayments: OrderProfilePayment[] = activeOrder?.payments || prevOrder?.payments || [];

  // Build patched payments with updated refundedAmount
  const patchedPayments = currentPayments.map((p) => {
    const detail = input.perPaymentDetails.find(
      (d) => d.dbPaymentId === p.db_payment_id || d.paymentIndex === currentPayments.indexOf(p)
    );
    if (!detail) return p;
    return {
      ...p,
      refundedAmount: (p.refundedAmount || 0) + detail.totalRefund,
      refundedAt: now,
    };
  });

  // Build new reversal records
  const newReversals: ReversalRecord[] = input.perPaymentDetails.map((detail) => ({
    id: `temp_${Date.now()}_${detail.paymentIndex}`,
    original_payment_id: detail.dbPaymentId || "",
    original_psp_reference: null,
    reversal_reference_id: detail.referenceId || null,
    merchant_id: "",
    location_id: "",
    reversal_type: input.type === "full" ? "refund" as const : "partial_refund" as const,
    amount: detail.totalRefund,
    reason_code: toRefundReasonType(input.reason),
    reason_description: input.reason,
    status: "completed" as const,
    initiated_by: staffId,
    approved_by: null,
    requested_at: now,
    completed_at: now,
    failed_at: null,
  }));

  // Build order_refund_items for item refunds
  const newRefundItems: OrderRefundItemRecord[] = input.type === "items"
    ? input.selectedItems.map((item) => ({
        id: `temp_${Date.now()}_${item.itemId}`,
        reversal_id: newReversals[0]?.id || "",
        order_item_id: item.itemId,
        quantity_refunded: item.quantity,
        unit_price_refunded: 0,
        subtotal_refunded: 0,
        tax_refunded: 0,
        total_refunded: 0,
        refund_reason: toRefundReasonType(input.reason),
        created_at: now,
      }))
    : [];

  // Build patched items (increment refundedQuantity for item refunds)
  const currentItems = activeOrder?.items || prevOrder?.items || [];
  const patchedItems = input.type === "items"
    ? currentItems.map((item) => {
        const refundInfo = input.selectedItems.find((si) => si.itemId === item.id);
        if (!refundInfo) return item;
        return {
          ...item,
          refundedQuantity: (item.refundedQuantity || 0) + refundInfo.quantity,
        };
      })
    : currentItems;

  const existingReversals = activeOrder?.reversals || prevOrder?.reversals || [];
  const existingRefundItems = activeOrder?.order_refund_items || prevOrder?.order_refund_items || [];

  // Calculate new amounts
  const currentAmountPaid = activeOrder?.amount_paid ?? prevOrder?.amount_paid ?? 0;
  const currentAmountDue = activeOrder?.amount_due ?? prevOrder?.amount_due ?? 0;
  const newAmountPaid = currentAmountPaid - input.totalAmount;
  const newAmountDue = currentAmountDue + input.totalAmount;

  // OrderProfile patch
  const orderPatch: Partial<OrderProfile> = {
    payments: patchedPayments,
    reversals: [...existingReversals, ...newReversals],
    order_refund_items: [...existingRefundItems, ...newRefundItems],
    items: patchedItems,
    amount_paid: newAmountPaid,
    amount_due: newAmountDue,
  };

  // PreviousOrder patch
  const totalRefunded = (prevOrder?.refundedAmount || 0) + input.totalAmount;
  const orderTotal = prevOrder?.total || activeOrder?.total_amount || 0;
  const isFullyRefunded = totalRefunded >= orderTotal - 0.001;

  const previousOrderPatch: Partial<PreviousOrder> = {
    payments: patchedPayments,
    reversals: [...existingReversals, ...newReversals],
    order_refund_items: [...existingRefundItems, ...newRefundItems],
    items: patchedItems,
    amount_paid: newAmountPaid,
    amount_due: newAmountDue,
    refunded: true,
    refundedAmount: totalRefunded,
    paymentStatus: isFullyRefunded ? "Refunded" : "Partially Refunded",
  };

  applyOptimisticPatch(input.orderId, input.dbOrderId, orderPatch, previousOrderPatch);
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useRefundMutation() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { orders: ordersRealtime } = useLocationRealtime();

  return useMutation({
    mutationFn: async (input: RefundMutationInput) => {
      const { loggedInEmployee } = useEmployeeStore.getState();

      if (!loggedInEmployee?.profileId) {
        throw new Error("Staff profile missing. Please re-authenticate.");
      }
      if (!supabase) {
        throw new Error("Supabase unavailable.");
      }

      const refundService = new RefundService(supabase);
      const reasonType = toRefundReasonType(input.reason);
      const orderIdForRefund = input.dbOrderId;

      if (input.type === "items") {
        if (!input.selectedItems || input.selectedItems.length === 0) {
          throw new Error("Select items to refund.");
        }

        const refundRequest: RefundRequest = {
          orderId: orderIdForRefund,
          payment_terminal_id: input.paymentTerminalId,
          payment_terminal: input.paymentTerminal,
          stationId: input.stationId,
          refundType: {
            type: "item_return",
            items: input.selectedItems.map((item) => ({
              orderItemId: item.itemId,
              quantityToRefund: item.quantity,
              reason: reasonType,
              reasonDetail: input.reason,
            })),
          },
          reason: reasonType,
          reasonDetail: input.reason,
          initiatedBy: loggedInEmployee.profileId,
        };

        const result = await refundService.processRefund(refundRequest);
        if (!result.success) {
          throw new Error(result.error || "Refund failed.");
        }

        // Apply optimistic patch immediately
        buildAndApplyRefundPatch(input);

        // Fire-and-forget background sync
        if (input.orderId) {
          useOrderStore.getState().syncOrderFromBackendComplete(input.orderId)
            .catch(err => console.warn("[Refund] Background sync failed:", err));
        }

        return {
          totalAmount: input.totalAmount,
          warning: result.error || undefined,
          isOffline: !ordersRealtime.isConnected,
        };
      }

      // full / payments type
      if (input.perPaymentDetails.length === 0) {
        throw new Error("No refundable payments selected.");
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      for (let i = 0; i < input.perPaymentDetails.length; i++) {
        const detail = input.perPaymentDetails[i];

        // Add delay before subsequent refunds to allow terminal to reset
        if (i > 0) {
          console.log("[Refund] Waiting for terminal to be ready before next refund...");
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        if (!detail.dbPaymentId) {
          errors.push("Missing payment reference for refund.");
          continue;
        }

        const refundType =
          input.type === "full"
            ? { type: "full_payment" as const }
            : { type: "partial_amount" as const, amount: detail.totalRefund };

        const refundRequest: RefundRequest = {
          orderId: orderIdForRefund,
          paymentId: detail.dbPaymentId,
          refundType,
          reason: reasonType,
          reasonDetail: input.reason,
          initiatedBy: loggedInEmployee.profileId,
          referenceId: detail.referenceId,
          payment_terminal_id: input.paymentTerminalId,
          payment_terminal: input.paymentTerminal,
          stationId: input.stationId,
        };

        const result = await refundService.processRefund(refundRequest);
        if (!result.success) {
          errors.push(result.error || "Refund failed.");
        } else if (result.error) {
          warnings.push(result.error);
        }
      }

      if (errors.length > 0) {
        throw new Error(errors.join(" "));
      }

      // Apply optimistic patch immediately
      buildAndApplyRefundPatch(input);

      // Fire-and-forget background sync
      if (input.orderId) {
        useOrderStore.getState().syncOrderFromBackendComplete(input.orderId)
          .catch(err => console.warn("[Refund] Background sync failed:", err));
      }

      return {
        totalAmount: input.totalAmount,
        warning: warnings.length > 0 ? warnings.join("; ") : undefined,
        isOffline: !ordersRealtime.isConnected,
      };
    },

    onSuccess: (data, input) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (data.warning) {
        show({
          title: "Refund Processed (with warnings)",
          message: `$${data.totalAmount.toFixed(2)} refunded. ${data.warning}`,
          type: "warning",
        });
      } else if (data.isOffline) {
        show({
          title: "Refund Processed",
          message: `$${data.totalAmount.toFixed(2)} refunded. Real-time sync offline - data refreshed manually.`,
          type: "warning",
        });
      } else {
        show({
          title: "Refund Processed",
          message: `$${data.totalAmount.toFixed(2)} refund processed successfully.`,
          type: "success",
        });
      }

      // Cache invalidation — scoped to list/counts, not individual detail queries
      queryClient.invalidateQueries({ queryKey: ["orderHistory", "list"] });
      queryClient.invalidateQueries({ queryKey: ["orderHistory", "filterCounts"] });
      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.detail(input.dbOrderId),
      });
      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.payments(input.dbOrderId),
      });
    },

    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      show({
        title: "Refund Failed",
        message: error.message || "Refund failed.",
        type: "error",
      });
    },
  });
}
