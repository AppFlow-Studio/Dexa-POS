import type { RealtimeClientOptions } from "@supabase/supabase-js";
import { withJitter } from "@/lib/network/jitter";

// realtime-js default reconnect schedule; channels rejoin on the same one.
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];

/**
 * Shared Supabase Realtime config tuned for always-on POS tablets.
 *
 * - heartbeatIntervalMs: 25s (Supabase server default). Previous 45s value
 *   risked the server considering the connection stale between heartbeats,
 *   causing silent disconnections → full reconnect cycles. The ping/pong
 *   payload is negligible; reliability matters more for POS.
 * - heartbeatCallback: Fires at the WebSocket transport level. On timeout/disconnect
 *   the RealtimeClient internally reconnects the socket, cascading CHANNEL_ERROR
 *   to all channels — useRealtimeChannel's handleReconnect() picks it up from there.
 * - reconnectAfterMs: the default 1s/2s/5s/10s schedule with ±50% jitter. When
 *   Realtime blips, every device in the fleet sees it at once; without jitter
 *   they all reconnect and re-join (each join an authorization query) in the
 *   same second.
 */
export const realtimeConfig: RealtimeClientOptions = {
  heartbeatIntervalMs: 25_000,
  reconnectAfterMs: (tries: number) =>
    withJitter(RECONNECT_BACKOFF_MS[tries - 1] ?? 10_000, 0.5),
  heartbeatCallback: (status: string, _latency?: number) => {
    // Only warn/error in production — debug logs gated behind __DEV__
    switch (status) {
      case "timeout":
        console.warn("[RealtimeHeartbeat] Timeout — server did not respond");
        break;
      case "disconnected":
        console.warn("[RealtimeHeartbeat] Disconnected — socket is dead");
        break;
      case "error":
        console.error("[RealtimeHeartbeat] Error during heartbeat");
        break;
      // 'ok' and 'sent' intentionally ignored to reduce log noise
    }
  },
};
