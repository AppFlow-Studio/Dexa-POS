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
import { queueFailedOperation } from "@/services/offlineSyncInit";
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

      // Block tip adjustments on settled payments
      const localOrderId = input.orderId || input.dbOrderId;
      const orderState = useOrderStore.getState();
      const localKey = orderState.dbOrderIdIndex[input.dbOrderId] ?? localOrderId;
      const existingOrder = orderState.ordersById[localKey];
      const prevOrder = usePreviousOrdersStore.getState().getOrderById(localOrderId)
        ?? usePreviousOrdersStore.getState().getOrderById(input.dbOrderId);
      const currentPayments = existingOrder?.payments || prevOrder?.payments || [];

      for (const adj of input.payments) {
        const payment = currentPayments.find(
          (p, idx) => p.db_payment_id === adj.dbPaymentId || idx === adj.paymentIndex,
        );
        if (payment?.is_settled) {
          throw new Error(
            "Tips cannot be adjusted after batch settlement. The batch containing this payment has already been closed.",
          );
        }
      }

      const terminal = selectedStation.payment_terminal;
      const processedDbIds = new Set<string>();

      if (terminal.terminal_type === "castles") {
        // ──── CASTLES BRANCH ────
        const isUsb = terminal.connection_type === 'usb';
        const host = isUsb ? undefined : terminal.ip_address;
        if (!isUsb && !host) throw new Error("Castles terminal has no IP address configured");
        const port = isUsb ? undefined : (terminal.port ?? CASTLES_DEFAULT_PORT);

        const service = getSharedCastlesService();
        await service.connect({
          connectionType: isUsb ? 'usb' : 'local_socket',
          host,
          port,
          timeout: 120_000,
          terminalId: terminal.id,
        });
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

          if (payment.dbPaymentId) processedDbIds.add(payment.dbPaymentId);
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

          if (payment.dbPaymentId) processedDbIds.add(payment.dbPaymentId);
        }
      }

      // If no payments were actually processed on the terminal, fail early
      if (processedDbIds.size === 0) {
        throw new Error("No payments could be adjusted — missing terminal reference data.");
      }

      // Persist tip adjustments to database
      const { loggedInEmployee } = useEmployeeStore.getState();
      const dbAdjustments: TipAdjustment[] = input.payments
        .filter(
          (payment) =>
            payment.dbPaymentId &&
            processedDbIds.has(payment.dbPaymentId) &&
            Math.abs(payment.newTip - payment.currentTip) > 0.001
        )
        .map((payment) => ({
          payment_id: payment.dbPaymentId!,
          new_tip_amount: payment.newTip,
        }));

      let dbPersistFailed = false;
      if (dbAdjustments.length > 0 && input.dbOrderId) {
        try {
          await adjustTips(
            supabase,
            input.dbOrderId,
            dbAdjustments,
            loggedInEmployee?.profileId
          );
        } catch (tipDbError) {
          console.warn("[TipAdjust] adjustTips RPC failed, queuing for retry:", tipDbError);
          dbPersistFailed = true;
          await queueFailedOperation(
            "tip_adjust_db",
            {
              dbOrderId: input.dbOrderId,
              dbAdjustments,
              staffId: loggedInEmployee?.profileId,
            },
            input.orderId || input.dbOrderId,
          );
        }
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

      return { isOffline: !ordersRealtime.isConnected, dbPersistFailed };
    },

    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (data.dbPersistFailed) {
        show({
          title: "Tips Adjusted (Sync Pending)",
          message:
            "Tip adjusted on terminal. Database sync pending — will retry automatically.",
          type: "warning",
        });
      } else if (data.isOffline) {
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
