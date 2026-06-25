import { useCallback } from "react";
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
  | "already_declined_or_cancelled";

export interface OnlineOrderActionOutcome {
  ok: boolean;
  reason?: OnlineOrderActionReason;
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
      kind: "accept" | "decline",
      reason?: string,
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
              : "Decline must reach the server. Retry when back online.",
          type: "warning",
        });
        return { ok: false, reason: "offline" };
      }

      const storeKey = resolveStoreKey(localOrderId, dbOrderId);
      const prevStatus = order.order_status;
      const prevSyncVersion = order.sync_version ?? 0;
      const optimisticStatus =
        kind === "accept" ? "sent_to_kitchen" : "declined";

      // Perf: tap → optimistic flip painted (matches the pos.* span convention).
      const interaction = startInteraction(
        kind === "accept"
          ? "pos.online_order_accept"
          : "pos.online_order_decline",
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
            : await OrderService.declineOnlineOrder(client, dbOrderId, reason);

        // Transport / deadline failure → real failure.
        if (error || !data) {
          rollback();
          showToast({
            title: kind === "accept" ? "Accept failed" : "Decline failed",
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
          title: kind === "accept" ? "Accept failed" : "Decline failed",
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

  return { acceptOrder, declineOrder };
}

/**
 * Branch on the JSON envelope. On `success:false` "not pending", reconcile the
 * card to the server's reported current status and decide benign-vs-real.
 */
function resolveEnvelope(
  kind: "accept" | "decline",
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

  if (kind === "accept") {
    // The order is already moving / in the kitchen → benign success.
    if (
      current === "sent_to_kitchen" ||
      current === "preparing" ||
      current === "ready" ||
      current === "accepted"
    ) {
      patchTo(current === "accepted" ? "sent_to_kitchen" : (current as any));
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
    patchTo(current === "accepted" ? "sent_to_kitchen" : (current as any));
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
