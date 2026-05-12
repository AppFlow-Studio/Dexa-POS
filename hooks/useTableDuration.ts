import { useTableTimerTick } from "@/hooks/useTableTimerTick";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useMemo } from "react";

/**
 * Tracks elapsed time since an order was opened and whether
 * it has exceeded the configured default sitting time.
 *
 * Wave 2.1: shares the floor-plan `useTableTimerTick` singleton instead of
 * creating its own `setInterval(60_000)` per table-detail mount. One interval
 * app-wide, regardless of how many table screens are open.
 */
export function useTableDuration(
  openedAt: string | null | undefined,
  isActive: boolean,
): { duration: string; isOvertime: boolean } {
  const defaultSittingTimeMinutes = useLocationConfigStore(
    (s) => s.config.dining.defaultSittingTimeMinutes,
  );
  const tick = useTableTimerTick();

  return useMemo(() => {
    if (!isActive || !openedAt) {
      return { duration: "", isOvertime: false };
    }
    const startTime = new Date(openedAt).getTime();
    const diffMins = Math.floor((Date.now() - startTime) / 60000);
    return {
      duration: `${diffMins} min`,
      isOvertime:
        defaultSittingTimeMinutes > 0 && diffMins > defaultSittingTimeMinutes,
    };
    // `tick` participates in the dep array so the value recomputes once per
    // shared-tick fire (every 60s).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, openedAt, defaultSittingTimeMinutes, tick]);
}
