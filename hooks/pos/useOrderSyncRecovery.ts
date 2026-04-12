import { useEffect, useRef } from "react";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { queryClient } from "@/contexts/TanstackProvider";
import { orderQueryKeys } from "@/hooks/pos/useOrdersQuery";
import { useRealtimeFallbackPolling } from "@/hooks/pos/useRealtimeFallbackPolling";

/**
 * Recovers order sync when the realtime WebSocket drops.
 *
 * 1. Detects reconnection (was disconnected → now connected) and immediately
 *    invalidates the active-orders query so React Query refetches to catch
 *    anything missed during the outage.
 * 2. While the orders channel is disconnected, invalidates `orders.active`
 *    every 15s. While it's connected, polling fully stops — broadcasts keep
 *    `useOrderStore` fresh via the `_handleOrderBroadcast` fan-out in the
 *    main layout.
 *
 * Must be rendered inside <LocationRealtimeProvider>.
 */
export function useOrderSyncRecovery(locationId: string) {
  const { orders } = useLocationRealtime();
  const wasConnectedRef = useRef(orders.isConnected);

  // Detect reconnection → immediate refetch
  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    wasConnectedRef.current = orders.isConnected;

    if (!wasConnected && orders.isConnected) {
      console.log("[OrderSyncRecovery] Reconnected — refetching orders");
      queryClient.invalidateQueries({
        queryKey: orderQueryKeys.active(locationId),
      });
    }
  }, [orders.isConnected, locationId]);

  // Realtime-first, polling-fallback: runs only while the channel is down.
  useRealtimeFallbackPolling(
    () => {
      queryClient.invalidateQueries({
        queryKey: orderQueryKeys.active(locationId),
      });
    },
    { intervalMs: 15_000 },
  );
}
