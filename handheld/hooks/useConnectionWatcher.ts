import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { getRawIsOnline, subscribeOnlineStatus } from "@/services/offlineSyncService";
import { useEffect, useSyncExternalStore } from "react";
import { useConnectionStore, type ConnectionState } from "../lib/connectionStore";

/**
 * A handheld walks between access points. Each hand-off drops the link for
 * a second or two, which NetInfo reports as offline and the realtime socket
 * reports as closed — and on a tablet that never moves, that is rare enough
 * to show at once. On a handheld it would flash "You're offline" every few
 * tables. So the card waits: offline has to last OFFLINE_GRACE_MS, and a
 * dead socket on a live network RECONNECT_GRACE_MS (the socket rejoins in
 * about a second after a clean hand-off; the cold-start subscribe is inside
 * the same window).
 *
 * Once a card is up it follows the network immediately: offline → back
 * online but still catching up switches straight to "reconnecting", and a
 * full recovery clears it.
 *
 * Catch-up itself is not here: the orders channel refetches on rejoin
 * (useOrderSyncRecovery) and the floor channel reloads its snapshot on
 * resubscribe (useFloorRealtime). This only decides what the server sees.
 */
export const OFFLINE_GRACE_MS = 4_000;
export const RECONNECT_GRACE_MS = 8_000;

export function useConnectionWatcher(): void {
  const rawIsOnline = useSyncExternalStore(subscribeOnlineStatus, getRawIsOnline, getRawIsOnline);
  const { allConnected } = useLocationRealtime();
  const shown = useConnectionStore((s) => s.state);
  const set = useConnectionStore((s) => s.set);

  const raw: ConnectionState = !rawIsOnline ? "offline" : !allConnected ? "reconnecting" : "online";

  useEffect(() => {
    if (raw === "online") {
      if (shown !== "online") set("online");
      return;
    }
    if (shown !== "online") {
      if (shown !== raw) set(raw);
      return;
    }
    const t = setTimeout(() => set(raw), raw === "offline" ? OFFLINE_GRACE_MS : RECONNECT_GRACE_MS);
    return () => clearTimeout(t);
  }, [raw, shown, set]);
}
