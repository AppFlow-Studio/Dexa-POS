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
// ONE set-based RPC call per tick. That single arrived/ack pair is enough to
// settle "routed but never seen": a routed item with an ack is CONFIRMED, with
// an arrived but no ack is RENDER_SUSPECT, and with neither while the device
// is online is NEVER_SHOWED.
//
// Design notes (mirroring 20260827130000_kds_device_truth.sql):
//   - At-least-once with server-side dedupe. A pending event keeps its ORIGINAL
//     client_event_at across retries; the server's unique index
//     (kds_display_id, order_item_id, event_type, client_event_at) makes a
//     replayed buffer a no-op instead of a duplicate.
//   - Each item is emitted at most once per app session (the seen sets). The
//     diff only asks "has this display acked this item", and re-rendering the
//     same item after a recall does not deserve a second paint claim.
//   - The batch is set-based and capped; a KDS reconnecting after hours of
//     offline buffering must not turn into a multi-megabyte call.
//
// This is inert until the KDS screen wires it up AND the fleet ships the build
// containing this module — before then kds_device_events stays empty and HQ
// diffs report NO_DEVICE_DATA, which is honest.

import { SupabaseClient } from "@supabase/supabase-js";

export type KdsDeviceTruthEventType = "arrived" | "ack";

export interface KdsDeviceTruthEvent {
  order_item_id: string;
  order_id: string | null;
  event_type: KdsDeviceTruthEventType;
  /** Device clock at first observation. The server-side idempotency key. */
  client_event_at: string;
}

/** Hard cap on a pending batch: one heartbeat's flush must stay bounded. */
const MAX_PENDING_EVENTS = 500;

let kdsDisplayId: string | null = null;
let deviceOriginId: string | null = null;
let appVersion: string | null = null;

/** Pending events, keyed `${event_type}:${order_item_id}` so a re-mark can't double-enqueue. */
const pending = new Map<string, KdsDeviceTruthEvent>();
/** Items already claimed as arrived / acked this session — emit each once. */
const seenArrived = new Set<string>();
const seenAcked = new Set<string>();

function pendingKey(event: KdsDeviceTruthEvent): string {
  return `${event.event_type}:${event.order_item_id}`;
}

/**
 * The KDS screen reports which display it is rendering for. Call on mount and
 * whenever the display changes. Switching displays resets the buffer so events
 * are never reported against the wrong display.
 */
export function setKdsDeviceTruthContext(
  displayId: string | null,
  originId: string | null,
  version: string | null
): void {
  if (displayId !== kdsDisplayId) {
    pending.clear();
    seenArrived.clear();
    seenAcked.clear();
  }
  kdsDisplayId = displayId;
  deviceOriginId = originId;
  appVersion = version;
}

/** Clear all state (KDS screen unmount / logout). */
export function resetKdsDeviceTruth(): void {
  kdsDisplayId = null;
  deviceOriginId = null;
  appVersion = null;
  pending.clear();
  seenArrived.clear();
  seenAcked.clear();
}

function enqueue(
  orderItemId: string,
  orderId: string | null,
  eventType: KdsDeviceTruthEventType
): void {
  if (!orderItemId || !kdsDisplayId) return;
  if (pending.size >= MAX_PENDING_EVENTS) {
    // A pathological backlog (hours offline) is bounded; drop the oldest so
    // the flush stays small. The diff's "has it ever arrived/acked" question
    // is answered by the first event, not the last.
    const first = pending.keys().next().value;
    if (first) pending.delete(first);
  }
  const event: KdsDeviceTruthEvent = {
    order_item_id: orderItemId,
    order_id: orderId,
    event_type: eventType,
    client_event_at: new Date().toISOString(),
  };
  pending.set(pendingKey(event), event);
}

/** The item's ticket arrived from the server into the KDS store. */
export function markKdsItemArrived(
  orderItemId: string,
  orderId: string | null
): void {
  if (!orderItemId || seenArrived.has(orderItemId)) return;
  seenArrived.add(orderItemId);
  enqueue(orderItemId, orderId, "arrived");
}

/** The item's ticket was rendered to the screen (the 80/20 ack). */
export function markKdsItemAcked(
  orderItemId: string,
  orderId: string | null
): void {
  if (!orderItemId || seenAcked.has(orderItemId)) return;
  seenAcked.add(orderItemId);
  enqueue(orderItemId, orderId, "ack");
}

export function hasPendingKdsDeviceTruth(): boolean {
  return kdsDisplayId !== null && pending.size > 0;
}

/**
 * Flush the pending batch to the server. Called from the heartbeat tick.
 *
 * On failure the batch stays pending (with its original client_event_at) and
 * the next heartbeat retries it — the server dedupes, so retries are safe.
 * Never throws: the heartbeat must not be broken by the device-truth lane.
 */
export async function flushKdsDeviceTruth(
  supabase: SupabaseClient
): Promise<void> {
  if (!kdsDisplayId || pending.size === 0) return;

  const events = Array.from(pending.values());

  try {
    const { error } = await supabase.rpc("report_kds_device_events", {
      p_kds_display_id: kdsDisplayId,
      p_events: events,
      p_device_origin_id: deviceOriginId,
      p_app_version: appVersion,
      p_client_clock_at: new Date().toISOString(),
    });

    if (error) {
      console.warn("[KdsDeviceTruth] Flush RPC error:", error.message);
      return; // keep pending; retry next heartbeat
    }

    // Reported successfully (server dedupes any partial overlap) — drop the
    // batch so it is not re-sent with the same idempotency keys.
    for (const event of events) {
      pending.delete(pendingKey(event));
    }
  } catch (e) {
    console.warn("[KdsDeviceTruth] Flush failed:", e);
  }
}
