import type { RealtimeClientOptions } from "@supabase/supabase-js";

/**
 * Shared Supabase Realtime config with heartbeat monitoring.
 *
 * The heartbeatCallback fires at the WebSocket transport level (~every 25s),
 * catching silent connection death faster than channel-level callbacks.
 * On timeout/disconnect the RealtimeClient internally reconnects the socket,
 * which cascades CHANNEL_ERROR to all channels — the existing handleReconnect()
 * in useRealtimeChannel picks it up from there.
 */
export const realtimeConfig: RealtimeClientOptions = {
  heartbeatCallback: (status: string, latency?: number) => {
    switch (status) {
      case "ok":
        // console.log(`[RealtimeHeartbeat] OK (${latency}ms)`);
        break;
      case "timeout":
        console.warn("[RealtimeHeartbeat] Timeout — server did not respond");
        break;
      case "disconnected":
        console.warn("[RealtimeHeartbeat] Disconnected — socket is dead");
        break;
      case "error":
        console.error("[RealtimeHeartbeat] Error during heartbeat");
        break;
      // 'sent' is intentionally ignored to reduce log noise
    }
  },
};
