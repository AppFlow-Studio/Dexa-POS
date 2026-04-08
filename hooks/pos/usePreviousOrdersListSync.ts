import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useCallback, useEffect, useState } from "react";

/**
 * Shared list behavior: initial history load, 15s new-order poll, pull-to-refresh with forced fetch.
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

  useEffect(() => {
    void refreshPreviousOrders();
    const intervalId = setInterval(() => {
      void checkForNewOrders();
    }, 15000);
    return () => {
      clearInterval(intervalId);
      clearNewOrdersCount();
    };
  }, [refreshPreviousOrders, checkForNewOrders, clearNewOrdersCount]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshPreviousOrders({ force: true });
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshPreviousOrders]);

  return { refresh, isRefreshing };
}
