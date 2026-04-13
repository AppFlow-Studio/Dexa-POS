import type { RealtimeClientOptions } from "@supabase/supabase-js";

/**
 * Shared Supabase Realtime config tuned for always-on POS tablets.
 *
 * - heartbeatIntervalMs: 45s (up from 25s default) — 33% less ping/pong traffic
 *   while still detecting dead connections within ~90s.
 * - heartbeatCallback: Fires at the WebSocket transport level. On timeout/disconnect
 *   the RealtimeClient internally reconnects the socket, cascading CHANNEL_ERROR
 *   to all channels — useRealtimeChannel's handleReconnect() picks it up from there.
 */
export const realtimeConfig: RealtimeClientOptions = {
  heartbeatIntervalMs: 45_000,
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
