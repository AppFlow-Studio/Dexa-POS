import { useEffect, useRef } from "react";
import { useOrderStore } from "@/stores/useOrderStore";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";

/**
 * Hook to refresh the active order data from the database.
 *
 * This hook:
 * 1. Refreshes order on mount (ensures fresh data when payment screens open)
 * 2. Subscribes to the orders realtime channel and refreshes when reconnection occurs
 *
 * Use this in payment screens to ensure they always show accurate totals.
 */
export function useRefreshActiveOrder() {
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const syncOrderFromDatabase = useOrderStore((s) => s.syncOrderFromDatabase);
  const { orders } = useLocationRealtime();
  const isRealtimeConnected = orders.isConnected;

  // Track previous status to detect reconnection
  const prevConnectedRef = useRef(isRealtimeConnected);

  // Refresh on mount
  useEffect(() => {
    if (activeOrderId) {
      syncOrderFromDatabase(activeOrderId).catch((err) => {
        console.warn("[useRefreshActiveOrder] Failed to refresh on mount:", err);
      });
    }
  }, [activeOrderId, syncOrderFromDatabase]);

  // Refresh when realtime reconnects
  useEffect(() => {
    const wasDisconnected = !prevConnectedRef.current;

    if (wasDisconnected && isRealtimeConnected && activeOrderId) {
      console.log("[useRefreshActiveOrder] Realtime reconnected, refreshing order...");
      syncOrderFromDatabase(activeOrderId).catch((err) => {
        console.warn("[useRefreshActiveOrder] Failed to refresh on reconnect:", err);
      });
    }

    prevConnectedRef.current = isRealtimeConnected;
  }, [isRealtimeConnected, activeOrderId, syncOrderFromDatabase]);

  return { activeOrderId, isRealtimeConnected };
}
