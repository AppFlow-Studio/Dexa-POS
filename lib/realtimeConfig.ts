import type { RealtimeClientOptions } from "@supabase/supabase-js";

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
 */
export const realtimeConfig: RealtimeClientOptions = {
  heartbeatIntervalMs: 25_000,
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
