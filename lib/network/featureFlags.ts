import { storage } from "@/lib/storage";

/**
 * Per-RPC feature flags for the bad-WiFi Phase 2 idempotency rollout.
 *
 * Mirrors the pattern in `lib/network/killSwitch.ts`: MMKV-backed boolean
 * with in-memory cache and listener subscription. No Supabase round-trip
 * on the hot path.
 *
 * Default = false. Flag flipping is the L1 rollback: <30s end-to-end.
 *
 * Env-var overrides (read once at module load — for EAS preview/production
 * builds where the dev-flags screen is gated behind __DEV__ and inaccessible):
 *   EXPO_PUBLIC_IDEMPOTENT_ALL=1
 *     → forces every v3 RPC ON regardless of MMKV state
 *   EXPO_PUBLIC_IDEMPOTENT_<RPC_UPPERCASE>=1 (e.g. EXPO_PUBLIC_IDEMPOTENT_CREATE_ORDER=1)
 *     → forces a single RPC ON
 * Either accepts '1' or 'true'. Env wins over MMKV when truthy; MMKV
 * remains the source of truth in dev builds.
 */

export type IdempotentRpc =
  | "seat_guests"
  | "add_order_item"
  | "manage_order_discount"
  | "add_order_item_modifier"
  | "remove_order_item_modifier"
  | "duplicate_order_item"
  | "replace_order_item_modifiers"
  | "recall_kds_items"
  | "add_open_item"
  | "create_order"
  | "apply_refund_to_payment"
  | "record_refund_items"
  | "create_reversal"
  | "process_payment"
  // Wave 3.0a — UPDATE-op retrofit
  | "update_order_item_quantity"
  | "update_order_item"
  // Wave 3.0d-4 — bulk status retrofit (Send to Kitchen / Mark Ready / Served / Preparing)
  | "bulk_update_order_item_status"
  // Wave R-0 — refund pipeline idempotency
  | "update_reversal_status"
  | "update_order_payment_status_after_refund"
  // Wave D — manager-PIN service-charge override
  | "override_service_charge";

const FLAG_PREFIX = "idempotent.";
const RECOVERY_UI_KEY = "flag.paymentRecoveryUI";
const REFUND_RECOVERY_UI_KEY = "flag.refundRecoveryUI";
const BLOCKED_ADD_ITEM_KEY = "bad_wifi.blocked_add_item_v1";

// Env-var override: read once at module load. EXPO_PUBLIC_* values are
// inlined at build time, so this evaluates to a constant in production.
const isTruthyEnv = (v: string | undefined): boolean =>
  v === "1" || v === "true";

// Master refund-recovery env var — when truthy, enables all refund
// idempotency RPCs AND the recovery UI in a single toggle.
const ENV_FORCE_REFUND = isTruthyEnv(
  process.env.EXPO_PUBLIC_IDEMPOTENT_APPLY_REFUND,
);

const cache = new Map<string, boolean>();
const listeners = new Set<() => void>();

const ENV_FORCE_ALL = isTruthyEnv(process.env.EXPO_PUBLIC_IDEMPOTENT_ALL);

const envRpcOverride: Partial<Record<IdempotentRpc, boolean>> = {
  seat_guests: isTruthyEnv(process.env.EXPO_PUBLIC_IDEMPOTENT_SEAT_GUESTS),
  add_order_item: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_ADD_ORDER_ITEM,
  ),
  manage_order_discount: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_MANAGE_ORDER_DISCOUNT,
  ),
  add_order_item_modifier: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_ADD_ORDER_ITEM_MODIFIER,
  ),
  remove_order_item_modifier: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_REMOVE_ORDER_ITEM_MODIFIER,
  ),
  duplicate_order_item: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_DUPLICATE_ORDER_ITEM,
  ),
  replace_order_item_modifiers: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_REPLACE_ORDER_ITEM_MODIFIERS,
  ),
  recall_kds_items: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_RECALL_KDS_ITEMS,
  ),
  add_open_item: isTruthyEnv(process.env.EXPO_PUBLIC_IDEMPOTENT_ADD_OPEN_ITEM),
  create_order: isTruthyEnv(process.env.EXPO_PUBLIC_IDEMPOTENT_CREATE_ORDER),
  apply_refund_to_payment: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_APPLY_REFUND_TO_PAYMENT,
  ),
  record_refund_items: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_RECORD_REFUND_ITEMS,
  ),
  create_reversal: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_CREATE_REVERSAL,
  ),
  process_payment: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_PROCESS_PAYMENT,
  ),
  update_order_item_quantity: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_UPDATE_ORDER_ITEM_QUANTITY,
  ),
  update_order_item: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_UPDATE_ORDER_ITEM,
  ),
  bulk_update_order_item_status: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_BULK_UPDATE_ORDER_ITEM_STATUS,
  ),
  update_reversal_status: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_UPDATE_REVERSAL_STATUS,
  ),
  update_order_payment_status_after_refund: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_UPDATE_ORDER_PAYMENT_STATUS,
  ),
  override_service_charge: isTruthyEnv(
    process.env.EXPO_PUBLIC_IDEMPOTENT_OVERRIDE_SERVICE_CHARGE,
  ),
};

function readBool(key: string): boolean {
  if (cache.has(key)) return cache.get(key) as boolean;
  const v = storage.getBoolean(key);
  const value = v ?? false;
  cache.set(key, value);
  return value;
}

function writeBool(key: string, value: boolean): void {
  cache.set(key, value);
  storage.set(key, value);
  for (const l of listeners) {
    try {
      l();
    } catch (err) {
      if (__DEV__) console.warn("[featureFlags] listener error:", err);
    }
  }
}

export function isIdempotentEnabled(rpc: IdempotentRpc): boolean {
  // Env-var override wins for EAS preview/production builds where the
  // dev-flags screen is unreachable. Falls back to MMKV otherwise.
  if (ENV_FORCE_ALL) return true;
  if (envRpcOverride[rpc]) return true;
  // Master refund flag enables all refund-pipeline RPCs as a group.
  if (
    ENV_FORCE_REFUND &&
    (rpc === "update_reversal_status" ||
      rpc === "update_order_payment_status_after_refund" ||
      rpc === "apply_refund_to_payment" ||
      rpc === "record_refund_items" ||
      rpc === "create_reversal")
  )
    return true;
  return readBool(FLAG_PREFIX + rpc);
}

export function setIdempotentEnabled(
  rpc: IdempotentRpc,
  enabled: boolean,
): void {
  writeBool(FLAG_PREFIX + rpc, enabled);
}

export function isPaymentRecoveryUIEnabled(): boolean {
  return readBool(RECOVERY_UI_KEY);
}

export function setPaymentRecoveryUIEnabled(enabled: boolean): void {
  writeBool(RECOVERY_UI_KEY, enabled);
}

/**
 * Wave R-4: gates the refund recovery UI (verifying view + manual
 * reconciliation modal) on cold-start sweep. When false, incomplete
 * refund journals are still written but recovery is not surfaced.
 * EXPO_PUBLIC_IDEMPOTENT_APPLY_REFUND forces this on for staging canary.
 */
export function isRefundRecoveryUIEnabled(): boolean {
  if (ENV_FORCE_REFUND) return true;
  return readBool(REFUND_RECOVERY_UI_KEY);
}

export function setRefundRecoveryUIEnabled(enabled: boolean): void {
  writeBool(REFUND_RECOVERY_UI_KEY, enabled);
}

// Wave 2.8: gates the markOperationBlocked side-channel + dispatcher guard.
// When false, add_item ops with unresolved order ID fall back to the legacy
// retry-burning behavior (rollback path).
export function isBlockedAddItemEnabled(): boolean {
  if (cache.has(BLOCKED_ADD_ITEM_KEY)) {
    return cache.get(BLOCKED_ADD_ITEM_KEY) as boolean;
  }
  const v = storage.getBoolean(BLOCKED_ADD_ITEM_KEY);
  // Default true — opposite of the per-RPC idempotency flags. This is a
  // correctness fix, not a rollout flag.
  const value = v ?? true;
  cache.set(BLOCKED_ADD_ITEM_KEY, value);
  return value;
}

export function setBlockedAddItemEnabled(enabled: boolean): void {
  writeBool(BLOCKED_ADD_ITEM_KEY, enabled);
}

export function subscribeFlags(listener: () => void): () => void {
  listeners.add(listener);
  if (__DEV__ && listeners.size > 25) {
    console.warn(
      `[featureFlags] listener set unexpectedly large (${listeners.size}) — a subscribeFlags call-site is likely not unsubscribing on unmount.`,
    );
  }
  return () => {
    listeners.delete(listener);
  };
}
