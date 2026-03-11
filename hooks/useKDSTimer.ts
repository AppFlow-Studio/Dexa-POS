import { URGENCY_COLORS } from "@/lib/theme";
import { useKDSStore } from "@/stores/useKDSStore";
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

const TICK_INTERVAL_MS = 10_000; // 10 seconds

/**
 * Single global timer that drives all KDS card time displays.
 * Increments timerTick every 10s; pauses when app is backgrounded.
 */
export function useKDSTimer() {
  const incrementTimerTick = useKDSStore((s) => s.incrementTimerTick);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Start interval
    intervalRef.current = setInterval(incrementTimerTick, TICK_INTERVAL_MS);

    // AppState listener: pause on background, resume on foreground
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        // Immediate tick on foreground return
        incrementTimerTick();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(
            incrementTimerTick,
            TICK_INTERVAL_MS,
          );
        }
      } else {
        // Background/inactive — clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppState);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, [incrementTimerTick]);
}

/**
 * Returns a stable bucketed elapsed string that only changes
 * at minute boundaries, preventing unnecessary re-renders.
 * @param startTimeEpoch — milliseconds since epoch (0 = unknown)
 */
export function getBucketedElapsed(startTimeEpoch: number): string {
  if (startTimeEpoch === 0) return "Now";
  const diffMs = Date.now() - startTimeEpoch;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Now";
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${mins}m`;
}

/**
 * Returns urgency level 0-3 based on elapsed time.
 * 0 = green (<5m), 1 = yellow (5-9m), 2 = orange (10-14m), 3 = red (15m+)
 * @param startTimeEpoch — milliseconds since epoch (0 = unknown)
 */
export function getUrgencyLevel(startTimeEpoch: number): number {
  if (startTimeEpoch === 0) return 0;
  const diffMins = Math.floor((Date.now() - startTimeEpoch) / 60000);
  if (diffMins >= 15) return 3;
  if (diffMins >= 10) return 2;
  if (diffMins >= 5) return 1;
  return 0;
}

/** Maps urgency level to color hex */
export function getUrgencyColor(startTimeEpoch: number): string {
  return URGENCY_COLORS[getUrgencyLevel(startTimeEpoch)];
}
