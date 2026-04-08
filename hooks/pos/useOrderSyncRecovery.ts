import { useEffect, useRef } from "react";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { queryClient } from "@/contexts/TanstackProvider";
import { orderQueryKeys } from "@/hooks/pos/useOrdersQuery";

/**
 * Recovers order sync when the realtime WebSocket drops.
 *
 * 1. Detects reconnection (was disconnected → now connected) and immediately
 *    invalidates the active-orders query so React Query refetches.
 * 2. Runs adaptive polling: 15 s while disconnected, 120 s while connected
 *    (same cadence as the KDS screen).
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

  // Adaptive polling (KDS pattern: 15 s disconnected, 120 s connected)
  useEffect(() => {
    const pollInterval = orders.isConnected ? 120_000 : 15_000;
    const id = setInterval(() => {
      queryClient.invalidateQueries({
        queryKey: orderQueryKeys.active(locationId),
      });
    }, pollInterval);
    return () => clearInterval(id);
  }, [orders.isConnected, locationId]);
}
