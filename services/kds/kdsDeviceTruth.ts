// services/kds/kdsDeviceTruth.ts
//
// KDS device-truth emitter — Architecture B, the 80/20.
//
// The KDS screen is the only component that knows what the tablet actually
// received and painted. This module collects two cheap, per-item signals:
//
//   `arrived` — the item's ticket arrived from the server into the KDS store
//   `ack`     — the item's ticket was rendered to the screen (any active tab)
//
// and the heartbeat flushes the pending batch to report_kds_device_events in
// set-based RPC calls per tick. That single arrived/ack pair is enough to
// settle "routed but never seen": a routed item with an ack is CONFIRMED, with
// an arrived but no ack is RENDER_SUSPECT, and with neither while the device
// is online is NEVER_SHOWED.
//
// Design notes (mirroring 20260827151000_kds_device_truth.sql and
// 20260926130000_kds_device_truth_first_arrival_and_source.sql):
//   - At-least-once with server-side dedupe. A pending event keeps its ORIGINAL
//     client_event_at across retries AND across app restarts (the buffer is
//     persisted per display); the server's unique index
//     (kds_display_id, order_item_id, event_type, client_event_at) makes a
//     replayed buffer a no-op instead of a duplicate.
//   - Each item is emitted at most once per display within SEEN_TTL_MS. The
//     seen-sets are persisted too: before 2026-09-26 they were per app
//     session, so every remount re-emitted the WHOLE persisted board with one
//     fresh client second — the HQ panel then reported the last remount as
//     "device received". The diff only asks "has this display ever
//     arrived/acked this item"; a re-render after a remount is not a delivery.
//   - Every `arrived` carries the delivery path (`source`) that put the ticket
//     on the board, so HQ can tell a broadcast from a poll, a reconnect, a
//     resume, or a rehydrated board.
//   - Flushes are chunked, never evicted: a KDS reconnecting after hours of
//     offline buffering sends bounded calls per tick until the backlog drains.
//     (The old 500-cap dropped the OLDEST events — exactly the first-arrival
//     rows the metric depends on.)

import { SupabaseClient } from "@supabase/supabase-js";
import { getJSON, removeKey, setJSON } from "@/lib/storage";

export type KdsDeviceTruthEventType = "arrived" | "ack";

/** Which client path put the ticket on the board when it was first observed. */
export type KdsArrivalSource =
  | "broadcast"
  | "poll"
  | "reconnect"
  | "resume"
  | "mount"
  | "manual"
  | "rehydrate"
  | "unknown";

export interface KdsDeviceTruthEvent {
  order_item_id: string;
  order_id: string | null;
  event_type: KdsDeviceTruthEventType;
  /** Device clock at first observation. The server-side idempotency key. */
  client_event_at: string;
  /** Delivery path; only meaningful on `arrived`. */
  source?: KdsArrivalSource;
}

/** Events per RPC call. */
export const MAX_EVENTS_PER_CALL = 500;
/** Calls per flush tick, so one heartbeat can never turn into a storm. */
const MAX_CALLS_PER_FLUSH = 4;
/** Seen-set retention. Longer than any ticket realistically lives on a board. */
const SEEN_TTL_MS = 48 * 60 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 1_000;
const STORAGE_PREFIX = "kds-device-truth:";

interface PersistedState {
  v: 1;
  pending: KdsDeviceTruthEvent[];
  seenArrived: Record<string, number>;
  seenAcked: Record<string, number>;
}

let kdsDisplayId: string | null = null;
let deviceOriginId: string | null = null;
let appVersion: string | null = null;

/** Pending events, keyed `${event_type}:${order_item_id}` so a re-mark can't double-enqueue. */
const pending = new Map<string, KdsDeviceTruthEvent>();
/** Items already claimed as arrived / acked for this display — item id -> first-seen epoch ms. */
const seenArrived = new Map<string, number>();
const seenAcked = new Map<string, number>();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistDirty = false;

function pendingKey(event: KdsDeviceTruthEvent): string {
  return `${event.event_type}:${event.order_item_id}`;
}

function storageKey(displayId: string): string {
  return `${STORAGE_PREFIX}${displayId}`;
}

function loadPersisted(displayId: string): void {
  try {
    const state = getJSON<PersistedState>(storageKey(displayId));
    if (!state || state.v !== 1) return;
    const cutoff = Date.now() - SEEN_TTL_MS;
    for (const [id, ts] of Object.entries(state.seenArrived ?? {})) {
      if (typeof ts === "number" && ts >= cutoff) seenArrived.set(id, ts);
    }
    for (const [id, ts] of Object.entries(state.seenAcked ?? {})) {
      if (typeof ts === "number" && ts >= cutoff) seenAcked.set(id, ts);
    }
    for (const event of state.pending ?? []) {
      if (event && event.order_item_id && event.event_type && event.client_event_at) {
        pending.set(pendingKey(event), event);
      }
    }
  } catch (e) {
    console.warn("[KdsDeviceTruth] Failed to load persisted state:", e);
  }
}

function persistNow(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!persistDirty || !kdsDisplayId) return;
  persistDirty = false;
  try {
    const state: PersistedState = {
      v: 1,
      pending: Array.from(pending.values()),
      seenArrived: Object.fromEntries(seenArrived),
      seenAcked: Object.fromEntries(seenAcked),
    };
    setJSON(storageKey(kdsDisplayId), state);
  } catch (e) {
    console.warn("[KdsDeviceTruth] Failed to persist state:", e);
  }
}

function schedulePersist(): void {
  persistDirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
}

function clearMemory(): void {
  pending.clear();
  seenArrived.clear();
  seenAcked.clear();
  persistDirty = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

/**
 * The KDS screen reports which display it is rendering for. Call on mount and
 * whenever the display changes. Switching displays writes the previous
 * display's state, clears the buffer so events are never reported against the
 * wrong display, and restores the new display's persisted state.
 */
export function setKdsDeviceTruthContext(
  displayId: string | null,
  originId: string | null,
  version: string | null
): void {
  if (displayId !== kdsDisplayId) {
    persistNow();
    clearMemory();
    kdsDisplayId = displayId;
    if (displayId) loadPersisted(displayId);
  }
  deviceOriginId = originId;
  appVersion = version;
}

/**
 * Detach from the display (KDS screen unmount / logout). Pending events and
 * seen-sets stay persisted so a remount replays what was never flushed and
 * does NOT re-emit what already was.
 */
export function resetKdsDeviceTruth(): void {
  persistNow();
  clearMemory();
  kdsDisplayId = null;
  deviceOriginId = null;
  appVersion = null;
}

/** Test seam: drop memory AND the persisted state for a display. */
export function __clearKdsDeviceTruthForTest(displayId?: string | null): void {
  const target = displayId ?? kdsDisplayId;
  clearMemory();
  kdsDisplayId = null;
  deviceOriginId = null;
  appVersion = null;
  if (target) {
    try {
      removeKey(storageKey(target));
    } catch {
      /* test seam */
    }
  }
}

function enqueue(
  orderItemId: string,
  orderId: string | null,
  eventType: KdsDeviceTruthEventType,
  source?: KdsArrivalSource
): void {
  if (!orderItemId || !kdsDisplayId) return;
  const event: KdsDeviceTruthEvent = {
    order_item_id: orderItemId,
    order_id: orderId,
    event_type: eventType,
    client_event_at: new Date().toISOString(),
    ...(source ? { source } : {}),
  };
  pending.set(pendingKey(event), event);
  schedulePersist();
}

/**
 * The item's ticket arrived from the server into the KDS store.
 * `source` is the path that put it there (see KdsArrivalSource).
 */
export function markKdsItemArrived(
  orderItemId: string,
  orderId: string | null,
  source: KdsArrivalSource = "unknown"
): void {
  if (!orderItemId || !kdsDisplayId || seenArrived.has(orderItemId)) return;
  seenArrived.set(orderItemId, Date.now());
  enqueue(orderItemId, orderId, "arrived", source);
}

/** The item's ticket was rendered to the screen (the 80/20 ack). */
export function markKdsItemAcked(
  orderItemId: string,
  orderId: string | null
): void {
  if (!orderItemId || !kdsDisplayId || seenAcked.has(orderItemId)) return;
  seenAcked.set(orderItemId, Date.now());
  enqueue(orderItemId, orderId, "ack");
}

export function hasPendingKdsDeviceTruth(): boolean {
  return kdsDisplayId !== null && pending.size > 0;
}

export function getPendingKdsDeviceTruthCount(): number {
  return kdsDisplayId !== null ? pending.size : 0;
}

/**
 * Flush the pending batch to the server in bounded chunks. Called from the
 * heartbeat tick.
 *
 * On failure the remaining batch stays pending (with its original
 * client_event_at) and the next heartbeat retries it — the server dedupes, so
 * retries are safe. Never throws: the heartbeat must not be broken by the
 * device-truth lane.
 */
export async function flushKdsDeviceTruth(
  supabase: SupabaseClient
): Promise<void> {
  if (!kdsDisplayId || pending.size === 0) return;

  const displayId = kdsDisplayId;
  const all = Array.from(pending.values());

  for (let call = 0; call < MAX_CALLS_PER_FLUSH; call++) {
    const start = call * MAX_EVENTS_PER_CALL;
    if (start >= all.length) break;
    const chunk = all.slice(start, start + MAX_EVENTS_PER_CALL);

    try {
      const { error } = await supabase.rpc("report_kds_device_events", {
        p_kds_display_id: displayId,
        p_events: chunk,
        p_device_origin_id: deviceOriginId,
        p_app_version: appVersion,
        p_client_clock_at: new Date().toISOString(),
      });

      if (error) {
        console.warn("[KdsDeviceTruth] Flush RPC error:", error.message);
        break; // keep this chunk and the rest pending; retry next heartbeat
      }

      // The display may have changed while the call was in flight; never
      // drop another display's buffer.
      if (kdsDisplayId !== displayId) return;

      // Reported successfully (server dedupes any partial overlap) — drop the
      // chunk so it is not re-sent with the same idempotency keys.
      for (const event of chunk) {
        pending.delete(pendingKey(event));
      }
      schedulePersist();
    } catch (e) {
      console.warn("[KdsDeviceTruth] Flush failed:", e);
      break;
    }
  }
}
