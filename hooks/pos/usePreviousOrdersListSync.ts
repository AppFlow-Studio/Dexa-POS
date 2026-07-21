import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useCallback, useEffect, useState } from "react";
import { useRealtimeFallbackPolling } from "@/hooks/pos/useRealtimeFallbackPolling";

/**
 * Shared list behavior: initial history load, realtime-first new-order
 * delivery with 15s polling fallback, pull-to-refresh with forced fetch.
 *
 * While the orders realtime channel is SUBSCRIBED, `_handleOrderBroadcast`
 * in `usePreviousOrdersStore` keeps the list fresh without any DB hits.
 * When the channel is disconnected (including the brief mount→SUBSCRIBED
 * window), `checkForNewOrders` runs as a 15s fallback.
 */
export function usePreviousOrdersListSync() {
  const refreshPreviousOrders = usePreviousOrdersStore(
    (s) => s.refreshPreviousOrders,
  );
  const checkForNewOrders = usePreviousOrdersStore((s) => s.checkForNewOrders);
  const clearNewOrdersCount = usePreviousOrdersStore(
    (s) => s.clearNewOrdersCount,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Initial bootstrap fires unconditionally at mount. This is the only path
  // that seeds `_orderLookup`, and the fallback primitive's mount-fire below
  // only handles deltas against an already-loaded lookup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshPreviousOrders();
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearNewOrdersCount();
    };
  }, [refreshPreviousOrders, clearNewOrdersCount]);

  // Fallback polling — runs only while realtime orders channel is down.
  useRealtimeFallbackPolling(
    () => {
      void checkForNewOrders();
    },
    { intervalMs: 15000 },
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshPreviousOrders({ force: true });
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshPreviousOrders]);

  return { refresh, isRefreshing, isInitialLoading };
}
