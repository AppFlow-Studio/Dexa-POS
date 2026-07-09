import { useOrderStore } from "@/stores/useOrderStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import type { OrderRefundItemRecord, ReversalRecord } from "@/types/refunds";
import { useEffect, useMemo } from "react";
import { useOrderDetails, type OrderDetailData } from "./useOrderDetails";

// ─────────────────────────────────────────────────────────────────────────────
// Kitchen-timeline data extracted from get_order_details RPC.
// The RPC returns order_items with per-item kitchen timestamps
// (sent_to_kitchen_at, started_preparing_at, completed_at) and
// order_status_history with every order-level status transition.
// ─────────────────────────────────────────────────────────────────────────────

export interface KitchenStatusEntry {
  /** The kitchen status value: "sent" | "preparing" | "ready" | "served" */
  status: string;
  /** Real timestamp when this status was reached (nullable if not recorded). */
  timestamp: string | null;
}

export interface KitchenTimelineData {
  /** Earliest real timestamp for when items transitioned to "preparing". */
  startedPreparingAt: string | null;
  /** Earliest real timestamp for when items transitioned to "ready"/"served". */
  readyAt: string | null;
  /** Full order_status_history from the backend (every order-level transition). */
  statusHistory: Array<{
    id: string;
    status: string;
    changed_at: string;
    changed_by?: string;
    notes?: string;
  }>;
}

interface UseOrderDetailsFetchParams {
  dbOrderId: string | undefined | null;
  localOrderId: string | undefined | null;
  isActiveOrder: boolean;
  hasExistingReversals: boolean;
  enabled: boolean;
}

/**
 * Parse order items from get_order_details to find the earliest per-item
 * kitchen timestamps. Every item carries sent_to_kitchen_at,
 * started_preparing_at, and completed_at from the backend order_items table.
 */
function extractKitchenTimeline(
  data: OrderDetailData | null | undefined,
): KitchenTimelineData {
  if (!data) {
    return { startedPreparingAt: null, readyAt: null, statusHistory: [] };
  }

  let earliestPreparing: string | null = null;
  let earliestReady: string | null = null;

  if (data.items && Array.isArray(data.items)) {
    for (const entry of data.items) {
      const item = entry.item as Record<string, unknown> | undefined;
      if (!item) continue;

      // started_preparing_at — set when item reaches "preparing" status
      const preparingAt = (item.started_preparing_at as string) ?? null;
      if (
        preparingAt &&
        (!earliestPreparing || preparingAt < earliestPreparing)
      ) {
        earliestPreparing = preparingAt;
      }

      // completed_at — set when item reaches "ready" or "served"
      const completedAt = (item.completed_at as string) ?? null;
      if (completedAt && (!earliestReady || completedAt < earliestReady)) {
        earliestReady = completedAt;
      }
    }
  }

  return {
    startedPreparingAt: earliestPreparing,
    readyAt: earliestReady,
    statusHistory:
      (data.status_history as KitchenTimelineData["statusHistory"]) ?? [],
  };
}

export function useOrderDetailsFetch({
  dbOrderId,
  localOrderId,
  isActiveOrder,
  hasExistingReversals,
  enabled,
}: UseOrderDetailsFetchParams) {
  // Skip query if reversals are already loaded
  const shouldFetch = enabled && !!dbOrderId && !hasExistingReversals;

  const { data, isLoading, error } = useOrderDetails(
    shouldFetch ? dbOrderId : null,
  );

  const reversals = useMemo(
    () => (data?.reversals as ReversalRecord[] | undefined) ?? [],
    [data?.reversals],
  );

  const orderRefundItems = useMemo(
    () =>
      (data?.order_refund_items as OrderRefundItemRecord[] | undefined) ?? [],
    [data?.order_refund_items],
  );

  const kitchenTimeline = useMemo(() => extractKitchenTimeline(data), [data]);

  // Side-effect: write fetched data into the appropriate store
  useEffect(() => {
    if (!data || !localOrderId || !dbOrderId) return;
    if (reversals.length === 0 && orderRefundItems.length === 0) return;

    if (isActiveOrder) {
      useOrderStore.getState().patchOrder(localOrderId, {
        reversals,
        order_refund_items: orderRefundItems,
      });
    } else {
      usePreviousOrdersStore.setState((state) => ({
        previousOrders: state.previousOrders.map((po) =>
          po.orderId === localOrderId || po.db_order_id === dbOrderId
            ? { ...po, reversals, order_refund_items: orderRefundItems }
            : po,
        ),
      }));
    }
  }, [
    data,
    localOrderId,
    dbOrderId,
    isActiveOrder,
    reversals,
    orderRefundItems,
  ]);

  return {
    reversals,
    orderRefundItems,
    kitchenTimeline,
    isLoading: shouldFetch ? isLoading : false,
    error,
  };
}
