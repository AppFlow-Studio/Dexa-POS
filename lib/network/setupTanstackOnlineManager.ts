/**
 * Perf F7: route TanStack Query's onlineManager through the app's single
 * source of network truth — getIsOnline(), which is NetInfo-online AND NOT
 * connection-quality slow-mode (Option C).
 *
 * Without this, onlineManager is permanently `true` in React Native, so
 * queries in 'online'/'offlineFirst' network mode retry forever against a
 * dead or practically-dead network. With it, retries pause while offline or
 * slow and resume when the network recovers.
 *
 * Deliberately paired with `refetchOnReconnect: false` in the QueryClient
 * defaults: before this wiring, reconnect events never fired, so no query
 * ever refetched-on-reconnect. Keeping it off preserves that behavior and
 * leaves reconnect recovery to its existing owners (useOrderSyncRecovery,
 * the offline sync queue) instead of a thundering herd of stale queries.
 */
import { connectionQuality } from "@/lib/network/connectionQuality";
import {
  getIsOnline,
  subscribeOnlineStatus,
} from "@/services/offlineSyncService";
import { onlineManager } from "@tanstack/react-query";

let installed = false;

export function setupTanstackOnlineManager(): void {
  if (installed) return;
  installed = true;

  const push = () => onlineManager.setOnline(getIsOnline());
  // NetInfo online/offline transitions
  subscribeOnlineStatus(push);
  // Connection-quality slow↔fast transitions (NetInfo-online but unusable)
  connectionQuality.subscribe(push);
  push();
}
