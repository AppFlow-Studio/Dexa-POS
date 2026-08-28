import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useCallback, useEffect, useState } from "react";

/**
 * Shared list behavior: initial history load + pull-to-refresh with forced
 * fetch.
 *
 * New-order delivery no longer uses a 15s polling badge — the local mirror
 * (delta sync, every 30s) owns the list and realtime broadcast patches only
 * update rows already on screen, so there is no separate "new orders" count
 * to get out of sync with what the mirror holds.
 */
export function usePreviousOrdersListSync() {
  const refreshPreviousOrders = usePreviousOrdersStore(
    (s) => s.refreshPreviousOrders,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Initial bootstrap fires unconditionally at mount — the only path that
  // seeds `_orderLookup`.
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
    };
  }, [refreshPreviousOrders]);
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
