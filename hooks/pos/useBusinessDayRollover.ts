import {
  getCurrentBusinessDay,
  type BusinessDayConfig,
} from "@/lib/businessDay";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

const ROLLOVER_POLL_INTERVAL_MS = 60_000;

/**
 * Detects business-day rollover on a long-running tablet and refetches
 * previous orders so cached `_resolvedStartTs/_resolvedEndTs` for the "today"
 * pill don't go stale at the merchant's rollover hour (default midnight in
 * the location's timezone).
 *
 * Two triggers:
 *  - AppState `active` (most foregrounds happen after a phone has been idle
 *    long enough to cross rollover — cheap and immediate)
 *  - 60s interval backstop (POS tablets typically run for 18+ hours straight
 *    with no foreground events; without this, "Today" silently shows
 *    yesterday's data after the cutover hour)
 *
 * Skip in KDS mode — KDS doesn't render previous-orders.
 */
export function useBusinessDayRollover(params: { enabled: boolean }) {
  const { enabled } = params;
  const lastSeenBusinessDay = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastSeenBusinessDay.current = null;
      return;
    }

    const checkRollover = () => {
      const store = useStoreSettingsStore.getState().selectedStore;
      if (!store?.timezone) return;
      const config: BusinessDayConfig = {
        timezone: store.timezone,
        rolloverHour: store.business_day_start_hour ?? 0,
      };
      let currentDay: string;
      try {
        currentDay = getCurrentBusinessDay(config);
      } catch {
        // Bad timezone — bail silently rather than spin
        return;
      }
      if (lastSeenBusinessDay.current === null) {
        lastSeenBusinessDay.current = currentDay;
        return;
      }
      if (lastSeenBusinessDay.current !== currentDay) {
        if (__DEV__)
          console.log(
            `[BusinessDayRollover] Day changed: ${lastSeenBusinessDay.current} → ${currentDay} — refetching previous orders`,
          );
        lastSeenBusinessDay.current = currentDay;
        void usePreviousOrdersStore
          .getState()
          .refreshPreviousOrders({ force: true });
      }
    };

    // Seed on mount so the first interval tick has a baseline
    checkRollover();

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === "active") checkRollover();
    };
    const sub = AppState.addEventListener("change", onAppStateChange);
    const interval = setInterval(checkRollover, ROLLOVER_POLL_INTERVAL_MS);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [enabled]);
}
