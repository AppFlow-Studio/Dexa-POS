import { useEffect, useRef } from "react";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";

type Channel = "orders" | "floor";

interface Options {
  /** Polling interval in ms, used while the realtime channel is NOT connected. */
  intervalMs: number;
  /** Which channel's `isConnected` gates the polling. Defaults to "orders". */
  channel?: Channel;
  /** Optional hard-disable switch. When false, no polling runs. Defaults to true. */
  enabled?: boolean;
}

/**
 * Realtime-first, polling-fallback primitive.
 *
 * Subscribes to `useLocationRealtime()` for the configured channel's
 * `isConnected` flag. While the channel is NOT connected (including the
 * ~1s window between mount and the first SUBSCRIBED event), it fires `pollFn`
 * once immediately and then every `intervalMs`. As soon as `isConnected`
 * flips to `true`, the interval is cleared and no further polling happens —
 * broadcasts keep the stores fresh. If the channel later drops, polling
 * automatically resumes.
 *
 * `pollFn` is stored in a ref so callers can pass inline lambdas without
 * risking stale closures or re-triggering the effect on every render.
 *
 * Must be used inside a `<LocationRealtimeProvider>`.
 */
export function useRealtimeFallbackPolling(
  pollFn: () => void | Promise<void>,
  options: Options,
) {
  const { intervalMs, channel = "orders", enabled = true } = options;
  const { orders, floor } = useLocationRealtime();
  const isConnected = (channel === "floor" ? floor : orders).isConnected;

  // Keep the latest poll function in a ref so inline lambdas don't re-arm the
  // interval on every render.
  const fnRef = useRef(pollFn);
  useEffect(() => {
    fnRef.current = pollFn;
  }, [pollFn]);

  useEffect(() => {
    if (!enabled) return;
    // Realtime is up — do nothing. Broadcasts keep consumers fresh.
    if (isConnected) return;

    // Realtime is down (or still connecting): fire once immediately to cover
    // the mount→SUBSCRIBED gap, then poll on the configured cadence until
    // we're back.
    void fnRef.current();
    const id = setInterval(() => {
      void fnRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [isConnected, intervalMs, enabled]);
}
