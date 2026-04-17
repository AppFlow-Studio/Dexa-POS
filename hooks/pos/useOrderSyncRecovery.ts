import { useCallback, useEffect, useRef } from "react";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { queryClient } from "@/contexts/TanstackProvider";
import { orderQueryKeys } from "@/hooks/pos/useOrdersQuery";
import { useRealtimeFallbackPolling } from "@/hooks/pos/useRealtimeFallbackPolling";

const MIN_INVALIDATION_GAP_MS = 15_000;

/**
 * Recovers order sync when the realtime WebSocket drops.
 *
 * 1. Detects reconnection (was disconnected → now connected) and immediately
 *    invalidates the active-orders query so React Query refetches to catch
 *    anything missed during the outage.
 * 2. While the orders channel is disconnected, invalidates `orders.active`
 *    every 30s. While it's connected, polling fully stops — broadcasts keep
 *    `useOrderStore` fresh via the `_handleOrderBroadcast` fan-out in the
 *    main layout.
 *
 * Must be rendered inside <LocationRealtimeProvider>.
 */
export function useOrderSyncRecovery(locationId: string) {
  const { orders } = useLocationRealtime();
  const wasConnectedRef = useRef(orders.isConnected);
  const lastInvalidatedRef = useRef(0);

  /** Invalidate only if not already fetching and at least 5s since last invalidation. */
  const throttledInvalidate = useCallback(() => {
    const qState = queryClient.getQueryState(orderQueryKeys.active(locationId));
    if (qState?.fetchStatus === "fetching") return;

    const now = Date.now();
    if (now - lastInvalidatedRef.current < MIN_INVALIDATION_GAP_MS) return;
    lastInvalidatedRef.current = now;

    queryClient.invalidateQueries({
      queryKey: orderQueryKeys.active(locationId),
    });
  }, [locationId]);

  // Detect reconnection → immediate refetch
  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    wasConnectedRef.current = orders.isConnected;

    if (!wasConnected && orders.isConnected) {
      console.log("[OrderSyncRecovery] Reconnected — refetching orders");
      throttledInvalidate();
    }
  }, [orders.isConnected, throttledInvalidate]);

  // Realtime-first, polling-fallback: runs only while the channel is down.
  useRealtimeFallbackPolling(throttledInvalidate, { intervalMs: 30_000 });
}
