// hooks/realtime/useFloorRealtime.ts
//
// Realtime floor/table synchronization — REWORKED to a single authoritative
// pipeline.
//
// Design (one writer, one source of truth):
//   1. The Supabase Broadcast channel `location:{id}:tables` is treated as a
//      pure "something changed" SIGNAL. Its payload is never applied to local
//      state — broadcasts are best-effort, partial, and can arrive out of
//      order, which is what made the old payload-trusting path drift.
//   2. The ONLY writer of backend-owned table/session state is the atomic
//      snapshot RPC behind `loadFloorPlanStatus()` (get_floor_plan_objects_
//      with_sessions → _patchSessionsFromTables). It reads sessions + junction
//      membership in one transactional read, so it can never observe a
//      half-applied transfer/merge.
//   3. Own-device actions (seatGuests / transferSession / clear / dispatch*)
//      still patch local state optimistically for instant feel; the snapshot
//      reconcile that follows simply confirms them.
//
// Convergence guarantees (why this reaches "always correct"):
//   - Every broadcast → debounced reconcile (coalesced bursts).
//   - Every (re)SUBSCRIBE → immediate forced reconcile, catching up any
//     messages dropped while the channel was down.
//   - Heartbeat reconcile while subscribed → bounds staleness even if every
//     broadcast were silently dropped.
//   - Fallback poll while the channel is NOT connected → covers offline /
//     reconnect gaps, and stops the instant broadcasts resume.

import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import type {
    RealtimeEventType,
    UseFloorRealtimeOptions,
} from "@/types/real-time";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRealtimeChannel } from "./useRealtimechannel";

// Coalesce bursts of broadcasts into a single authoritative reload.
const RECONCILE_DEBOUNCE_MS = 300;
// Max-rate ceiling for broadcast-driven reconciles. Under a busy floor the
// debounce coalesces bursts but NOT a steady trickle (N active tables → a
// near-continuous stream of session/order broadcasts), which would otherwise
// fire one reconcile every ~debounce. This trailing throttle bounds the
// session-refresh rate regardless of broadcast volume; any change that lands
// inside the cooldown is picked up by the trailing edge. Heartbeat and
// fallback poll still bound staleness on top of this.
const RECONCILE_MIN_INTERVAL_MS = 1_500;
// Perf T1b: skip a broadcast-driven reconcile when an authoritative snapshot
// just landed (e.g. a floor-plan switch ran loadFloorPlanStatus moments ago).
// Staleness exposure is the same class the in-flight load dedupe already
// accepts (a change committed between our snapshot read and the broadcast),
// and is bounded by the next broadcast/heartbeat. (Re)subscribe catch-up and
// the fallback poll are deliberately NOT suppressed.
const JUST_LOADED_SUPPRESS_MS = 1_200;
// Heartbeat: converge even if every broadcast is dropped.
// 120s interval with 60s staleness — during idle this halves the periodic
// activity compared to the old 45s/30s cadence, reducing GC churn from
// Array.from(listeners) + Immer proxy creation on the tables screen.
const HEARTBEAT_MS = 120_000;
const HEARTBEAT_STALE_MS = 60_000;
// Fallback poll cadence while the channel is disconnected.
const FALLBACK_POLL_MS = 5_000;

/**
 * Subscribes to `location:{locationId}:tables` and keeps the floor plan +
 * table-session stores converged with the backend via authoritative snapshot
 * reloads. Broadcasts only trigger reloads; they are never applied directly.
 */
export function useFloorRealtime({
  locationId,
  enabled = true,
  maxReconnectAttempts,
  onSessionChange,
  onTableAssignment,
  onSessionEvent,
  onOrderUpdate,
}: UseFloorRealtimeOptions) {
  const supabase = useSupabaseClient();

  // All floor-relevant broadcast events. We don't branch on them for state —
  // any one of them means "the floor changed, go re-read the truth".
  const events: RealtimeEventType[] = useMemo(
    () => [
      "INSERT",
      "UPDATE",
      "DELETE",
      "TABLE_ASSIGNMENT_INSERT",
      "TABLE_ASSIGNMENT_UPDATE",
      "TABLE_ASSIGNMENT_DELETE",
      "SESSION_EVENT",
      "SESSION_ORDER_UPDATE",
    ],
    [],
  );

  // ------------------------------------------------------------------
  // Authoritative reconcile (debounced)
  // ------------------------------------------------------------------
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReconcileAtRef = useRef(0);

  // Full authoritative snapshot (geometry + sessions + junction membership in
  // one transactional read). Used for catch-up on (re)subscribe and the
  // disconnected fallback poll, where we may have missed structural changes.
  const reconcileNow = useCallback(() => {
    lastReconcileAtRef.current = Date.now();
    void useFloorPlanStore.getState().loadFloorPlanStatus();
  }, []);

  // Lightweight session-only refresh for broadcast-driven reconciles. A
  // session/order/assignment broadcast can never change table GEOMETRY — only
  // session state — so the full geometry snapshot is wasted work on the hot
  // path. refreshTableSessions does a single flat getLocationTableStatus query
  // and reuses cached geometry, then patches the session store the same way.
  const reconcileSessions = useCallback(() => {
    lastReconcileAtRef.current = Date.now();
    const store = useFloorPlanStore.getState();
    // No tables cached yet (cold open) → fall back to the full load so we have
    // geometry to merge sessions into.
    if (store.tables.length > 0 && store.activeFloorPlanId) {
      void store.refreshTableSessions();
    } else {
      void store.loadFloorPlanStatus();
    }
  }, []);

  const scheduleReconcile = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    const sinceLast = Date.now() - lastReconcileAtRef.current;
    // Trailing throttle: honor the debounce, but never fire faster than the
    // min interval even under a steady broadcast stream.
    const delay = Math.max(
      RECONCILE_DEBOUNCE_MS,
      RECONCILE_MIN_INTERVAL_MS - sinceLast,
    );
    reconcileTimer.current = setTimeout(() => {
      reconcileTimer.current = null;
      const { lastSyncAt } = useFloorPlanStore.getState();
      const snapshotAgeMs = lastSyncAt
        ? Date.now() - Date.parse(lastSyncAt)
        : Number.POSITIVE_INFINITY;
      if (snapshotAgeMs < JUST_LOADED_SUPPRESS_MS) {
        if (__DEV__)
          console.log(
            `[FloorRealtime] reconcile suppressed — snapshot ${Math.round(snapshotAgeMs)}ms old`,
          );
        return;
      }
      reconcileSessions();
    }, delay);
  }, [reconcileSessions]);

  useEffect(
    () => () => {
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Broadcast handler — signal only
  // ------------------------------------------------------------------
  const handleMessage = useCallback(
    (event: RealtimeEventType, payload: unknown) => {
      if (__DEV__) console.log(`[FloorRealtime] Signal: ${event}`);

      // Single authoritative reconcile for every floor-affecting event.
      scheduleReconcile();

      // Pass-through callbacks (consumers that want the raw payload, e.g. for
      // toasts/analytics). State changes still come only from the reconcile.
      switch (event) {
        case "INSERT":
        case "UPDATE":
        case "DELETE":
          onSessionChange?.(payload as never);
          break;
        case "TABLE_ASSIGNMENT_INSERT":
        case "TABLE_ASSIGNMENT_UPDATE":
        case "TABLE_ASSIGNMENT_DELETE":
          onTableAssignment?.(payload as never);
          break;
        case "SESSION_EVENT":
          onSessionEvent?.(payload as never);
          break;
        case "SESSION_ORDER_UPDATE":
          onOrderUpdate?.(payload as never);
          break;
      }
    },
    [
      scheduleReconcile,
      onSessionChange,
      onTableAssignment,
      onSessionEvent,
      onOrderUpdate,
    ],
  );

  const { status, reconnect, disconnect } = useRealtimeChannel<unknown>({
    supabaseClient: supabase,
    topic: `location:${locationId}:tables`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!locationId && !!supabase,
    ...(maxReconnectAttempts != null && { maxReconnectAttempts }),
  });

  const isConnected = status.state === "SUBSCRIBED";

  // ------------------------------------------------------------------
  // Catch-up on (re)subscribe — recover anything dropped while down.
  // Fires immediately (unthrottled) on every transition into SUBSCRIBED.
  // ------------------------------------------------------------------
  const wasConnectedRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      if (__DEV__)
        console.log(
          "[FloorRealtime] (re)SUBSCRIBED — catch-up reconcile (staleness-gated)",
        );
      // Staleness-gated catch-up instead of an unconditional full snapshot.
      // A Clerk JWT refresh during a send tears down + re-subscribes BOTH
      // channels (clean CLOSED, no heartbeat error), and the old unconditional
      // reconcileNow() fired a full get_floor_plan_objects (28-object) fetch on
      // every such reconnect — stacking with the in-flight send and inflating
      // pos.add_to_cart. After a brief reconnect the snapshot is barely stale,
      // so this either no-ops (fresh) or runs the lightweight session refresh.
      // A genuinely long disconnect leaves data stale → still reconciles. The
      // heartbeat below remains the backstop for structural/geometry drift.
      void useFloorPlanStore
        .getState()
        .loadFloorPlanStatusIfStale(HEARTBEAT_STALE_MS);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  // ------------------------------------------------------------------
  // Heartbeat — converge even if every broadcast is silently dropped.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || !isConnected) return;
    const id = setInterval(() => {
      void useFloorPlanStore
        .getState()
        .loadFloorPlanStatusIfStale(HEARTBEAT_STALE_MS);
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [enabled, isConnected]);

  // ------------------------------------------------------------------
  // Fallback poll — only while the channel is NOT connected. Stops the
  // instant broadcasts resume (replaces the old standalone always-on poller).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || isConnected || !locationId) return;
    reconcileNow(); // cover the mount→SUBSCRIBED gap immediately
    const id = setInterval(reconcileNow, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, isConnected, locationId, reconcileNow]);

  return {
    connectionStatus: status,
    reconnect,
    disconnect,
    isConnected,
    isReconnecting:
      status.reconnectAttempts > 0 && status.state !== "SUBSCRIBED",
  };
}

/**
 * Realtime for a single session's timeline events (detail view).
 * Unchanged in spirit: invalidation-free signal that calls back to the caller.
 */
export function useSessionEventsRealtime({
  sessionId,
  enabled = true,
  onEvent,
}: {
  sessionId: string;
  enabled?: boolean;
  onEvent?: (payload: unknown) => void;
}) {
  const supabase = useSupabaseClient();
  const events: RealtimeEventType[] = useMemo(() => ["SESSION_EVENT"], []);

  const handleMessage = useCallback(
    (_event: RealtimeEventType, payload: unknown) => {
      onEvent?.(payload);
    },
    [onEvent],
  );

  const { status, reconnect } = useRealtimeChannel<unknown>({
    supabaseClient: supabase,
    topic: `session:${sessionId}:events`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!sessionId && !!supabase,
  });

  return {
    connectionStatus: status,
    reconnect,
    isConnected: status.state === "SUBSCRIBED",
  };
}
