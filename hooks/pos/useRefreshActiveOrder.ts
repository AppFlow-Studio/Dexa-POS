import { useEffect, useRef } from "react";
import { useOrderStore } from "@/stores/useOrderStore";

/**
 * Hook to refresh the active order data from the database.
 * 
 * This hook:
 * 1. Refreshes order on mount (ensures fresh data when payment screens open)
 * 2. Subscribes to orderRealtimeStatus and refreshes when reconnection occurs
 * 
 * Use this in payment screens to ensure they always show accurate totals.
 */
export function useRefreshActiveOrder() {
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const syncOrderFromDatabase = useOrderStore((s) => s.syncOrderFromDatabase);
  const orderRealtimeStatus = useOrderStore((s) => s.orderRealtimeStatus);
  
  // Track previous status to detect reconnection
  const prevStatusRef = useRef(orderRealtimeStatus);
  
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
    const wasDisconnected = prevStatusRef.current !== "connected";
    const isNowConnected = orderRealtimeStatus === "connected";
    
    if (wasDisconnected && isNowConnected && activeOrderId) {
      console.log("[useRefreshActiveOrder] Realtime reconnected, refreshing order...");
      syncOrderFromDatabase(activeOrderId).catch((err) => {
        console.warn("[useRefreshActiveOrder] Failed to refresh on reconnect:", err);
      });
    }
    
    prevStatusRef.current = orderRealtimeStatus;
  }, [orderRealtimeStatus, activeOrderId, syncOrderFromDatabase]);
  
  return { activeOrderId, orderRealtimeStatus };
}
