import { useEffect, useRef } from "react";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { jitterMs } from "@/lib/network/jitter";

// A CLOSED during a token-refresh resubscribe lasts well under this, so the
// poll only starts for a real outage; the random part spreads the fleet.
const GRACE_MS = 10_000;
const GRACE_JITTER_MS = 5_000;

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
 * `isConnected` flag. Once the channel has been NOT connected for a 10-15s
 * grace period, it fires `pollFn` and then every `intervalMs`. As soon as
 * `isConnected` flips to `true`, polling stops — broadcasts keep the stores
 * fresh. If the channel later drops, polling automatically resumes. (The
 * mount→SUBSCRIBED gap is covered by the caller's initial query.)
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

    // Realtime is down (or still connecting): after the grace period, poll on
    // the configured cadence until we're back.
    let id: ReturnType<typeof setInterval> | null = null;
    const start = setTimeout(() => {
      void fnRef.current();
      id = setInterval(() => {
        void fnRef.current();
      }, intervalMs);
    }, GRACE_MS + jitterMs(GRACE_JITTER_MS));
    return () => {
      clearTimeout(start);
      if (id) clearInterval(id);
    };
  }, [isConnected, intervalMs, enabled]);
}
