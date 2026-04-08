import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useEffect, useRef } from "react";

/**
 * Watches a table's session status and fires `onNavigateAway` when the
 * status transitions from an active state to `available` or `cleaning`.
 * Skips the first render so initial load doesn't trigger navigation.
 */
export function useTableNavigationGuard(
  tableId: string,
  onNavigateAway: () => void,
): void {
  const isFirstRender = useRef(true);

  const status = useTableSessionStore(
    (s) => s.sessions[tableId]?.status ?? "available",
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (status === "available" || status === "cleaning") {
      onNavigateAway();
    }
  }, [status, onNavigateAway]);
}
