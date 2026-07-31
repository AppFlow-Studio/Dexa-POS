/**
 * Pre-interned telemetry key ids shared by the instrumented call sites.
 * Interning once at module load keeps the hot paths to a plain array index.
 *
 * Leaf-safe: imports only the registry.
 */
import { internKey } from "@/lib/telemetry/registry";

// Long-task watcher
export const KEY_LONGTASK = internKey("longtask");

// Realtime (hooks/realtime/useOrdersRealtime.ts)
export const KEY_RT_MSG = internKey("rt.msg");
export const KEY_RT_HANDLER_MS = internKey("rt.handler_ms");
export const KEY_RT_PAYLOAD_BYTES_SAMPLED = internKey("rt.payload_bytes_sampled");

// Own-echo classification (stores/useOrderStore.ts _handleOrderBroadcast)
export const KEY_RT_OWN_ECHO = internKey("rt.own_echo");
export const KEY_RT_OWN_ECHO_SLIP = internKey("rt.own_echo_slip");

// W1-3 demand-driven detail fetch (stores/orderDetailStaleness.ts) — each
// count is one get_order_details cycle NOT fired for an out-of-working-scope
// order (marked detailStale instead). Compare against rpc.get_order_details
// for the before/after evidence.
export const KEY_RT_DETAIL_REFRESH_SUPPRESSED = internKey(
  "rt.detail_refresh_suppressed",
);

// Broadcast fan-out (app/(main)/_layout.tsx)
export const KEY_FANOUT_ORDER_STORE_MS = internKey("fanout.orderStore_ms");
export const KEY_FANOUT_PREV_ORDERS_MS = internKey("fanout.prevOrders_ms");
export const KEY_FANOUT_KDS_MS = internKey("fanout.kds_ms");

// RPC counters (stores/useOrderStore.ts)
export const KEY_RPC_GET_ORDER_DETAILS = internKey("rpc.get_order_details");

// Storage / persistence (lib/storage.ts)
export const KEY_FLUSH_ALL_MS = internKey("flush_all_ms");

// Partialize memo (stores/orderPersistMemo.ts) — W1-1 write-amplification fix.
// hit = cached slice ref returned (storage skip will fire, no stringify);
// miss = slice content changed, fresh object armed;
// would_skip = shadow counter while the gate is OFF (proves win magnitude
// without changing behavior).
export const KEY_PERSIST_MEMO_HIT = internKey("persist.memo.hit");
export const KEY_PERSIST_MEMO_MISS = internKey("persist.memo.miss");
export const KEY_PERSIST_MEMO_WOULD_SKIP = internKey("persist.memo.would_skip");

// Floor-switch attribution (stores/useFloorPlanStore.ts) — splits the 2s
// pos.floor_switch interaction into its JS-block components so /tables
// long tasks can be pinned to paint vs apply vs React render.
export const KEY_FLOOR_SWITCH_PAINT_MS = internKey("floor.switch_paint_ms");
export const KEY_FLOOR_LOAD_RPC_MS = internKey("floor.load_rpc_ms");
export const KEY_FLOOR_LOAD_APPLY_MS = internKey("floor.load_apply_ms");

// App lifecycle (lib/telemetry/init.ts)
export const KEY_RESUME_SETTLE_MS = internKey("resume_settle_ms");

// --------------------------------------------------------------------------
// Resume coordinator (lib/lifecycle/appLifecycleCoordinator.ts).
//
// resume_settle_ms above measures the SYMPTOM (how long until the JS thread
// settles after foreground). These measure the CAUSE: which bucket spent the
// time, how many tasks ran vs were gated out, and how many HTTP requests the
// resume actually issued. `resume.requests` is the before/after number for
// the request-storm acceptance criterion — compare its max (peak concurrent
// in one resume window) across builds.
// --------------------------------------------------------------------------
export const KEY_RESUME_BUCKET_MS = internKey("resume.bucket_ms");
export const KEY_RESUME_TASK_MS = internKey("resume.task_ms");
export const KEY_RESUME_TASK_ERROR = internKey("resume.task_error");
export const KEY_RESUME_TASKS_RUN = internKey("resume.tasks_run");
export const KEY_RESUME_TASKS_SKIPPED = internKey("resume.tasks_skipped");
/** Requests issued inside a resume window (count = windows, max = peak). */
export const KEY_RESUME_REQUESTS = internKey("resume.requests");
/** Requests in flight concurrently at any instant during a resume window. */
export const KEY_RESUME_PEAK_CONCURRENT = internKey("resume.peak_concurrent");

// --------------------------------------------------------------------------
// Realtime channel lifecycle (hooks/realtime/useRealtimechannel.ts).
//
// Added because a telemetry export showed the floor fallback poll running —
// which only happens while the channel is NOT subscribed — with no way to see
// why, or for how long. `rt.disconnected_ms` is the number that matters: the
// fallback poll's cost scales with it, so a station with long/frequent
// disconnects pays repeatedly for the heaviest floor RPC.
// --------------------------------------------------------------------------
export const KEY_RT_CHANNEL_DISCONNECT = internKey("rt.channel_disconnect");
export const KEY_RT_CHANNEL_SUBSCRIBED = internKey("rt.channel_subscribed");
/** Wall time between losing SUBSCRIBED and regaining it. */
export const KEY_RT_DISCONNECTED_MS = internKey("rt.disconnected_ms");

const resumeBucketCache: Record<string, number> = Object.create(null);

/** Per-bucket completion span id (`resume.bucket_ms.<bucket>`). */
export function resumeBucketKeyIds(bucket: string): number {
  let id = resumeBucketCache[bucket];
  if (id === undefined) {
    id = internKey(`resume.bucket_ms.${bucket}`);
    resumeBucketCache[bucket] = id;
  }
  return id;
}

// --------------------------------------------------------------------------
// Per-persist-key ids (persist.fire.<mmkvKey> etc.), cached per store name so
// lazyDebouncedWrite does one object-property hit per call after the first.
// --------------------------------------------------------------------------

export interface PersistKeyIds {
  /** setItem calls that passed the ref-equality skip and armed the debounce */
  arm: number;
  /** setItem calls short-circuited by the ref-equality skip */
  skip: number;
  /**
   * Per actual debounced stringify execution — its counter `count` IS the
   * persist fires/min number; sum/max are stringify wall-time ms.
   */
  stringifyMs: number;
  /** Payload bytes per fire (count = fires, sum/count = avg, max = peak) */
  bytes: number;
}

const persistKeyCache: Record<string, PersistKeyIds> = Object.create(null);

export function persistKeyIds(name: string): PersistKeyIds {
  let ids = persistKeyCache[name];
  if (ids === undefined) {
    ids = {
      arm: internKey(`persist.arm.${name}`),
      skip: internKey(`persist.skip.${name}`),
      stringifyMs: internKey(`persist.stringify_ms.${name}`),
      bytes: internKey(`persist.bytes.${name}`),
    };
    persistKeyCache[name] = ids;
  }
  return ids;
}
