import { useCallback } from "react";
import { getOrderSentStatus } from "@/lib/kitchenStatusUtils";
import { startInteraction } from "@/lib/perf";
import { getIsOnline } from "@/services/offlineSyncService";
import {
  OrderService,
  type OnlineOrderActionResult,
} from "@/services/orderService";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useToastStore } from "@/stores/useToastStore";
import type { OrderProfile } from "@/lib/types";

/**
 * Accept / Decline actions for incoming online & QR orders.
 *
 * Accepting calls accept_online_order, which fires every item to the kitchen
 * (KDS) and — after the Wave 0 normalization — sets status='sent_to_kitchen'.
 * Declining calls decline_online_order (terminal).
 *
 * Design notes:
 *  - **In-flight lock** (module-level, keyed by db_order_id): a manual tap and
 *    the realtime listener — or two fast taps — can both fire for the same
 *    order. The lock collapses them to one RPC.
 *  - **getIsOnline gate FIRST**: accept MUST reach the server to fire the
 *    kitchen, so we never show a false optimistic success offline. We bail
 *    before touching the store and let the card surface a Retry.
 *  - **Optimistic patch bumps sync_version** so the legitimate server broadcast
 *    (same/next version) isn't dropped by the store's version guard; rolled
 *    back on a real failure.
 *  - **Outcome via the JSON envelope** (data.success / data.error), not the
 *    transport error — these RPCs return HTTP 200 with success:false on guard
 *    failures.
 */

export type OnlineOrderActionReason =
  | "offline"
  | "network"
  | "not_found"
  | "no_db_id"
  | "in_flight"
  | "already_accepted"
  | "already_declined_or_cancelled"
  | "already_completed";

export interface OnlineOrderActionOutcome {
  ok: boolean;
  reason?: OnlineOrderActionReason;
}

type OnlineOrderActionKind =
  | "accept"
  | "decline"
  | "cancel"
  | "ready"
  | "done";

/** Human-friendly failure-toast title per action. */
function actionFailedTitle(kind: OnlineOrderActionKind): string {
  return kind === "accept"
    ? "Accept failed"
    : kind === "decline"
      ? "Decline failed"
      : kind === "cancel"
        ? "Cancel failed"
        : kind === "ready"
          ? "Mark ready failed"
          : "Mark done failed";
}

// Shared across every card instance — dedupes manual tap + realtime re-fire.
const inFlight = new Set<string>();

/** Parse `Order is not in pending status (current: X)` → "X". */
function parseCurrentStatus(error: string | undefined): string | null {
  if (!error) return null;
  const m = error.match(/current:\s*([a-z_]+)/i);
  return m ? m[1] : null;
}

function resolveStoreKey(localOrderId: string, dbOrderId?: string): string {
  const state = useOrderStore.getState();
  if (state.ordersById[localOrderId]) return localOrderId;
  if (dbOrderId) return state.dbOrderIdIndex[dbOrderId] ?? dbOrderId;
  return localOrderId;
}

export function useOnlineOrderActions() {
  const showToast = useToastStore((s) => s.show);

  const run = useCallback(
    async (
      localOrderId: string,
      kind: OnlineOrderActionKind,
      reason?: string,
      details?: string,
    ): Promise<OnlineOrderActionOutcome> => {
      const store = useOrderStore.getState();
      const order: OrderProfile | undefined = store.getOrder(localOrderId);

      if (!order) {
        showToast({
          title: "Order unavailable",
          message: "This order is no longer available.",
          type: "error",
        });
        return { ok: false, reason: "not_found" };
      }

      const dbOrderId = order.db_order_id;
      if (!dbOrderId) {
        // Online orders always have a db_order_id; without it the server can't
        // be reached. Treat as a hard failure rather than a false success.
        showToast({
          title: "Order not synced",
          message: "Can't reach the server for this order yet. Try again.",
          type: "error",
        });
        return { ok: false, reason: "no_db_id" };
      }

      // In-flight lock (keyed on the server identity).
      if (inFlight.has(dbOrderId)) {
        return { ok: false, reason: "in_flight" };
      }

      // getIsOnline gate FIRST — no optimistic flip, no false success offline.
      if (!getIsOnline()) {
        showToast({
          title: "You're offline",
          message:
            kind === "accept"
              ? "Accept must reach the server to send to the kitchen. Retry when back online."
              : kind === "decline"
                ? "Decline must reach the server. Retry when back online."
                : kind === "cancel"
                  ? "Cancel must reach the server. Retry when back online."
                  : kind === "ready"
                    ? "Mark ready must reach the server. Retry when back online."
                    : "Mark done must reach the server. Retry when back online.",
          type: "warning",
        });
        return { ok: false, reason: "offline" };
      }

      const storeKey = resolveStoreKey(localOrderId, dbOrderId);
      const prevStatus = order.order_status;
      const prevSyncVersion = order.sync_version ?? 0;
      const optimisticStatus =
        kind === "accept"
          ? getOrderSentStatus() // 'preparing' in 2-step, 'sent_to_kitchen' in 3-step
          : kind === "decline"
            ? "declined"
            : kind === "cancel"
              ? "cancelled"
              : kind === "ready"
                ? "ready"
                : "completed";

      // Perf: tap → optimistic flip painted (matches the pos.* span convention).
      const interaction = startInteraction(
        kind === "accept"
          ? "pos.online_order_accept"
          : kind === "decline"
            ? "pos.online_order_decline"
            : kind === "cancel"
              ? "pos.online_order_cancel"
              : kind === "ready"
                ? "pos.online_order_mark_ready"
                : "pos.online_order_mark_done",
      );

      // Optimistic flip + sync_version bump.
      store.patchOrder(storeKey, {
        order_status: optimisticStatus,
        sync_version: prevSyncVersion + 1,
      });
      interaction.endAfterPaint();

      const rollback = () => {
        useOrderStore.getState().patchOrder(storeKey, {
          order_status: prevStatus,
          sync_version: prevSyncVersion,
        });
      };

      inFlight.add(dbOrderId);
      try {
        const client = getOrderStoreSupabaseClient();
        if (!client) {
          rollback();
          showToast({
            title: "Not connected",
            message: "No server connection. Try again.",
            type: "error",
          });
          return { ok: false, reason: "network" };
        }

        const { data, error } =
          kind === "accept"
            ? await OrderService.acceptOnlineOrder(client, dbOrderId)
            : kind === "decline"
              ? await OrderService.declineOnlineOrder(client, dbOrderId, reason)
              : kind === "cancel"
                ? await OrderService.cancelOnlineOrder(
                    client,
                    dbOrderId,
                    reason ?? "CANNOT_FULFILL",
                    details,
                  )
                : kind === "ready"
                  ? await OrderService.markOnlineOrderReady(client, dbOrderId)
                  : await OrderService.completeOnlineOrder(client, dbOrderId);

        // Transport / deadline failure → real failure.
        if (error || !data) {
          rollback();
          showToast({
            title: actionFailedTitle(kind),
            message: "Couldn't reach the server. Retry.",
            type: "error",
          });
          return { ok: false, reason: "network" };
        }

        return resolveEnvelope(kind, data, storeKey, prevSyncVersion, {
          rollback,
          showToast,
        });
      } catch {
        rollback();
        showToast({
          title: actionFailedTitle(kind),
          message: "Couldn't reach the server. Retry.",
          type: "error",
        });
        return { ok: false, reason: "network" };
      } finally {
        inFlight.delete(dbOrderId);
      }
    },
    [showToast],
  );

  const acceptOrder = useCallback(
    (localOrderId: string) => run(localOrderId, "accept"),
    [run],
  );
  const declineOrder = useCallback(
    (localOrderId: string, reason?: string) =>
      run(localOrderId, "decline", reason),
    [run],
  );
  const cancelOrder = useCallback(
    (localOrderId: string, reason: string, details?: string) =>
      run(localOrderId, "cancel", reason, details),
    [run],
  );
  const markReadyOrder = useCallback(
    (localOrderId: string) => run(localOrderId, "ready"),
    [run],
  );
  const markDoneOrder = useCallback(
    (localOrderId: string) => run(localOrderId, "done"),
    [run],
  );

  return {
    acceptOrder,
    declineOrder,
    cancelOrder,
    markReadyOrder,
    markDoneOrder,
  };
}

/**
 * Branch on the JSON envelope. On `success:false` "not pending", reconcile the
 * card to the server's reported current status and decide benign-vs-real.
 */
function resolveEnvelope(
  kind: OnlineOrderActionKind,
  data: OnlineOrderActionResult,
  storeKey: string,
  prevSyncVersion: number,
  ctx: { rollback: () => void; showToast: ReturnType<typeof useToastStore.getState>["show"] },
): OnlineOrderActionOutcome {
  if (data.success) return { ok: true };

  const current = parseCurrentStatus(data.error);
  const patchTo = (status: OrderProfile["order_status"]) =>
    useOrderStore.getState().patchOrder(storeKey, {
      order_status: status,
      sync_version: prevSyncVersion + 1,
    });

  if (kind === "cancel") {
    // Already cancelled/declined → benign success (someone/something beat us).
    if (current === "cancelled" || current === "declined") {
      patchTo(current as OrderProfile["order_status"]);
      return { ok: true };
    }
    // Already completed → too late to cancel; reconcile the card forward.
    if (current === "completed") {
      patchTo("completed" as OrderProfile["order_status"]);
      ctx.showToast({
        title: "Already completed",
        message: "Order was already completed and can't be cancelled.",
        type: "warning",
      });
      return { ok: false, reason: "already_completed" };
    }
    // Not found / unknown → roll back.
    ctx.rollback();
    ctx.showToast({
      title: "Cancel failed",
      message: data.error ?? "Order can no longer be cancelled.",
      type: "error",
    });
    return { ok: false, reason: "not_found" };
  }

  if (kind === "accept") {
    // The order is already moving / in the kitchen → benign success.
    if (
      current === "sent_to_kitchen" ||
      current === "preparing" ||
      current === "ready" ||
      current === "accepted"
    ) {
      patchTo(current === "accepted" ? getOrderSentStatus() : (current as any));
      return { ok: true };
    }
    // Already declined/cancelled → do NOT imply a kitchen send.
    if (current === "declined" || current === "cancelled") {
      patchTo(current as OrderProfile["order_status"]);
      ctx.showToast({
        title: "Already closed",
        message: `Order was already ${current}.`,
        type: "warning",
      });
      return { ok: false, reason: "already_declined_or_cancelled" };
    }
    // Not found / unknown → roll back.
    ctx.rollback();
    ctx.showToast({
      title: "Accept failed",
      message: data.error ?? "Order is no longer pending.",
      type: "error",
    });
    return { ok: false, reason: "not_found" };
  }

  if (kind === "ready") {
    // Already ready / completed → benign success (KDS or another station beat us).
    if (current === "ready" || current === "completed") {
      patchTo(current as OrderProfile["order_status"]);
      return { ok: true };
    }
    // Already closed out → reconcile the card, don't imply a ready signal.
    if (current === "cancelled" || current === "declined") {
      patchTo(current as OrderProfile["order_status"]);
      ctx.showToast({
        title: "Already closed",
        message: `Order was already ${current}.`,
        type: "warning",
      });
      return { ok: false, reason: "already_declined_or_cancelled" };
    }
    // Not found / unknown / still pending → roll back.
    ctx.rollback();
    ctx.showToast({
      title: "Mark ready failed",
      message: data.error ?? "Order can't be marked ready.",
      type: "error",
    });
    return { ok: false, reason: "not_found" };
  }

  if (kind === "done") {
    // Already completed → benign success (KDS auto-complete or another station).
    if (current === "completed") {
      patchTo("completed" as OrderProfile["order_status"]);
      return { ok: true };
    }
    // Already closed out → reconcile the card, don't imply completion.
    if (current === "cancelled" || current === "declined") {
      patchTo(current as OrderProfile["order_status"]);
      ctx.showToast({
        title: "Already closed",
        message: `Order was already ${current}.`,
        type: "warning",
      });
      return { ok: false, reason: "already_declined_or_cancelled" };
    }
    // Not found / unknown / not yet ready → roll back.
    ctx.rollback();
    ctx.showToast({
      title: "Mark done failed",
      message: data.error ?? "Order can't be marked done.",
      type: "error",
    });
    return { ok: false, reason: "not_found" };
  }

  // kind === "decline"
  if (current === "declined" || current === "cancelled") {
    // Already terminal → benign success.
    patchTo(current as OrderProfile["order_status"]);
    return { ok: true };
  }
  if (
    current === "sent_to_kitchen" ||
    current === "preparing" ||
    current === "ready" ||
    current === "accepted"
  ) {
    // Someone already accepted it — decline failed; reconcile to kitchen.
    patchTo(current === "accepted" ? getOrderSentStatus() : (current as any));
    ctx.showToast({
      title: "Already accepted",
      message: "Order was already accepted and sent to the kitchen.",
      type: "warning",
    });
    return { ok: false, reason: "already_accepted" };
  }
  ctx.rollback();
  ctx.showToast({
    title: "Decline failed",
    message: data.error ?? "Order is no longer pending.",
    type: "error",
  });
  return { ok: false, reason: "not_found" };
}
