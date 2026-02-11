import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { useToast } from "@/contexts/ToastContext";
import { RefundService } from "@/services/refundService";
import { useOrderStore } from "@/stores/useOrderStore";
import { orderHistoryKeys } from "./useOrderHistory";
import { ordersQueryKeys } from "@/hooks/realtime/useOrdersRealtime";
import type { RefundReasonType, RefundRequest } from "@/types/refunds";
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

        // Sync order from backend
        if (input.orderId) {
          try {
            await useOrderStore.getState().syncOrderFromBackendComplete(input.orderId);
          } catch (syncError) {
            console.warn("[Refund] Post-refund sync failed:", syncError);
          }
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

      // Sync order from backend
      if (input.orderId) {
        try {
          await useOrderStore.getState().syncOrderFromBackendComplete(input.orderId);
        } catch (syncError) {
          console.warn("[Refund] Post-refund sync failed:", syncError);
        }
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

      // Cache invalidation
      queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
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
