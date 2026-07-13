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

// Broadcast fan-out (app/(main)/_layout.tsx)
export const KEY_FANOUT_ORDER_STORE_MS = internKey("fanout.orderStore_ms");
export const KEY_FANOUT_PREV_ORDERS_MS = internKey("fanout.prevOrders_ms");
export const KEY_FANOUT_KDS_MS = internKey("fanout.kds_ms");

// RPC counters (stores/useOrderStore.ts)
export const KEY_RPC_GET_ORDER_DETAILS = internKey("rpc.get_order_details");

// Storage / persistence (lib/storage.ts)
export const KEY_FLUSH_ALL_MS = internKey("flush_all_ms");

// App lifecycle (lib/telemetry/init.ts)
export const KEY_RESUME_SETTLE_MS = internKey("resume_settle_ms");

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
