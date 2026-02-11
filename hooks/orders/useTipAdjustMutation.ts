import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { useToast } from "@/contexts/ToastContext";
import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { adjustTips, TipAdjustment } from "@/services/tipAdjustService";
import { useOrderStore } from "@/stores/useOrderStore";
import { orderHistoryKeys } from "./useOrderHistory";
import * as Haptics from "expo-haptics";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TipAdjustPaymentInput {
  paymentIndex: number;
  dbPaymentId?: string;
  orderAmount: number;
  currentTip: number;
  newTip: number;
  referenceId?: string;
  last4?: string;
}

export interface TipAdjustMutationInput {
  dbOrderId: string;
  payments: TipAdjustPaymentInput[];
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTipAdjustMutation() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const { orders: ordersRealtime } = useLocationRealtime();

  return useMutation({
    mutationFn: async (input: TipAdjustMutationInput) => {
      if (!selectedStation?.payment_terminal) {
        throw new Error("No payment terminal configured.");
      }

      const api = new DejavooSpinAPI(supabase);
      const loaded = await api.loadTerminal(
        selectedStation.payment_terminal.id,
        selectedStation.payment_terminal
      );

      if (!loaded) {
        throw new Error("Failed to connect to terminal.");
      }

      // Process terminal tip adjustments
      for (const payment of input.payments) {
        if (Math.abs(payment.newTip - payment.currentTip) < 0.001) continue;

        if (!payment.referenceId) {
          show({
            title: "Warning",
            message: `Cannot adjust tip for payment without reference ID (••••${payment.last4 || "????"}).`,
            type: "warning",
          });
          continue;
        }

        const result = await api
          .tipAdjust()
          .amount(payment.orderAmount)
          .tipAmount(payment.newTip)
          .referenceId(payment.referenceId)
          .execute();

        if (!result.success) {
          throw new Error(result.error || "Tip adjust failed on terminal.");
        }
      }

      // Persist tip adjustments to database
      const { loggedInEmployee } = useEmployeeStore.getState();
      const dbAdjustments: TipAdjustment[] = input.payments
        .filter(
          (payment) =>
            payment.dbPaymentId &&
            Math.abs(payment.newTip - payment.currentTip) > 0.001
        )
        .map((payment) => ({
          payment_id: payment.dbPaymentId!,
          new_tip_amount: payment.newTip,
        }));

      if (dbAdjustments.length > 0 && input.dbOrderId) {
        await adjustTips(
          supabase,
          input.dbOrderId,
          dbAdjustments,
          loggedInEmployee?.profileId
        );
      }

      // Sync order from backend
      if (input.dbOrderId) {
        try {
          await useOrderStore
            .getState()
            .syncOrderFromBackendComplete(input.dbOrderId);
        } catch (syncError) {
          console.warn("[TipAdjust] Post-adjustment sync failed:", syncError);
        }
      }

      return { isOffline: !ordersRealtime.isConnected };
    },

    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (data.isOffline) {
        show({
          title: "Tips Adjusted",
          message:
            "Tip adjustments saved. Real-time sync offline - data refreshed manually.",
          type: "warning",
        });
      } else {
        show({
          title: "Tips Adjusted",
          message: "Tip adjustments processed successfully.",
          type: "success",
        });
      }

      queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    },

    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      show({
        title: "Tip Adjust Failed",
        message: error.message || "Unknown error",
        type: "error",
      });
    },
  });
}
