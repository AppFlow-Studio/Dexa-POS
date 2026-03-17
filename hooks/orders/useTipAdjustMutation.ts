import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { useToast } from "@/contexts/ToastContext";
import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getOrCreateCounter } from "@/services/terminals/castles-txn-counter";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";
import { adjustTips, TipAdjustment } from "@/services/tipAdjustService";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { orderHistoryKeys } from "./useOrderHistory";
import { applyOptimisticPatch } from "./applyOptimisticPatch";
import type { OrderProfile, OrderProfilePayment, PreviousOrder } from "@/lib/types";
import * as Haptics from "expo-haptics";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TipAdjustPaymentInput {
  paymentIndex: number;
  dbPaymentId?: string;
  orderAmount: number;
  currentTip: number;
  newTip: number;
  referenceId?: string;
  rrn?: string;
  last4?: string;
}

export interface TipAdjustMutationInput {
  dbOrderId: string;
  orderId?: string; // local store key (for optimistic patching)
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

      const terminal = selectedStation.payment_terminal;

      if (terminal.terminal_type === "castles") {
        // ──── CASTLES BRANCH ────
        const host = terminal.ip_address;
        if (!host) throw new Error("Castles terminal has no IP address configured");
        const port = terminal.port ?? CASTLES_DEFAULT_PORT;

        const service = getSharedCastlesService();
        await service.connect({ host, port, timeout: 120_000, terminalId: terminal.id });
        await service.resetTerminalState();

        const counter = getOrCreateCounter({ terminalId: terminal.id, supabaseClient: supabase });
        if (!counter.isInitialized) await counter.initialize();

        for (const payment of input.payments) {
          if (Math.abs(payment.newTip - payment.currentTip) < 0.001) continue;

          if (!payment.rrn) {
            show({
              title: "Warning",
              message: `Cannot adjust tip — missing RRN (••••${payment.last4 || "????"}).`,
              type: "warning",
            });
            continue;
          }

          const referenceId = counter.next();
          const result = await service.tipAdjust({
            tipAmount: payment.newTip,
            rrn: payment.rrn,
            referenceId,
          });

          if (!result.success) {
            throw new Error(result.error || "Castles tip adjust failed.");
          }
        }
      } else {
        // ──── DEJAVOO BRANCH ────
        const api = new DejavooSpinAPI(supabase);
        const loaded = await api.loadTerminal(terminal.id, terminal);

        if (!loaded) {
          throw new Error("Failed to connect to terminal.");
        }

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

      // Apply optimistic patch immediately
      {
        const localOrderId = input.orderId || input.dbOrderId;
        const orderState = useOrderStore.getState();
        const localKey = orderState.dbOrderIdIndex[input.dbOrderId] ?? localOrderId;
        const activeOrder = orderState.ordersById[localKey];
        const prevOrder = usePreviousOrdersStore.getState().getOrderById(localOrderId)
          ?? usePreviousOrdersStore.getState().getOrderById(input.dbOrderId);
        const currentPayments: OrderProfilePayment[] = activeOrder?.payments || prevOrder?.payments || [];

        const patchedPayments = currentPayments.map((p, idx) => {
          const adj = input.payments.find(
            (a) => a.dbPaymentId === p.db_payment_id || a.paymentIndex === idx
          );
          if (!adj || Math.abs(adj.newTip - adj.currentTip) < 0.001) return p;
          return {
            ...p,
            tip_amount: adj.newTip,
            total_collected: p.amount + adj.newTip,
            original_tip_amount: p.original_tip_amount ?? p.tip_amount,
            tip_adjusted_at: new Date().toISOString(),
            tip_adjusted_by: loggedInEmployee?.profileId || undefined,
          };
        });

        const orderPatch: Partial<OrderProfile> = { payments: patchedPayments };
        const previousOrderPatch: Partial<PreviousOrder> = { payments: patchedPayments };

        applyOptimisticPatch(localOrderId, input.dbOrderId, orderPatch, previousOrderPatch);
      }

      // Fire-and-forget background sync
      if (input.dbOrderId) {
        useOrderStore.getState().syncOrderFromBackendComplete(input.dbOrderId)
          .catch(err => console.warn("[TipAdjust] Background sync failed:", err));
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
