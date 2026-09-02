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

// Receipt integrity (services/printing/PrinterService.ts buildReceiptTemplateData).
// count = printed receipts whose parts failed to reconcile (Σ line rows ≠ subtotal,
// or subtotal−discount+tax+SC ≠ total). Target 0 — after the derive-from-components
// fix the footer equals Σ(rows) by construction, so any hit is a genuine anomaly
// (finalized order whose persisted total drifted from its own rows, or a logic
// regression). The receipt still prints (fail-open); this is the tripwire.
export const KEY_RECEIPT_RECONCILE_MISMATCH = internKey(
  "receipt.reconcile_mismatch",
);

// Cash drawer kick (services/printing/PrinterService.ts openCashDrawer).
// ok = kicks whose driver command ACKed; fail = every candidate failed or none
// existed; unconfirmed = ACKed but a wired Star's sense showed no open transition
// (strict-confirm tripwire — the "silently hit the wrong printer" signal).
export const KEY_CASH_DRAWER_KICK_OK = internKey("cash_drawer.kick_ok");
export const KEY_CASH_DRAWER_KICK_FAIL = internKey("cash_drawer.kick_fail");
export const KEY_CASH_DRAWER_KICK_UNCONFIRMED = internKey(
  "cash_drawer.kick_unconfirmed",
);

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

// --------------------------------------------------------------------------
// Global overlay mount/render accounting (hooks/useOverlayTelemetry.ts).
//
// The acceptance number for W0-x is `overlay.render_closed.<name>`: renders a
// persistently-mounted overlay performed while it was CLOSED. Target 0 during
// an order-mutation burst — anything above that is a subscription the overlay
// shouldn't be holding while hidden.
//
// `overlay.mount.<name>` counts how many times the heavy body actually mounted
// in the session (1 per open when the controller unmounts on close), and
// `overlay.open_ms.<name>` is the tap → first-committed-frame duration that
// decides unmount-on-close vs retain-after-first-open.
// --------------------------------------------------------------------------
export interface OverlayKeyIds {
  /** Renders performed while `isOpen` was false. Target: 0. */
  renderClosed: number;
  /** Renders performed while open — informational, not a budget. */
  renderOpen: number;
  /** Body mounts (count = mounts this session). */
  mount: number;
  /** Open request → first committed frame of the body, ms. */
  openMs: number;
}

const overlayKeyCache: Record<string, OverlayKeyIds> = Object.create(null);

export function overlayKeyIds(name: string): OverlayKeyIds {
  let ids = overlayKeyCache[name];
  if (ids === undefined) {
    ids = {
      renderClosed: internKey(`overlay.render_closed.${name}`),
      renderOpen: internKey(`overlay.render_open.${name}`),
      mount: internKey(`overlay.mount.${name}`),
      openMs: internKey(`overlay.open_ms.${name}`),
    };
    overlayKeyCache[name] = ids;
  }
  return ids;
}

// --------------------------------------------------------------------------
// Screen mount/render cost (hooks/useScreenRenderTelemetry.ts).
//
// Phase-1 audit item 6: attribute the Tables / table-detail stall to mount vs
// re-render. `screen.mount_ms` is time from the first render call to the first
// committed frame; `screen.render_ms` is the same for every subsequent commit;
// `screen.renders` is the raw commit count for the screen.
// --------------------------------------------------------------------------
export interface ScreenKeyIds {
  mountMs: number;
  renderMs: number;
  renders: number;
}

const screenKeyCache: Record<string, ScreenKeyIds> = Object.create(null);

export function screenKeyIds(name: string): ScreenKeyIds {
  let ids = screenKeyCache[name];
  if (ids === undefined) {
    ids = {
      mountMs: internKey(`screen.mount_ms.${name}`),
      renderMs: internKey(`screen.render_ms.${name}`),
      renders: internKey(`screen.renders.${name}`),
    };
    screenKeyCache[name] = ids;
  }
  return ids;
}

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

// ============================================================================
// Local SQLite database (lib/db/*) — Track A foundation.
// ============================================================================

// Lifecycle
export const KEY_DB_INIT_MS = internKey("db.init_ms");
export const KEY_DB_INIT_ERROR = internKey("db.init_error");
export const KEY_DB_REBUILD = internKey("db.rebuild");
export const KEY_DB_SIZE_BYTES = internKey("db.size_bytes");

// Write boundary (lib/db/write.ts). `policy_reject` is the important one: a
// non-zero count means a sync descriptor is trying to write a table this
// station kind may not hold, which is a misconfiguration, not a normal event.
export const KEY_DB_WRITE_MS = internKey("db.write_ms");
export const KEY_DB_WRITE_ROWS = internKey("db.write_rows");
export const KEY_DB_WRITE_ERROR = internKey("db.write_error");
export const KEY_DB_POLICY_REJECT = internKey("db.policy_reject");
export const KEY_DB_PRUNED_ROWS = internKey("db.pruned_rows");

// Teardown — one count per purge path, so a purge that never fires is visible.
export const KEY_DB_PURGE_CACHE = internKey("db.purge.cache_clear");
export const KEY_DB_PURGE_ENV = internKey("db.purge.env_switch");
export const KEY_DB_PURGE_STATION = internKey("db.purge.station_change");

/**
 * Per-persisted-key boot hydration cost — the Phase 1 measurement that decides
 * whether (and in what order) the 31 MMKV-persisted stores are worth moving to
 * rows in a later phase. Ordered by parse_ms, not by intuition.
 */
export interface BootHydrateKeyIds {
  parseMs: number;
  bytes: number;
}

const bootHydrateCache: Record<string, BootHydrateKeyIds> =
  Object.create(null);

export function bootHydrateKeyIds(name: string): BootHydrateKeyIds {
  let ids = bootHydrateCache[name];
  if (ids === undefined) {
    ids = {
      parseMs: internKey(`boot.persist_parse_ms.${name}`),
      bytes: internKey(`boot.persist_bytes.${name}`),
    };
    bootHydrateCache[name] = ids;
  }
  return ids;
}

// ============================================================================
// Delta sync engine (lib/db/syncEngine.ts) — Track A, Phase 2.
// ============================================================================

export const KEY_SYNC_CYCLE_MS = internKey("sync.cycle_ms");
export const KEY_SYNC_PAGES = internKey("sync.pages");
export const KEY_SYNC_ROWS = internKey("sync.rows");
export const KEY_SYNC_ERROR = internKey("sync.error");
/**
 * The steady-state signal. A healthy POS on a quiet minute should be almost
 * ALL empty cycles — that is the whole point of a delta. A low ratio of
 * empty:total cycles means something is bumping updated_at needlessly, or a
 * watermark is not advancing.
 */
export const KEY_SYNC_EMPTY_CYCLE = internKey("sync.empty_cycle");
export const KEY_SYNC_MANIFEST_MS = internKey("sync.manifest_ms");
export const KEY_SYNC_MANIFEST_DELETED = internKey("sync.manifest_deleted");
