import { isActiveSession } from "@/lib/tableStateMachine";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useMemo } from "react";
import { useTableDuration } from "./useTableDuration";

/**
 * Thin wrapper over `useTableDuration` that reads session data
 * directly from `useTableSessionStore` so callers don't need to
 * wire up `seated_at` / `isActive` manually.
 */
export function useSessionDuration(tableId: string): {
  duration: string;
  isOvertime: boolean;
  minutes: number;
} {
  const seatedAt = useTableSessionStore(
    (s) => s.sessions[tableId]?.seated_at,
  );
  const status = useTableSessionStore(
    (s) => s.sessions[tableId]?.status,
  );

  const isActive = useMemo(
    () => (status ? isActiveSession(status) : false),
    [status],
  );

  const { duration, isOvertime } = useTableDuration(seatedAt, isActive);

  const minutes = useMemo(() => {
    if (!isActive || !seatedAt) return 0;
    const diffMs = Date.now() - new Date(seatedAt).getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  }, [isActive, seatedAt, duration]); // duration changes every 60s, triggers recalc

  return { duration, isOvertime, minutes };
}
