/**
 * Offline Sync Service
 *
 * Manages operation queueing when offline and auto-sync when back online.
 * Uses MMKV for blazing-fast synchronous persistence and NetInfo for network monitoring.
 *
 * Enhanced with:
 * - Priority-based processing (orders before items before payments)
 * - Dependency tracking between operations
 * - Operation collapsing for same-entity updates
 * - Full context capture for reliable replay
 */

import { connectionQuality } from "@/lib/network/connectionQuality";
import { DEADLINES } from "@/lib/network/deadlines";
import { isBlockedAddItemEnabled } from "@/lib/network/featureFlags";
import { isSynced, isValidUUID } from "@/lib/offlineIdRegistry";
import { isOwnershipError } from "@/lib/orderAccessControl";
import { startInteraction } from "@/lib/perf";
import { getSyncJSON, setSyncJSON } from "@/lib/storage";
import * as Sentry from "@sentry/react-native";
import { v4 as uuidv4 } from "uuid";
// @ts-ignore - NetInfo types not recognized but package is installed
import NetInfo from "@react-native-community/netinfo";
// @ts-ignore
import type { NetInfoState } from "@react-native-community/netinfo";
import { AppState } from "react-native";

// ============================================================================
// TYPES
// ============================================================================

export type OperationType =
  | "create_order"
  | "add_item"
  | "update_item_quantity"
  | "update_item"
  | "replace_modifiers"
  | "remove_item"
  | "void_item"
  | "update_order_status"
  | "apply_discount"
  | "void_discount" // Void/remove a discount via RPC
  // Kitchen operations
  | "send_to_kitchen" // Updates order status + item statuses
  | "update_item_status" // KDS bulk status (ready/served/preparing) — Wave 3.0d-3
  // Payment operations (unified + legacy)
  | "process_payment" // Unified payment via process_payment_v2
  | "process_cash_payment" // Legacy - routes to process_payment handler
  | "process_card_payment" // Legacy - routes to process_payment handler
  // Floor plan operations
  | "seat_guests"
  | "update_session_status"
  | "merge_table" // Merge additional table into existing session
  | "unmerge_table" // Remove table from merged session
  | "link_order_to_session" // Bidirectional order-session linking
  // Check status operations
  | "close_check" // Close check (lock from edits)
  | "reopen_check" // Reopen closed check
  // Coursing operations
  | "fire_course"
  | "remove_course"
  // Seating operations
  | "set_item_seat"
  // Pre-auth operations (terminal call must be online; only backend sync queued)
  | "process_preauth"
  | "capture_preauth"
  | "increment_preauth"
  | "void_preauth"
  // Cash drawer operations
  | "record_cash_drawer_operation"
  // Offline refund operations
  | "process_cash_refund" // Cash refund (no terminal needed)
  // Tip adjust DB fallback
  | "tip_adjust_db" // Persist tip adjustment to DB after terminal success
  // Order detail sync
  | "update_order_details" // Sync customer/order details to backend
  // Loyalty sync
  | "earn_loyalty"; // Process loyalty earn after order/payment sync

/**
 * Priority levels for operation processing.
 * Lower number = higher priority (processed first).
 */
export const OPERATION_PRIORITY: Record<OperationType, number> = {
  // Order creation must happen first
  create_order: 1,
  seat_guests: 1,
  update_session_status: 1,
  merge_table: 1, // Seating sub-operation, same priority
  unmerge_table: 1, // Seating sub-operation, same priority
  link_order_to_session: 1, // Relationship operation, high priority

  // Item operations after order exists
  add_item: 2,
  apply_discount: 2,
  void_discount: 2, // Same priority as apply_discount
  update_item: 3,
  update_item_quantity: 3,
  replace_modifiers: 3,
  remove_item: 3,
  void_item: 3,

  // Coursing, seating, and kitchen after items
  fire_course: 4,
  remove_course: 4,
  set_item_seat: 3,
  update_order_status: 4,
  send_to_kitchen: 4, // Kitchen send after items synced
  update_item_status: 4, // KDS bulk status — Wave 3.0d-3

  // Check status operations (after items/payments)
  close_check: 4, // Close check
  reopen_check: 4, // Reopen check

  // Pre-auth operations (process before capture)
  process_preauth: 4,
  increment_preauth: 4,
  capture_preauth: 5,
  void_preauth: 5,

  // Payments last (after everything else synced)
  process_payment: 5, // Unified payment via process_payment_v2
  process_cash_payment: 5, // Legacy support
  process_card_payment: 5, // Legacy support

  // Cash drawer operations (same priority as payments)
  record_cash_drawer_operation: 5,

  // Offline refund + tip adjust (after payments)
  process_cash_refund: 5,
  tip_adjust_db: 5,

  // Order detail sync (after items, before payments)
  update_order_details: 3,

  // Loyalty earn after payment/order sync
  earn_loyalty: 6,
};

export interface OfflineOperation {
  id: string;
  type: OperationType;
  params: Record<string, any>;
  localOrderId: string;
  localItemId?: string;
  timestamp: string;
  retryCount: number;
  status: "pending" | "processing" | "failed" | "discarded" | "blocked";
  // Enhanced fields for dependency tracking
  priority: number;
  dependsOn?: string; // ID of operation this depends on (must complete first)
  entityKey?: string; // Unique key for collapsing (e.g., "item:localItemId")
  contextSnapshot?: Record<string, any>; // Full context at time of queueing
  // Phase 6: Operation bundling for atomic execution
  bundleId?: string; // Groups related operations for atomic execution
  bundleSequence?: number; // Order within bundle (0-indexed)
  rollbackOnBundleFailure?: boolean; // Whether to rollback if bundle fails
  expectedVersion?: number; // For optimistic locking checks
  idempotencyKey?: string; // UUID for server-side dedup, auto-generated if not provided
  version?: number; // Schema version — see CURRENT_OPERATION_VERSION
  deadLetterReason?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  // Wave 2.8: track block transitions so the dispatcher can distinguish
  // dependency-wait from real failures and dead-letter pathological loops.
  blockedAtMs?: number;
  blockCount?: number;
  blockReason?: string;
  // PR D.3: timestamp of the FIRST execution attempt. Used by the stuck-op
  // timeout to dead-letter ops that have been bouncing between pending and
  // processing for >STUCK_OP_TIMEOUT_MS without ever resolving — the silent-
  // queue scenarios where retryCount never advanced cleanly.
  firstAttemptedAtMs?: number;
  // Wave 3.0e: last error captured before dead-letter / final failure. Powers
  // the operator-facing subtitle on the per-item Retry chip + order banner so
  // they can tell "network too slow" from "server rejected" at a glance.
  lastError?: { code?: string; message?: string };
  // Wave 3.0e: epoch ms when the op transitioned to dead-letter. Used to
  // render relative timestamps ("10 attempts since 4:32pm") in the subtitle.
  deadLetteredAtMs?: number;
  // Wave 3.0f-2: count of slow-mode reprieves the op has received. When
  // connectionQuality.isSlow() is true at MAX_RETRY_ATTEMPTS, we reset
  // retryCount and increment this counter instead of dead-lettering. Capped
  // at MAX_SLOW_MODE_REPRIEVES — after that, the op finally dead-letters
  // with code 'SUSTAINED_BAD_WIFI'.
  slowModeRetryCount?: number;
}

export interface SyncResult {
  success: boolean;
  operationId: string;
  error?: string;
  backendId?: string; // Backend ID returned from successful operation
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Current schema version — bump when OfflineOperation shape changes incompatibly.
// Ops rehydrated without a version (or version < CURRENT) are dead-lettered on load.
// Coordinate with Temur: process_card_refund from Lane F lands at version 1.
export const CURRENT_OPERATION_VERSION = 1;

const STORAGE_KEY = "offline_operations_queue";
const DEAD_LETTER_STORAGE_KEY = "offline_dead_letter_queue";
// Wave 3.1: bumped 5→10 so sustained bad-WiFi (NLC + airplane flap) doesn't
// dead-letter ops that would succeed once the network recovers. Exponential
// backoff caps at 20s (was 60s), so 10 retries = ~150s of trying instead of
// ~62s. OPERATION_TTL_MS (24h) is the real cutoff.
const MAX_RETRY_ATTEMPTS = 10;
const DEBOUNCE_MS = 3000;
const MAX_QUEUE_SIZE = 500;
const MAX_DEAD_LETTER_SIZE = 50;
const OPERATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OPERATION_TIMEOUT_MS = 30_000;
// Wave 2.8: cap on consecutive block transitions to prevent pathological
// ping-pong (blocked → pending → blocked → ...) when a registry mapping
// keeps being cleared. After this many blocks, the op moves to dead-letter
// with reason 'block_count_exceeded'.
const MAX_BLOCK_COUNT = 20;

// PR D.3: a queued op that's been alive for longer than this without succeeding
// gets force-failed. Belt-and-suspenders for the silent-queue era and any
// future code path that pre-marks an item 'pending' and then never increments
// retryCount cleanly. Wave 3.1: bumped 120s → 600s to match the longer retry
// budget (10 attempts at exponential backoff capped at 20s ≈ 150s + headroom).
const STUCK_OP_TIMEOUT_MS = 600_000;

// Wave 3.0f-2: when connectionQuality.isSlow() at MAX_RETRY_ATTEMPTS, give
// the op another full retry budget instead of dead-lettering. The diagnosis
// is "WiFi is bad, not the op" — dead-lettering would surface a Retry chip
// for an op that will succeed once the network recovers. Capped at this many
// reprieves so we don't loop forever on a permanently-down server.
// 3 reprieves × 10 retries × ~15s avg = ~450s of trying ≈ 7.5 min before
// the op finally dead-letters with SUSTAINED_BAD_WIFI.
const MAX_SLOW_MODE_REPRIEVES = 3;

const PAYMENT_TYPES: OperationType[] = [
  "process_payment",
  "process_cash_payment",
  "process_card_payment",
  "process_preauth",
  "capture_preauth",
  "increment_preauth",
  "void_preauth",
];

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Classify an error as transient (retry-safe) or permanent (should dead-letter).
 *
 * Transient: network timeouts, 5xx, 408, 429
 * Permanent: 400, 401, 403, 404, 409, 422 (validation/auth errors)
 */
export function isTransientError(error: any): boolean {
  if (!error) return true; // No error info → assume transient
  const status =
    error.status ?? error.code ?? error.statusCode ?? error.httpStatus;
  if (typeof status === "number") {
    if (status >= 500) return true;
    if (status === 408 || status === 429) return true;
    return false; // 4xx are permanent
  }
  // Wave 2.8: explicit match for the idempotency-in-flight raise from
  // _idempotency_claim. Postgres errcode 40001 (serialization_failure)
  // surfaces via Supabase JS as { code: '40001', message: 'idempotency_in_flight: ...' }.
  // The default-true at the bottom would already catch it, but making it
  // explicit avoids relying on the fallback for a known transient class.
  if (status === "40001") return true;
  const msg = (error.message ?? error.msg ?? "").toLowerCase();
  if (msg.includes("idempotency_in_flight")) return true;
  if (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("fetch failed")
  ) {
    return true;
  }
  return true; // Default: assume transient so we retry
}

// ============================================================================
// AUTO-RETRY CONFIGURATION (Exponential Backoff)
// ============================================================================
const RETRY_CONFIG = {
  baseDelayMs: 2000, // Initial retry delay: 2 seconds
  // Wave 3.1: capped at 20s (was 60s). Under bad WiFi we want to re-check
  // sooner so a brief connectivity window doesn't sit idle for a minute.
  maxDelayMs: 20000,
  multiplier: 2, // Double the delay each retry
  jitterMs: 1000, // Random jitter up to 1 second
};

/**
 * Calculate exponential backoff delay with jitter
 * Formula: min(maxDelay, baseDelay * multiplier^retryCount) + random(0, jitter)
 */
function calculateBackoffDelay(retryCount: number): number {
  const delay = Math.min(
    RETRY_CONFIG.maxDelayMs,
    RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.multiplier, retryCount),
  );
  const jitter = Math.random() * RETRY_CONFIG.jitterMs;
  return Math.round(delay + jitter);
}

// Track scheduled retry timers for cleanup
let autoRetryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

// ============================================================================
// STATE
// ============================================================================

let isOnline = true;
let forceOfflineOverride = false; // DEV-only: force offline mode for testing
let _offlineSinceTs: number | null = null;
let isInitialized = false;
let isInitializing = false;
let pendingOperations: OfflineOperation[] = [];
let deadLetterQueue: OfflineOperation[] = [];
let syncInProgress = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeNetInfo: (() => void) | null = null;
let periodicSyncTimer: ReturnType<typeof setInterval> | null = null;
let netInfoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let netInfoPollTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null =
  null;

// Indexes for O(1) lookups instead of linear scans
const entityKeyIndex = new Map<string, Set<string>>(); // entityKey -> Set<operationId>
const localOrderIdIndex = new Map<string, Set<string>>(); // localOrderId -> Set<operationId>

function addToIndex(op: OfflineOperation): void {
  const ek = op.entityKey ?? generateEntityKey(op);
  if (ek) {
    let set = entityKeyIndex.get(ek);
    if (!set) {
      set = new Set();
      entityKeyIndex.set(ek, set);
    }
    set.add(op.id);
  }
  if (op.localOrderId) {
    let set = localOrderIdIndex.get(op.localOrderId);
    if (!set) {
      set = new Set();
      localOrderIdIndex.set(op.localOrderId, set);
    }
    set.add(op.id);
  }
}

function removeFromIndex(op: OfflineOperation): void {
  const ek = op.entityKey ?? generateEntityKey(op);
  if (ek) {
    const set = entityKeyIndex.get(ek);
    if (set) {
      set.delete(op.id);
      if (set.size === 0) entityKeyIndex.delete(ek);
    }
  }
  if (op.localOrderId) {
    const set = localOrderIdIndex.get(op.localOrderId);
    if (set) {
      set.delete(op.id);
      if (set.size === 0) localOrderIdIndex.delete(op.localOrderId);
    }
  }
}

function rebuildIndexes(): void {
  entityKeyIndex.clear();
  localOrderIdIndex.clear();
  for (const op of pendingOperations) {
    addToIndex(op);
  }
}

// Callbacks for store integration
let onStatusChange: ((isOnline: boolean) => void) | null = null;
let onQueueChange: ((count: number) => void) | null = null;
let onOperationFailed: ((op: OfflineOperation) => void) | null = null;
let executeOperation: ((op: OfflineOperation) => Promise<boolean>) | null =
  null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the offline sync service.
 * Call this once at app startup.
 */
export async function initOfflineSyncService(config: {
  onStatusChange: (isOnline: boolean) => void;
  onQueueChange: (count: number) => void;
  onOperationFailed?: (op: OfflineOperation) => void;
  executeOperation: (op: OfflineOperation) => Promise<boolean>;
}): Promise<void> {
  // Self-guard: prevent double-init from concurrent calls or re-renders.
  // isInitializing is set synchronously so a second call within the same tick is blocked.
  if (isInitialized || isInitializing) {
    return;
  }
  isInitializing = true;

  onStatusChange = config.onStatusChange;
  onQueueChange = config.onQueueChange;
  onOperationFailed = config.onOperationFailed ?? null;
  executeOperation = config.executeOperation;

  // Configure NetInfo to actively probe reachability (required on Android for
  // isInternetReachable to resolve to true/false instead of staying null).
  NetInfo.configure({
    reachabilityUrl: "https://clients3.google.com/generate_204",
    reachabilityTest: async (response: any) => response.status === 204,
    reachabilityLongTimeout: 60 * 1000, // 60s — periodic re-probe
    reachabilityShortTimeout: 5 * 1000, // 5s  — fast initial probe
    reachabilityRequestTimeout: 15 * 1000, // 15s — per-request timeout
    reachabilityShouldRun: () => true,
    shouldFetchWiFiSSID: false,
  });

  // Load persisted queue
  await loadQueueFromStorage();

  // Start network listener
  startNetworkListener();
  startNetInfoPolling();
  startAppStateListener();

  isInitializing = false;
  isInitialized = true;

  // Check initial state
  const state = await NetInfo.fetch();
  handleNetworkChange(state);

  // Start periodic sync fallback (every 60s) to guard against missed NetInfo events
  startPeriodicSync();

  // Catch missed transitions: if we're online and have pending ops that
  // weren't triggered by handleNetworkChange (e.g. network came online
  // before init completed), schedule a sync now.
  const pendingCount = getActivePendingCount();
  if (isOnline && pendingCount > 0) {
    console.log(
      `[OfflineSync] Init complete: online with ${pendingCount} pending ops, scheduling sync`,
    );
    scheduleSync();
  }

  console.log(
    "[OfflineSync] Initialized with",
    pendingOperations.length,
    "pending operations",
  );
}

/**
 * Cleanup when service is no longer needed.
 */
export function destroyOfflineSyncService(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (periodicSyncTimer) {
    clearInterval(periodicSyncTimer);
    periodicSyncTimer = null;
  }
  if (netInfoRefreshTimer) {
    clearTimeout(netInfoRefreshTimer);
    netInfoRefreshTimer = null;
  }
  if (netInfoPollTimer) {
    clearInterval(netInfoPollTimer);
    netInfoPollTimer = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  // Clear all auto-retry timers
  for (const timer of autoRetryTimers.values()) {
    clearTimeout(timer);
  }
  autoRetryTimers.clear();
  isInitializing = false;
  isInitialized = false;
}

/** Check if the service has been initialized or is currently initializing. */
export function isServiceInitialized(): boolean {
  return isInitialized || isInitializing;
}

/**
 * Periodic sync fallback — guards against missed NetInfo events.
 * Checks every 60s if there are pending operations and we're online, then triggers sync.
 */
const PERIODIC_SYNC_INTERVAL_MS = 60_000;

function startPeriodicSync(): void {
  if (periodicSyncTimer) clearInterval(periodicSyncTimer);
  periodicSyncTimer = setInterval(() => {
    if (!isInitialized || !isOnline || syncInProgress) return;
    const activePending = pendingOperations.filter(
      (op) => op.status === "pending" || op.status === "blocked",
    );
    if (activePending.length > 0) {
      console.log(
        `[OfflineSync] Periodic sync: ${activePending.length} pending ops, triggering sync`,
      );
      processQueue();
    }
  }, PERIODIC_SYNC_INTERVAL_MS);
}

/**
 * Schedule an automatic retry for a specific operation with exponential backoff.
 */
function scheduleAutoRetry(operation: OfflineOperation): void {
  // Clear any existing timer for this operation
  const existingTimer = autoRetryTimers.get(operation.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const delay = calculateBackoffDelay(operation.retryCount);
  console.log(
    `[OfflineSync] Scheduling auto-retry for ${operation.type} (${
      operation.id
    }) in ${delay}ms (attempt ${
      operation.retryCount + 1
    }/${MAX_RETRY_ATTEMPTS})`,
  );

  const timer = setTimeout(async () => {
    autoRetryTimers.delete(operation.id);

    // Check if still online and operation still exists
    if (!isOnline) {
      console.log(`[OfflineSync] Auto-retry cancelled: offline`);
      return;
    }

    const op = pendingOperations.find((o) => o.id === operation.id);
    if (!op || op.status === "discarded" || op.status === "failed") {
      console.log(
        `[OfflineSync] Auto-retry cancelled: operation no longer pending`,
      );
      return;
    }

    console.log(
      `[OfflineSync] Auto-retrying: ${operation.type} (${operation.id})`,
    );

    // Trigger queue processing
    processQueue();
  }, delay);

  autoRetryTimers.set(operation.id, timer);
}

/**
 * Schedule auto-retry for all pending operations after coming back online.
 * Uses a single coalesced timer instead of per-op timers to avoid event loop thrash
 * when many operations are queued (e.g. 100 ops would previously create 100 timers,
 * 99 of which just hit the syncInProgress guard).
 */
function scheduleAllAutoRetries(): void {
  const pendingOps = pendingOperations.filter(
    (op) => op.status === "pending" && op.retryCount > 0,
  );

  if (pendingOps.length === 0) return;

  // Clear all existing auto-retry timers
  for (const t of autoRetryTimers.values()) clearTimeout(t);
  autoRetryTimers.clear();

  // Single timer at the shortest needed delay
  const minDelay = Math.min(
    ...pendingOps.map((op) => calculateBackoffDelay(op.retryCount)),
  );
  const timer = setTimeout(() => {
    autoRetryTimers.clear();
    if (isOnline) processQueue();
  }, minDelay);
  autoRetryTimers.set("coalesced", timer);

  console.log(
    `[OfflineSync] Scheduled coalesced auto-retry for ${pendingOps.length} operations (delay: ${minDelay}ms)`,
  );
}

// ============================================================================
// NETWORK MONITORING
// ============================================================================

function startNetworkListener(): void {
  unsubscribeNetInfo = NetInfo.addEventListener(handleNetworkChange);
}

const NETINFO_POLL_INTERVAL_MS = 10_000;

function startNetInfoPolling(): void {
  if (netInfoPollTimer) clearInterval(netInfoPollTimer);
  netInfoPollTimer = setInterval(() => {
    if (!isInitialized) return;
    NetInfo.fetch()
      .then(handleNetworkChange)
      .catch(() => {});
  }, NETINFO_POLL_INTERVAL_MS);
}

let _lastBackgroundedAt: number | null = null;

function startAppStateListener(): void {
  appStateSubscription?.remove();
  appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
    if (nextAppState !== "active" && isInitialized) {
      _lastBackgroundedAt = Date.now();
    }
    if (nextAppState === "active" && isInitialized) {
      // If we were backgrounded long enough that connection quality may
      // have gone stale, re-evaluate from scratch. Brief flickers don't reset.
      if (
        _lastBackgroundedAt !== null &&
        Date.now() - _lastBackgroundedAt > DEADLINES.appForegroundResetMs
      ) {
        connectionQuality.reset();
      }
      _lastBackgroundedAt = null;
      // Evict stale business day cache on foreground (handles rollover)
      try {
        const { getCurrentBusinessDay } = require("@/lib/businessDay");
        const { todayOrdersCache } = require("@/stores/todayOrdersCache");
        const {
          useStoreSettingsStore,
        } = require("@/stores/useStoreSettingsStore");
        const store = useStoreSettingsStore.getState().selectedStore;
        if (store?.id && store?.timezone) {
          const config = {
            timezone: store.timezone,
            rolloverHour: store.business_day_start_hour ?? 0,
          };
          todayOrdersCache.evictStale(store.id, getCurrentBusinessDay(config));
        }
      } catch {
        /* non-critical */
      }

      NetInfo.fetch()
        .then(handleNetworkChange)
        .catch(() => {});
    }
  });
}

function handleNetworkChange(state: NetInfoState): void {
  // DEV override: force offline regardless of NetInfo state
  if (__DEV__ && forceOfflineOverride) {
    if (isOnline) {
      isOnline = false;
      console.log("[OfflineSync] FORCED OFFLINE (dev override)");
      if (onStatusChange) {
        Promise.resolve(onStatusChange(false)).catch((err) => {
          console.error("[OfflineSync] onStatusChange error:", err);
        });
      }
      notifyOnlineStatusListeners();
    }
    return;
  }

  const wasOnline = isOnline;

  if (state.isConnected === false) {
    isOnline = false;
  } else if (state.isConnected === true && state.isInternetReachable === true) {
    isOnline = true;
    if (netInfoRefreshTimer) {
      clearTimeout(netInfoRefreshTimer);
      netInfoRefreshTimer = null;
    }
  } else if (
    state.isConnected === true &&
    state.isInternetReachable === false
  ) {
    isOnline = false;
  } else {
    // isConnected=true but isInternetReachable=null (ambiguous — common on Android emulator).
    // Treat as offline immediately (pessimistic). NetInfo will fire again when
    // reachability resolves to true after its probe (configured above).
    isOnline = false;
    if (netInfoRefreshTimer) {
      clearTimeout(netInfoRefreshTimer);
      netInfoRefreshTimer = null;
    }
  }

  if (wasOnline !== isOnline) {
    // Track offline duration
    if (!isOnline) {
      _offlineSinceTs = Date.now();
    } else {
      _offlineSinceTs = null;
      // NetInfo flipped from offline → online. Re-evaluate connection
      // quality from scratch instead of carrying stale `slow` state.
      connectionQuality.reset();
    }

    console.log(
      "[OfflineSync] Network status changed:",
      isOnline ? "ONLINE" : "OFFLINE",
    );

    // Fire the callback (async, fire-and-forget with error catching)
    if (onStatusChange) {
      Promise.resolve(onStatusChange(isOnline)).catch((err) => {
        console.error("[OfflineSync] onStatusChange error:", err);
      });
    } else if (isOnline) {
      // Fallback: callback not registered yet (init timing) — flush queue directly
      console.warn(
        "[OfflineSync] onStatusChange not registered — flushing queue directly",
      );
      processQueueNow().catch((err) => {
        console.error("[OfflineSync] Direct queue flush error:", err);
      });
    }

    // Protect against listener errors killing the rest of the function
    try {
      notifyOnlineStatusListeners();
    } catch (err) {
      console.error("[OfflineSync] Online status listener error:", err);
    }

    if (!isOnline) {
      // Cancel auto-retry timers — they'll reschedule when online returns
      for (const t of autoRetryTimers.values()) clearTimeout(t);
      autoRetryTimers.clear();
    } else if (pendingOperations.length > 0) {
      scheduleSync();
      scheduleAllAutoRetries();
    }
  }
}

function scheduleSync(): void {
  if (!isInitialized) return;

  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Debounce 3 seconds before syncing
  debounceTimer = setTimeout(() => {
    processQueue();
  }, DEBOUNCE_MS);

  console.log("[OfflineSync] Sync scheduled in", DEBOUNCE_MS, "ms");
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Generate an entity key for operation collapsing.
 */
function generateEntityKey(op: Partial<OfflineOperation>): string | undefined {
  switch (op.type) {
    case "create_order":
      return `order:${op.localOrderId}`;
    case "add_item":
    case "update_item":
    case "update_item_quantity":
    case "replace_modifiers":
    case "void_item":
    case "remove_item":
      return op.localItemId ? `item:${op.localItemId}` : undefined;
    case "update_order_status":
      return `order_status:${op.localOrderId}`;
    case "update_order_details":
      return `order_details:${op.localOrderId}`;
    case "process_cash_payment":
    case "process_card_payment":
      // Each payment is unique, don't collapse
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Check if an operation can be collapsed into an existing one.
 * Returns the operation to collapse into, or null if no collapsing possible.
 */
function findCollapseTarget(
  entityKey: string,
  newType: OperationType,
): OfflineOperation | null {
  // Only collapse updates, not creates or deletes
  const collapsibleTypes: OperationType[] = [
    "update_item",
    "update_item_quantity",
    "replace_modifiers",
    "update_order_status",
    "update_order_details",
  ];

  if (!collapsibleTypes.includes(newType)) {
    return null;
  }

  // Use entityKeyIndex for O(1) lookup instead of scanning all pendingOperations
  const opIds = entityKeyIndex.get(entityKey);
  if (!opIds || opIds.size === 0) return null;

  let best: OfflineOperation | null = null;
  let bestTime = -1;
  for (const opId of opIds) {
    const op = pendingOperations.find((o) => o.id === opId);
    if (op && op.status === "pending" && collapsibleTypes.includes(op.type)) {
      const t = new Date(op.timestamp).getTime();
      if (t > bestTime) {
        bestTime = t;
        best = op;
      }
    }
  }
  return best;
}

/**
 * Add an operation to the offline queue.
 * Supports priority ordering, dependency tracking, and operation collapsing.
 */
export async function queueOperation(
  op: Omit<
    OfflineOperation,
    "id" | "timestamp" | "retryCount" | "status" | "priority"
  >,
): Promise<string> {
  // Phase 5: All visible orders can have operations queued
  // Local orders (order_xxx) need CREATE_ORDER first
  // Backend orders (UUIDs) already exist and can accept item operations directly

  const priority = OPERATION_PRIORITY[op.type] ?? 99;
  const entityKey = generateEntityKey(op);

  // Check for operation collapsing
  if (entityKey) {
    const collapseTarget = findCollapseTarget(entityKey, op.type);
    if (collapseTarget) {
      // Merge params into existing operation
      collapseTarget.params = { ...collapseTarget.params, ...op.params };
      collapseTarget.timestamp = new Date().toISOString();
      if (op.contextSnapshot) {
        collapseTarget.contextSnapshot = {
          ...collapseTarget.contextSnapshot,
          ...op.contextSnapshot,
        };
      }
      await saveQueueToStorage();
      console.log(
        "[OfflineSync] Collapsed operation into:",
        collapseTarget.id,
        collapseTarget.type,
      );
      return collapseTarget.id;
    }
  }

  const operation: OfflineOperation = {
    ...op,
    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
    priority,
    entityKey,
    idempotencyKey: op.idempotencyKey || uuidv4(),
    version: CURRENT_OPERATION_VERSION,
  };

  pendingOperations.push(operation);
  addToIndex(operation);
  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());

  console.log(
    "[OfflineSync] Queued operation:",
    operation.type,
    operation.id,
    `(priority: ${priority})`,
  );

  // If online, schedule immediate sync
  if (isOnline) {
    scheduleSync();
  }

  return operation.id;
}

/**
 * Queue an operation with explicit dependency on another operation.
 */
export async function queueDependentOperation(
  op: Omit<
    OfflineOperation,
    "id" | "timestamp" | "retryCount" | "status" | "priority"
  >,
  dependsOnOperationId: string,
): Promise<string> {
  const opWithDep = { ...op, dependsOn: dependsOnOperationId };
  return queueOperation(opWithDep);
}

// ============================================================================
// Phase 6: OPERATION BUNDLING
// ============================================================================

/**
 * Bundle options for atomic operation execution.
 */
export interface BundleOptions {
  rollbackOnFailure?: boolean; // If true, mark all ops as failed if any fail
  expectedVersion?: number; // Version check before executing bundle
}

/**
 * Queue multiple operations as an atomic bundle.
 * All operations in the bundle will be executed in sequence.
 * If any operation fails and rollbackOnFailure is true, remaining ops are marked failed.
 *
 * @param operations Array of operations to bundle (executed in order)
 * @param options Bundle execution options
 * @returns Array of operation IDs in bundle order
 */
export async function queueOperationBundle(
  operations: Array<
    Omit<
      OfflineOperation,
      "id" | "timestamp" | "retryCount" | "status" | "priority"
    >
  >,
  options: BundleOptions = {},
): Promise<string[]> {
  if (operations.length === 0) {
    return [];
  }

  const bundleId = `bundle_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const operationIds: string[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const priority = OPERATION_PRIORITY[op.type] ?? 99;
    const entityKey = generateEntityKey(op);

    const operation: OfflineOperation = {
      ...op,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      status: "pending",
      priority,
      entityKey,
      idempotencyKey: op.idempotencyKey || uuidv4(),
      version: CURRENT_OPERATION_VERSION,
      // Bundle-specific fields
      bundleId,
      bundleSequence: i,
      rollbackOnBundleFailure: options.rollbackOnFailure ?? true,
      expectedVersion: i === 0 ? options.expectedVersion : undefined, // Only first op checks version
      // Chain dependency within bundle
      dependsOn: i > 0 ? operationIds[i - 1] : op.dependsOn,
    };

    pendingOperations.push(operation);
    addToIndex(operation);
    operationIds.push(operation.id);

    console.log(
      "[OfflineSync] Bundled operation:",
      operation.type,
      operation.id,
      `(bundle: ${bundleId}, seq: ${i})`,
    );
  }

  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());

  // If online, schedule immediate sync
  if (isOnline) {
    scheduleSync();
  }

  return operationIds;
}

/**
 * Get all operations in a bundle.
 */
export function getBundleOperations(bundleId: string): OfflineOperation[] {
  return pendingOperations
    .filter((op) => op.bundleId === bundleId)
    .sort((a, b) => (a.bundleSequence ?? 0) - (b.bundleSequence ?? 0));
}

/**
 * Mark all remaining operations in a bundle as failed.
 * Called when a bundle operation fails and rollbackOnBundleFailure is true.
 */
export async function failBundle(
  bundleId: string,
  failedOpId: string,
): Promise<void> {
  pendingOperations = pendingOperations.map((op) => {
    if (
      op.bundleId === bundleId &&
      op.id !== failedOpId &&
      op.status === "pending"
    ) {
      return { ...op, status: "discarded" as const };
    }
    return op;
  });

  await saveQueueToStorage();
  console.log(
    "[OfflineSync] Bundle failed, discarded remaining ops:",
    bundleId,
  );
}

/**
 * Check if all operations in a bundle have completed successfully.
 */
export function isBundleComplete(bundleId: string): boolean {
  const bundleOps = getBundleOperations(bundleId);
  if (bundleOps.length === 0) return true;

  return bundleOps.every(
    (op) => op.status !== "pending" && op.status !== "processing",
  );
}

/**
 * Get count of active pending operations (excluding blocked).
 */
function getActivePendingCount(): number {
  return pendingOperations.filter(
    (op) => op.status === "pending" || op.status === "blocked",
  ).length;
}

/**
 * Remove an operation from the queue (after success or permanent failure).
 */
export async function removeOperation(operationId: string): Promise<void> {
  const removed = pendingOperations.find((op) => op.id === operationId);
  if (removed) removeFromIndex(removed);
  pendingOperations = pendingOperations.filter((op) => op.id !== operationId);
  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());
}

/**
 * Drop all `pending` (not yet executing) operations matching an entity key.
 *
 * Used when a local entity is removed before its mutations have synced —
 * e.g., user adds an item then removes it before the queued add_item runs.
 * Without this, the queue would replay the add_item for a non-existent
 * local entity.
 *
 * Operations in `processing` state are intentionally NOT dropped (they're
 * mid-flight; let them complete normally). Returns the count of dropped ops
 * for observability.
 */
export async function cancelPendingByEntity(
  entityKey: string,
): Promise<{ dropped: number }> {
  if (!entityKey) return { dropped: 0 };
  const before = pendingOperations.length;
  const toDrop = pendingOperations.filter(
    (op) => op.entityKey === entityKey && op.status === "pending",
  );
  if (toDrop.length === 0) return { dropped: 0 };
  for (const op of toDrop) removeFromIndex(op);
  pendingOperations = pendingOperations.filter(
    (op) => !(op.entityKey === entityKey && op.status === "pending"),
  );
  const dropped = before - pendingOperations.length;
  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());
  return { dropped };
}

/**
 * Mark an operation as discarded (conflict resolution).
 */
export async function discardOperation(operationId: string): Promise<void> {
  pendingOperations = pendingOperations.map((op) =>
    op.id === operationId ? { ...op, status: "discarded" as const } : op,
  );
  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());
}

/**
 * Retry a failed operation.
 */
export async function retryFailedOperation(operationId: string): Promise<void> {
  const op = pendingOperations.find((o) => o.id === operationId);
  if (op && op.status === "failed") {
    op.status = "pending";
    op.retryCount = 0;
    await saveQueueToStorage();
    onQueueChange?.(getActivePendingCount());

    if (isOnline) {
      scheduleSync();
    }
  }
}

/**
 * Get count of pending operations.
 */
export function getPendingCount(): number {
  return pendingOperations.filter((op) => op.status === "pending").length;
}

/**
 * Get count of failed operations.
 */
export function getFailedCount(): number {
  return pendingOperations.filter((op) => op.status === "failed").length;
}

/**
 * Get all failed operations (for UI display).
 */
export function getFailedOperations(): OfflineOperation[] {
  return pendingOperations.filter((op) => op.status === "failed");
}

/**
 * Get pending payment operations count.
 */
export function getPendingPaymentsCount(): number {
  return pendingOperations.filter(
    (op) =>
      (op.type === "process_payment" ||
        op.type === "process_cash_payment" ||
        op.type === "process_card_payment") &&
      (op.status === "pending" ||
        op.status === "blocked" ||
        op.status === "processing"),
  ).length;
}

/**
 * Get failed payment operations.
 */
export function getFailedPayments(): OfflineOperation[] {
  return pendingOperations.filter(
    (op) =>
      (op.type === "process_payment" ||
        op.type === "process_cash_payment" ||
        op.type === "process_card_payment") &&
      op.status === "failed",
  );
}

/**
 * Get all operations for a specific order.
 */
export function getOperationsForOrder(
  localOrderId: string,
): OfflineOperation[] {
  return pendingOperations.filter((op) => op.localOrderId === localOrderId);
}

/**
 * Check if there's a pending create_order operation for a given order.
 * Used to block items/payments until order is created.
 */
export function hasPendingOrderCreation(localOrderId: string): boolean {
  return pendingOperations.some(
    (op) =>
      op.localOrderId === localOrderId &&
      op.type === "create_order" &&
      (op.status === "pending" ||
        op.status === "processing" ||
        op.status === "blocked"),
  );
}

/**
 * Get the create_order operation ID for a given order, if it exists.
 */
export function getOrderCreationOperationId(
  localOrderId: string,
): string | null {
  const op = pendingOperations.find(
    (op) =>
      op.localOrderId === localOrderId &&
      op.type === "create_order" &&
      (op.status === "pending" ||
        op.status === "processing" ||
        op.status === "blocked"),
  );
  return op?.id || null;
}

/**
 * Wave 2.8: side-channel "blocked" transition for the executor.
 *
 * Used when an op's prerequisites are unmet at execution time (e.g. add_item
 * waiting on order ID resolution). Marks the op blocked without bumping the
 * retry counter — the dispatcher honors `status === 'blocked'` and skips
 * `handleOperationFailure`, so the op naturally re-evaluates on the next
 * `updateBlockedOperations` cycle without burning the retry budget.
 *
 * Caps at MAX_BLOCK_COUNT to prevent unbounded ping-pong when a registry
 * mapping keeps being cleared. If the op's order has been voided/cancelled
 * since queueing, sets status='discarded' instead so it never wakes.
 *
 * Gated by the kill switch flag `bad_wifi.blocked_add_item_v1` (default true).
 */
export async function markOperationBlocked (
  operationId: string,
  reason: string
): Promise<void> {
  if (!isBlockedAddItemEnabled()) {
    // Kill switch off — fall back to legacy retry-burning behavior.
    return
  }

  const op = pendingOperations.find(o => o.id === operationId)
  if (!op) return

  // If the order has been voided/cancelled since this op was queued, mark
  // discarded so it never wakes. Lazy require to avoid circular deps.
  try {
    const { useOrderStore } = require('@/stores/useOrderStore')
    const order = useOrderStore.getState().ordersById[op.localOrderId]
    if (
      order?.order_status === 'void' ||
      order?.order_status === 'cancelled'
    ) {
      op.status = 'discarded'
      await saveQueueToStorage()
      return
    }
  } catch {
    // Store lookup failed — proceed with block. Better to block than to
    // misclassify as discarded based on a missing store.
  }

  const blockCount = (op.blockCount ?? 0) + 1
  if (blockCount > MAX_BLOCK_COUNT) {
    console.warn(
      `[OfflineSync] markOperationBlocked: ${op.type} (${op.id}) exceeded MAX_BLOCK_COUNT (${MAX_BLOCK_COUNT}) — moving to dead-letter`
    )
    op.lastError = {
      code: 'BLOCK_COUNT_EXCEEDED',
      message: `Blocked ${blockCount} times — dependency never resolved`
    }
    moveToDeadLetter(op)
    pendingOperations = pendingOperations.filter(o => o.id !== op.id)
    await saveQueueToStorage()
    try {
      Sentry.addBreadcrumb({
        category: 'offline_sync.dead_letter_after_block',
        level: 'warning',
        message: `${op.type} dead-lettered after ${blockCount} blocks`,
        data: {
          op_type: op.type,
          local_order_id: op.localOrderId,
          reason: 'block_count_exceeded',
          underlying_reason: reason,
          block_count: blockCount
        }
      })
    } catch {}
    return
  }

  op.status = 'blocked'
  op.blockCount = blockCount
  op.blockReason = reason
  if (!op.blockedAtMs) {
    op.blockedAtMs = Date.now()
  }
  await saveQueueToStorage()

  try {
    Sentry.addBreadcrumb({
      category: 'offline_sync.op_blocked',
      level: 'info',
      message: `${op.type} blocked: ${reason}`,
      data: {
        op_type: op.type,
        local_order_id: op.localOrderId,
        reason,
        block_count: blockCount,
        depends_on: op.dependsOn ?? null
      }
    })
  } catch {}
}

/**
 * Cancel all operations for an order (e.g., when order is voided).
 */
export async function cancelOrderOperations(
  localOrderId: string,
): Promise<void> {
  const opsToCancel = pendingOperations.filter(
    (op) => op.localOrderId === localOrderId && op.status !== "discarded",
  );

  for (const op of opsToCancel) {
    op.status = "discarded";
  }

  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());
  console.log(
    `[OfflineSync] Cancelled ${opsToCancel.length} operations for order:`,
    localOrderId,
  );
}

/**
 * Update operation params (e.g., after ID resolution).
 */
export async function updateOperationParams(
  operationId: string,
  params: Record<string, any>,
): Promise<void> {
  const op = pendingOperations.find((o) => o.id === operationId);
  if (op) {
    op.params = { ...op.params, ...params };
    await saveQueueToStorage();
  }
}

// Online status subscribers (for useSyncExternalStore in hooks)
const onlineStatusListeners = new Set<() => void>();

export function subscribeOnlineStatus(listener: () => void): () => void {
  onlineStatusListeners.add(listener);
  return () => {
    onlineStatusListeners.delete(listener);
  };
}

function notifyOnlineStatusListeners(): void {
  for (const listener of onlineStatusListeners) listener();
}

/**
 * Get current online status.
 *
 * Returns false if either NetInfo says offline OR the connection-quality
 * state machine has flipped to slow (repeated deadline exceedances).
 * This makes existing offline branches in stores/services automatically
 * route to the queue when WiFi is technically connected but practically dead.
 */
export function getIsOnline(): boolean {
  return isOnline && !connectionQuality.isSlow();
}

/**
 * Raw NetInfo-based online status, ignoring connection-quality slow-mode.
 * For diagnostics/UI only — not for routing decisions.
 */
export function getRawIsOnline(): boolean {
  return isOnline;
}

/**
 * Get how long the app has been offline (in ms). Returns 0 if currently online.
 */
export function getOfflineDurationMs(): number {
  if (_offlineSinceTs === null) return 0;
  return Date.now() - _offlineSinceTs;
}

/**
 * DEV-only: Force the app into offline mode for testing.
 * When enabled, NetInfo polling/listeners are suppressed and the app stays offline.
 */
export function setForceOffline(force: boolean): void {
  if (!__DEV__) return;
  forceOfflineOverride = force;
  if (force) {
    isOnline = false;
    console.log("[OfflineSync] FORCED OFFLINE (dev override)");
    if (onStatusChange) {
      Promise.resolve(onStatusChange(false)).catch((err) => {
        console.error("[OfflineSync] onStatusChange error:", err);
      });
    }
    notifyOnlineStatusListeners();
  } else {
    console.log("[OfflineSync] Force offline CLEARED — re-checking network");
    NetInfo.fetch()
      .then(handleNetworkChange)
      .catch(() => {});
  }
}

/**
 * DEV-only: Check if force-offline override is active.
 */
export function getForceOffline(): boolean {
  return __DEV__ ? forceOfflineOverride : false;
}

/**
 * Check if auto-retry is in progress (for UI indicator).
 */
export function isAutoRetryInProgress(): boolean {
  return autoRetryTimers.size > 0;
}

/**
 * Get count of operations scheduled for auto-retry.
 */
export function getAutoRetryCount(): number {
  return autoRetryTimers.size;
}

/**
 * Force sync now (for manual retry button).
 */
export async function syncNow(): Promise<void> {
  if (isOnline) {
    await processQueue();
  } else {
    console.warn("[OfflineSync] syncNow — skipped: isOnline=false");
  }
}

/**
 * Immediately flush the queue, cancelling any pending debounce timer.
 * Used by onStatusChange to ensure create_order ops complete before reconciliation.
 */
export async function processQueueNow(options?: {
  force?: boolean;
}): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (options?.force) {
    // User-initiated: clear force-offline override if set
    if (forceOfflineOverride) {
      console.warn(
        "[OfflineSync] processQueueNow(force) — clearing forceOfflineOverride",
      );
      forceOfflineOverride = false;
    }
    // Refresh network state before processing
    try {
      const netState = await NetInfo.fetch();
      handleNetworkChange(netState);
    } catch {}
    // Reset stuck processing state
    if (syncInProgress) {
      console.warn(
        "[OfflineSync] processQueueNow(force) — clearing stuck syncInProgress lock",
      );
      syncInProgress = false;
    }
    for (const op of pendingOperations) {
      if (op.status === "processing") {
        op.status = "pending";
      }
    }
  }

  if (options?.force && !executeOperation) {
    console.warn(
      "[OfflineSync] processQueueNow(force) — executeOperation not registered. Service may need re-initialization.",
    );
  }

  if (isOnline) {
    await processQueue();
  } else {
    console.warn("[OfflineSync] processQueueNow — skipped: isOnline=false");
  }
}

/** Reset stuck "processing" ops + force-clear syncInProgress lock, then trigger sync. */
export async function forceRetryAllPending(): Promise<void> {
  let changed = false;
  for (const op of pendingOperations) {
    if (op.status === "processing") {
      op.status = "pending";
      changed = true;
    }
  }
  if (syncInProgress) {
    console.warn(
      "[OfflineSync] forceRetryAllPending: force-clearing syncInProgress lock (was stuck)",
    );
  }
  syncInProgress = false;
  if (changed) await saveQueueToStorage();
  if (isOnline) scheduleSync();
}

/** Expose all non-discarded ops for UI inspection (blocked/processing counts). */
export function getPendingOperations(): OfflineOperation[] {
  return pendingOperations.filter((op) => op.status !== "discarded");
}

/**
 * Get a read-only snapshot of the current queue for inspection.
 */
export function getQueueSnapshot(): readonly OfflineOperation[] {
  return pendingOperations;
}

/**
 * Get a detailed status of the queue for debugging.
 */
export function getQueueStatus(): {
  total: number;
  pending: number;
  blocked: number;
  processing: number;
  failed: number;
  byType: Record<string, number>;
  byOrder: Record<string, { types: string[]; hasCreateOrder: boolean }>;
} {
  const allOps = pendingOperations.filter((op) => op.status !== "discarded");
  const byType: Record<string, number> = {};
  const byOrder: Record<string, { types: string[]; hasCreateOrder: boolean }> =
    {};

  for (const op of allOps) {
    byType[op.type] = (byType[op.type] || 0) + 1;

    if (op.localOrderId) {
      if (!byOrder[op.localOrderId]) {
        byOrder[op.localOrderId] = { types: [], hasCreateOrder: false };
      }
      byOrder[op.localOrderId].types.push(`${op.type}(${op.status})`);
      if (op.type === "create_order") {
        byOrder[op.localOrderId].hasCreateOrder = true;
      }
    }
  }

  return {
    total: allOps.length,
    pending: allOps.filter((op) => op.status === "pending").length,
    blocked: allOps.filter((op) => op.status === "blocked").length,
    processing: allOps.filter((op) => op.status === "processing").length,
    failed: allOps.filter((op) => op.status === "failed").length,
    byType,
    byOrder,
  };
}

/**
 * Log the current queue status to console (for debugging).
 */
export function logQueueStatus(): void {
  const status = getQueueStatus();
  console.log("[OfflineSync] ====== QUEUE STATUS ======");
  console.log(`[OfflineSync] Total: ${status.total}`);
  console.log(`[OfflineSync]   Pending: ${status.pending}`);
  console.log(`[OfflineSync]   Blocked: ${status.blocked}`);
  console.log(`[OfflineSync]   Processing: ${status.processing}`);
  console.log(`[OfflineSync]   Failed: ${status.failed}`);
  console.log("[OfflineSync] By type:", JSON.stringify(status.byType));
  console.log("[OfflineSync] By order:");
  for (const [orderId, info] of Object.entries(status.byOrder)) {
    console.log(`[OfflineSync]   ${orderId}:`);
    console.log(`[OfflineSync]     hasCreateOrder: ${info.hasCreateOrder}`);
    console.log(`[OfflineSync]     operations: ${info.types.join(", ")}`);
  }
}

// ============================================================================
// DEAD LETTER QUEUE MANAGEMENT
// ============================================================================

// Wave 3.0e: subscribers fire whenever the dead-letter queue changes (op
// moved in, retry pulled out, discarded). Used by the inline banner +
// per-item chip surfaces so they refresh immediately on dead-letter rather
// than waiting for the next render tick.
const deadLetterSubscribers = new Set<() => void>();

function notifyDeadLetterSubscribers(): void {
  for (const fn of deadLetterSubscribers) {
    try {
      fn();
    } catch (err) {
      console.error("[OfflineSync] dead-letter subscriber error:", err);
    }
  }
}

export function subscribeToDeadLetterChanges(fn: () => void): () => void {
  deadLetterSubscribers.add(fn);
  return () => {
    deadLetterSubscribers.delete(fn);
  };
}

function moveToDeadLetter(operation: OfflineOperation): void {
  deadLetterQueue.push({
    ...operation,
    status: "failed" as const,
    deadLetteredAtMs: operation.deadLetteredAtMs ?? Date.now(),
  });
  // FIFO eviction: discard oldest entries when cap is exceeded
  if (deadLetterQueue.length > MAX_DEAD_LETTER_SIZE) {
    deadLetterQueue = deadLetterQueue.slice(-MAX_DEAD_LETTER_SIZE);
  }
  saveDeadLetterToStorage();
  notifyDeadLetterSubscribers();
}

function loadDeadLetterFromStorage(): void {
  try {
    const stored = getSyncJSON<OfflineOperation[]>(DEAD_LETTER_STORAGE_KEY);
    if (stored) {
      deadLetterQueue =
        stored.length > MAX_DEAD_LETTER_SIZE
          ? stored.slice(-MAX_DEAD_LETTER_SIZE)
          : stored;
    }
  } catch (error) {
    console.error("[OfflineSync] Failed to load dead letter queue:", error);
    deadLetterQueue = [];
  }
  // Wave 3.0e: notify subscribers so the banner repopulates if the user
  // reopened the app to find lingering ops from a previous session.
  if (deadLetterQueue.length > 0) {
    notifyDeadLetterSubscribers()
  }
  // Wave 3.0e: notify subscribers so the banner repopulates if the user
  // reopened the app to find lingering ops from a previous session.
  if (deadLetterQueue.length > 0) {
    notifyDeadLetterSubscribers()
  }
}

function saveDeadLetterToStorage(): void {
  try {
    setSyncJSON(DEAD_LETTER_STORAGE_KEY, deadLetterQueue);
  } catch (error) {
    console.error("[OfflineSync] Failed to save dead letter queue:", error);
  }
}

/**
 * Get all dead-lettered operations for operator inspection.
 */
export function getDeadLetterOperations(): OfflineOperation[] {
  return [...deadLetterQueue];
}

/**
 * Get count of dead-lettered operations.
 */
export function getDeadLetterCount(): number {
  return deadLetterQueue.length;
}

/**
 * Retry a dead-lettered operation by moving it back to the pending queue.
 */
export async function retryDeadLetterOperation(
  operationId: string,
): Promise<void> {
  const idx = deadLetterQueue.findIndex((op) => op.id === operationId);
  if (idx === -1) return;

  const op = deadLetterQueue[idx];
  deadLetterQueue.splice(idx, 1);
  saveDeadLetterToStorage();
  notifyDeadLetterSubscribers();

  op.status = "pending";
  op.retryCount = 0;
  pendingOperations.push(op);
  addToIndex(op);
  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());

  if (isOnline) scheduleSync();
}

/**
 * __DEV__-only: synthesize a dead-lettered op for UI verification.
 * Bypasses the queue/retry pipeline so the operator can validate banner +
 * per-item chip rendering without burning through 11 NLC retries.
 *
 * Usage from Metro console: __seedDeadLetter({ type, localOrderId, ... })
 */
export function _devSeedDeadLetter(
  partial: Partial<OfflineOperation> & {
    type: OperationType;
    localOrderId: string;
  },
): string {
  if (!__DEV__) {
    throw new Error("_devSeedDeadLetter is __DEV__ only");
  }
  const id =
    partial.id ??
    `op_seed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const op: OfflineOperation = {
    id,
    type: partial.type,
    params: partial.params ?? {},
    localOrderId: partial.localOrderId,
    localItemId: partial.localItemId,
    timestamp: partial.timestamp ?? new Date().toISOString(),
    retryCount: partial.retryCount ?? MAX_RETRY_ATTEMPTS,
    status: "failed",
    priority: OPERATION_PRIORITY[partial.type] ?? 99,
    lastError: partial.lastError ?? {
      code: "DEADLINE_EXCEEDED",
      message: "Seeded for UI verification",
    },
    deadLetteredAtMs: partial.deadLetteredAtMs ?? Date.now(),
  };
  moveToDeadLetter(op);
  return id;
}

/**
 * Permanently discard a dead-lettered operation.
 */
export function discardDeadLetterOperation(operationId: string): void {
  const before = deadLetterQueue.length;
  deadLetterQueue = deadLetterQueue.filter((op) => op.id !== operationId);
  if (deadLetterQueue.length !== before) {
    saveDeadLetterToStorage();
    notifyDeadLetterSubscribers();
  }
}

/**
 * PR D.2: retry every failed-or-dead-lettered operation tied to a given
 * local item id. Used by the FailedItemRow "Retry" affordance — the cashier
 * doesn't know about op ids, only item ids.
 *
 * Resets retryCount, restores from dead-letter if needed, and kicks
 * scheduleSync. Returns the number of operations re-queued (0 if none found).
 */
export async function retrySyncForItem(itemId: string): Promise<number> {
  let count = 0;

  // Pull matching ops out of the dead-letter queue first.
  const dlMatches = deadLetterQueue.filter((op) => op.localItemId === itemId);
  for (const op of dlMatches) {
    deadLetterQueue = deadLetterQueue.filter((o) => o.id !== op.id);
    op.status = "pending";
    op.retryCount = 0;
    op.firstAttemptedAtMs = undefined;
    pendingOperations.push(op);
    addToIndex(op);
    count++;
  }
  if (dlMatches.length > 0) saveDeadLetterToStorage();

  // Reset any failed ops still in the active queue.
  for (const op of pendingOperations) {
    if (op.localItemId === itemId && op.status === "failed") {
      op.status = "pending";
      op.retryCount = 0;
      op.firstAttemptedAtMs = undefined;
      count++;
    }
  }

  if (count > 0) {
    await saveQueueToStorage();
    onQueueChange?.(getActivePendingCount());
    if (isOnline) scheduleSync();
  }

  return count;
}

/**
 * PR D.2 / Lever 3: drop every queued operation tied to a local item id.
 * Used by the FailedItemRow "Remove" affordance when the user gives up on
 * a permanently-failed add. The local optimistic item is removed by the
 * caller via removeItemFromActiveOrder.
 */
export async function dropQueuedOpsForItem(itemId: string): Promise<number> {
  let count = 0;
  const before = pendingOperations.length;
  pendingOperations = pendingOperations.filter((op) => {
    if (op.localItemId === itemId) {
      removeFromIndex(op);
      count++;
      return false;
    }
    return true;
  });
  const dlBefore = deadLetterQueue.length;
  deadLetterQueue = deadLetterQueue.filter((op) => op.localItemId !== itemId);
  count += dlBefore - deadLetterQueue.length;

  if (pendingOperations.length !== before) await saveQueueToStorage();
  if (deadLetterQueue.length !== dlBefore) saveDeadLetterToStorage();
  onQueueChange?.(getActivePendingCount());
  return count;
}

/**
 * Prune expired operations from the pending queue.
 * Non-payment ops older than OPERATION_TTL_MS are discarded.
 * Payment ops are moved to dead letter for manual review.
 */
export async function pruneExpiredOperations(): Promise<number> {
  const cutoff = Date.now() - OPERATION_TTL_MS;
  let pruned = 0;

  pendingOperations = pendingOperations.filter((op) => {
    if (op.status === "discarded") return false;
    const opTime = new Date(op.timestamp).getTime();
    if (opTime >= cutoff) return true;

    pruned++;
    if (PAYMENT_TYPES.includes(op.type)) {
      op.lastError = {
        code: "OPERATION_TTL_EXCEEDED",
        message: "Op exceeded 24h TTL — manual review required",
      };
      moveToDeadLetter(op);
      console.log(
        `[OfflineSync] Expired payment op moved to dead letter: ${op.id}`,
      );
    } else {
      console.log(`[OfflineSync] Expired op discarded: ${op.type} (${op.id})`);
    }
    return false;
  });

  if (pruned > 0) {
    rebuildIndexes();
    await saveQueueToStorage();
    onQueueChange?.(getActivePendingCount());
  }
  return pruned;
}

/**
 * Enforce queue size limit. Drops oldest non-critical operations when exceeded.
 */
async function enforceQueueSizeLimit(): Promise<void> {
  const active = pendingOperations.filter(
    (op) => op.status !== "discarded" && op.status !== "failed",
  );
  if (active.length <= MAX_QUEUE_SIZE) return;

  const excess = active.length - MAX_QUEUE_SIZE;
  const nonCriticalTypes: OperationType[] = [
    "update_order_status",
    "fire_course",
    "remove_course",
    "update_session_status",
  ];

  let dropped = 0;
  pendingOperations = pendingOperations.map((op) => {
    if (
      dropped < excess &&
      op.status === "pending" &&
      nonCriticalTypes.includes(op.type)
    ) {
      dropped++;
      return { ...op, status: "discarded" as const };
    }
    return op;
  });

  if (dropped > 0) {
    console.warn(
      `[OfflineSync] Queue size limit exceeded, dropped ${dropped} non-critical ops`,
    );
    await saveQueueToStorage();
    onQueueChange?.(getActivePendingCount());
  }
}

// ============================================================================
// QUEUE PROCESSING
// ============================================================================

/**
 * Sort operations by priority and timestamp for processing order.
 */
function sortOperationsByPriority(ops: OfflineOperation[]): OfflineOperation[] {
  return [...ops].sort((a, b) => {
    // First by priority (lower = higher priority)
    const priorityDiff = (a.priority ?? 99) - (b.priority ?? 99);
    if (priorityDiff !== 0) return priorityDiff;

    // Then by timestamp (older first)
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
}

/**
 * Check if an operation's dependencies are satisfied.
 *
 * IMPLICIT DEPENDENCIES:
 * - add_item, process_payment, process_cash_payment, process_card_payment
 *   all implicitly depend on create_order for the same localOrderId.
 * - These operations will be blocked until create_order completes.
 */
function areDependenciesSatisfied(op: OfflineOperation): boolean {
  // EXPLICIT dependency check
  if (op.dependsOn) {
    const dependency = pendingOperations.find((o) => o.id === op.dependsOn);

    // If dependency doesn't exist in queue, it's either completed or never existed
    if (!dependency) {
      // Check if it was removed (completed) - continue
    } else if (
      dependency.status === "pending" ||
      dependency.status === "processing" ||
      dependency.status === "blocked"
    ) {
      return false;
    }
  }

  // IMPLICIT dependency: items and payments must wait for order creation
  const typesRequiringOrder = [
    "add_item",
    "apply_discount",
    "void_discount",
    "process_payment",
    "process_cash_payment",
    "process_card_payment",
    "process_preauth",
    "capture_preauth",
    "increment_preauth",
    "void_preauth",
    "update_order_status",
    "fire_course",
    "remove_course",
    "send_to_kitchen",
  ];

  if (typesRequiringOrder.includes(op.type) && op.localOrderId) {
    // Use localOrderIdIndex for O(1) lookup instead of scanning all pendingOperations
    const siblingIds = localOrderIdIndex.get(op.localOrderId);
    let orderCreationPending = false;
    if (siblingIds) {
      for (const sibId of siblingIds) {
        const sib = pendingOperations.find((o) => o.id === sibId);
        if (
          sib &&
          sib.type === "create_order" &&
          (sib.status === "pending" ||
            sib.status === "processing" ||
            sib.status === "blocked")
        ) {
          orderCreationPending = true;
          break;
        }
      }
    }

    if (orderCreationPending) {
      console.log(
        `[OfflineSync] ${op.type} blocked - waiting for create_order of ${op.localOrderId}`,
      );
      return false;
    }
  }

  // ================================================================
  // NEW (Phase 3.3): RELATIONSHIP dependency checking
  // ================================================================
  // Check if referenced entities have been synced (have backend UUIDs)

  // link_order_to_session needs both order AND session to be synced
  if (op.type === "link_order_to_session") {
    const { orderId, sessionId } = op.params;

    // Check if order has been synced (has backend UUID)
    const orderReady = isValidUUID(orderId) || isSynced(orderId);
    if (!orderReady) {
      console.log(
        `[OfflineSync] link_order_to_session blocked - order ${orderId} not synced yet`,
      );
      return false;
    }

    // Check if session has been synced (has backend UUID)
    const sessionReady = isValidUUID(sessionId) || isSynced(sessionId);
    if (!sessionReady) {
      console.log(
        `[OfflineSync] link_order_to_session blocked - session ${sessionId} not synced yet`,
      );
      return false;
    }
  }

  // Do NOT hard-block item ops on registry sync status alone.
  // After reconnect, order ID resolution can be available via store rekey/mapping
  // before offlineIdRegistry reflects it. The executor performs authoritative
  // resolution and can retry safely when truly unresolved.

  return true;
}

/**
 * Get all operations that are ready to process (pending + dependencies satisfied).
 */
function getReadyOperations(): OfflineOperation[] {
  const pending = pendingOperations.filter((op) => op.status === "pending");
  const ready = pending.filter((op) => areDependenciesSatisfied(op));
  return sortOperationsByPriority(ready);
}

/**
 * Mark operations as blocked if their dependencies aren't satisfied.
 */
async function updateBlockedOperations(): Promise<void> {
  let changed = false;
  const timedOutOps: OfflineOperation[] = [];

  for (const op of pendingOperations) {
    if (op.status === "pending" && !areDependenciesSatisfied(op)) {
      op.status = "blocked";
      changed = true;
    } else if (op.status === "blocked") {
      if (areDependenciesSatisfied(op)) {
        op.status = "pending";
        changed = true;
        // Wave 2.8: surface dependency-clear as a discrete event so we can
        // measure wake-on-create-order latency in dashboards.
        try {
          Sentry.addBreadcrumb({
            category: "offline_sync.op_unblocked",
            level: "info",
            message: `${op.type} unblocked`,
            data: {
              op_type: op.type,
              local_order_id: op.localOrderId,
              block_count: op.blockCount ?? 0,
              blocked_for_ms: op.blockedAtMs
                ? Date.now() - op.blockedAtMs
                : null,
            },
          });
        } catch {}
      } else {
        // Timeout handling is ONLY safe for explicit dependencies.
        // For implicit deps (e.g. add_item waiting on create_order/order ID sync),
        // op.dependsOn is usually undefined. Treating "no parent" as dead/missing
        // incorrectly dead-letters valid offline item ops before reconciliation can recover.
        const BLOCKED_TIMEOUT_MS = 5 * 60 * 1000;
        const blockedDuration = Date.now() - new Date(op.timestamp).getTime();
        if (blockedDuration > BLOCKED_TIMEOUT_MS && op.dependsOn) {
          const parent = op.dependsOn
            ? pendingOperations.find((p) => p.id === op.dependsOn)
            : null;
          const parentDead =
            parent &&
            (parent.status === "failed" || parent.status === "discarded");
          if (parentDead || !parent) {
            console.log(
              `[OfflineSync] Blocked operation timed out (${Math.round(
                blockedDuration / 1000,
              )}s): ${op.type} (${op.id})`,
            );
            op.lastError = {
              code: "BLOCKED_PARENT_DEAD",
              message: parent
                ? "Parent op failed — child can't proceed"
                : "Parent op missing — orphaned dependency",
            };
            moveToDeadLetter(op);
            timedOutOps.push(op);
            changed = true;
          }
        }
      }
    }
  }

  // Remove timed-out operations from pendingOperations
  if (timedOutOps.length > 0) {
    const timedOutIds = new Set(timedOutOps.map((o) => o.id));
    pendingOperations = pendingOperations.filter(
      (op) => !timedOutIds.has(op.id),
    );
    // Rebuild indexes after bulk removal
    rebuildIndexes();
  }

  if (changed) {
    await saveQueueToStorage();
  }
}

/**
 * Handle a failed operation: classify the error and decide between
 * retry (transient), dead-letter (permanent or max retries), or discard.
 */
async function handleOperationFailure(
  operation: OfflineOperation,
  error: any,
): Promise<void> {
  // Wave 2.5: if the op was already removed externally (e.g., the executor
  // detected ownership rejection inline and called `dropQueuedOpsForItem`),
  // skip dead-lettering — `moveToDeadLetter` would otherwise re-create a
  // stale entry that the cart row would render as "Failed N times".
  const stillPending = pendingOperations.some((o) => o.id === operation.id);
  const stillDeadLettered = deadLetterQueue.some((o) => o.id === operation.id);
  if (!stillPending && !stillDeadLettered) {
    console.log(
      `[OfflineSync] handleOperationFailure: ${operation.type} (${operation.id}) already removed, skipping`,
    );
    return;
  }

  // Wave 2.5: ownership rejection is permanent and instant — no point burning
  // through MAX_RETRY_ATTEMPTS or the slow-mode reprieve. Tag with the
  // `OWNERSHIP_REJECTED` code so `lib/offlineSyncSubtitles.ts` renders the
  // operator-facing subtitle "Order owned by another station" instead of
  // "Failed N times". `isRetryable` (same module) returns false for this code,
  // so the cart row's Retry chip auto-hides and the user only sees Remove.
  if (isOwnershipError(null, error)) {
    console.log(
      `[OfflineSync] ✗ DEAD-LETTERED (ownership rejected): ${operation.type} (${operation.id})`,
    );
    operation.lastError = {
      code: "OWNERSHIP_REJECTED",
      message: (error as any)?.message ?? "Order owned by another station",
    };
    operation.retryCount = MAX_RETRY_ATTEMPTS;
    removeFromIndex(operation);
    pendingOperations = pendingOperations.filter(
      (op) => op.id !== operation.id,
    );
    moveToDeadLetter(operation);
    await saveQueueToStorage();
    onOperationFailed?.(operation);
    return;
  }

  const permanent = error && !isTransientError(error);

  // Wave 3.0f-2: slow-mode reprieve. If the diagnosis is "WiFi is bad" (not a
  // permanent server rejection, just exhausted retries) AND the
  // connectionQuality state machine still flags the network as slow, give the
  // op another full retry budget instead of dead-lettering. Capped at
  // MAX_SLOW_MODE_REPRIEVES so a permanently-unreachable backend eventually
  // does dead-letter.
  if (
    !permanent &&
    operation.retryCount >= MAX_RETRY_ATTEMPTS &&
    connectionQuality.isSlow() &&
    (operation.slowModeRetryCount ?? 0) < MAX_SLOW_MODE_REPRIEVES
  ) {
    operation.slowModeRetryCount = (operation.slowModeRetryCount ?? 0) + 1;
    operation.retryCount = 0;
    operation.status = "pending";
    console.log(
      `[OfflineSync] ↻ SLOW-MODE REPRIEVE (${operation.slowModeRetryCount}/${MAX_SLOW_MODE_REPRIEVES}): ${operation.type} (${operation.id}) — WiFi still slow, not giving up`,
    );
    await saveQueueToStorage();
    scheduleAutoRetry(operation);
    return;
  }

  if (permanent || operation.retryCount >= MAX_RETRY_ATTEMPTS) {
    const exhaustedSlowMode =
      !permanent &&
      (operation.slowModeRetryCount ?? 0) >= MAX_SLOW_MODE_REPRIEVES;
    const reason = permanent
      ? "permanent error"
      : exhaustedSlowMode
        ? "sustained bad wifi"
        : "max retries";
    console.log(
      `[OfflineSync] ✗ DEAD-LETTERED (${reason}): ${operation.type} (${operation.id})`,
    );
    // Wave 3.0e: capture the last error so the operator-facing subtitle can
    // show "network too slow" vs "server rejected" vs "max retries".
    if (exhaustedSlowMode) {
      operation.lastError = {
        code: "SUSTAINED_BAD_WIFI",
        message: `Tried for ~${Math.round(
          (MAX_SLOW_MODE_REPRIEVES * MAX_RETRY_ATTEMPTS * 15) / 60,
        )} min — WiFi never recovered`,
      };
    } else if (error) {
      const code =
        (error as any).code ??
        (error as any).status ??
        (permanent ? "PERMANENT" : "MAX_RETRIES");
      const message =
        (error as any).message ?? (error as any).msg ?? String(error);
      operation.lastError = { code: String(code), message };
    } else if (operation.retryCount >= MAX_RETRY_ATTEMPTS) {
      operation.lastError = {
        code: "MAX_RETRIES",
        message: `Failed ${MAX_RETRY_ATTEMPTS} times — gave up`,
      };
    }
    // Remove from active queue and move to dead letter
    removeFromIndex(operation);
    pendingOperations = pendingOperations.filter(
      (op) => op.id !== operation.id,
    );
    moveToDeadLetter(operation);
    await saveQueueToStorage();
    onOperationFailed?.(operation);
  } else {
    operation.status = "pending";
    await saveQueueToStorage();
    console.log(
      `[OfflineSync] ⟳ RETRY: ${operation.type} (${operation.id}) - attempt ${operation.retryCount}/${MAX_RETRY_ATTEMPTS}`,
    );
    scheduleAutoRetry(operation);
  }
}

/**
 * Process all pending operations in priority order with dependency tracking.
 */
async function executeWithTimeout(op: OfflineOperation): Promise<boolean> {
  return Promise.race([
    executeOperation!(op),
    new Promise<boolean>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Operation timeout after ${OPERATION_TIMEOUT_MS}ms`),
          ),
        OPERATION_TIMEOUT_MS,
      ),
    ),
  ]);
}

async function processQueue(): Promise<void> {
  if (syncInProgress) {
    console.log("[OfflineSync] Sync already in progress, skipping");
    return;
  }

  if (!isOnline) {
    console.log("[OfflineSync] Offline, skipping sync");
    return;
  }

  if (!executeOperation) {
    console.warn(
      "[OfflineSync] executeOperation handler not registered yet, scheduling deferred retry",
    );
    setTimeout(() => {
      if (executeOperation && isOnline) {
        console.log(
          "[OfflineSync] executeOperation now available, retrying queue",
        );
        processQueue();
      }
    }, 2000);
    return;
  }

  // Acquire lock immediately after guard checks — before any async work —
  // to prevent the race window where two callers both pass the guard.
  syncInProgress = true;

  try {
    // ========================================================================
    // COMPREHENSIVE QUEUE STATUS LOGGING
    // ========================================================================
    const allOps = pendingOperations.filter(
      (op) => op.status !== "discarded" && op.status !== "failed",
    );
    const byType: Record<string, number> = {};
    const byOrder: Record<string, string[]> = {};

    for (const op of allOps) {
      byType[op.type] = (byType[op.type] || 0) + 1;
      if (!byOrder[op.localOrderId]) {
        byOrder[op.localOrderId] = [];
      }
      byOrder[op.localOrderId].push(`${op.type}(${op.status})`);
    }

    console.log("[OfflineSync] ====== QUEUE STATUS ======");
    console.log("[OfflineSync] Total operations:", allOps.length);
    console.log("[OfflineSync] By type:", JSON.stringify(byType));
    console.log("[OfflineSync] By order:", JSON.stringify(byOrder));

    // Update blocked status before processing
    await updateBlockedOperations();

    const readyOps = getReadyOperations();
    const blocked = pendingOperations.filter((op) => op.status === "blocked");
    const pending = pendingOperations.filter((op) => op.status === "pending");

    console.log(
      "[OfflineSync] Ready:",
      readyOps.length,
      "| Blocked:",
      blocked.length,
      "| Pending:",
      pending.length,
    );

    if (readyOps.length === 0) {
      if (blocked.length > 0) {
        console.log("[OfflineSync] Blocked operations:");
        for (const op of blocked.slice(0, 5)) {
          console.log(`  - ${op.type} (${op.id}) for order ${op.localOrderId}`);
        }
      } else {
        console.log("[OfflineSync] No pending operations");
      }
      return; // finally will release lock
    }

    console.log("[OfflineSync] ====== PROCESSING ======");
    console.log(
      "[OfflineSync] Processing",
      readyOps.length,
      "operations (by priority)",
    );

    // Perf Phase 0: measure real flushes only (zero-ready passes return above)
    const perfFlush = startInteraction("pos.queue_flush", {
      ready_ops: readyOps.length,
      blocked_ops: blocked.length,
      pending_ops: pending.length,
    });

    let successCount = 0;
    let failCount = 0;

    for (const operation of readyOps) {
      // Check if still online before each operation
      if (!isOnline) {
        console.log("[OfflineSync] Went offline during sync, stopping");
        break;
      }

      // Mark as processing
      operation.status = "processing";
      // PR D.3: stamp first-attempt time on first dispatch so the stuck-op
      // timeout can detect ops that never resolve cleanly.
      if (!operation.firstAttemptedAtMs) {
        operation.firstAttemptedAtMs = Date.now();
      }
      await saveQueueToStorage();

      // PR D.3: stuck-op timeout. If the op has been alive for >STUCK_OP_TIMEOUT_MS
      // and we're still trying, dead-letter it instead of letting it ride forever.
      // The retry budget (MAX_RETRY_ATTEMPTS=5 with backoff ≈ 62s) should fire
      // first under normal conditions; this catches the edge cases where it
      // doesn't (e.g., scheduling glitch, kill-switch, silent-queue legacy).
      if (
        operation.firstAttemptedAtMs &&
        Date.now() - operation.firstAttemptedAtMs > STUCK_OP_TIMEOUT_MS
      ) {
        console.log(
          `[OfflineSync] ✗ STUCK ${Math.round(
            (Date.now() - operation.firstAttemptedAtMs) / 1000,
          )}s — dead-lettering: ${operation.type} (${operation.id})`,
        );
        operation.retryCount = MAX_RETRY_ATTEMPTS;
        await handleOperationFailure(
          operation,
          new Error(`Stuck for >${STUCK_OP_TIMEOUT_MS / 1000}s`),
        );
        failCount++;
        continue;
      }

      try {
        console.log(
          `[OfflineSync] Executing: ${operation.type} (${operation.id})`,
        );
        console.log(
          `[OfflineSync]   Order: ${operation.localOrderId || "N/A"}`,
        );
        console.log(`[OfflineSync]   Item: ${operation.localItemId || "N/A"}`);

        const success = await executeWithTimeout(operation);

        if (success) {
          console.log(
            `[OfflineSync] ✓ SUCCESS: ${operation.type} (${operation.id})`,
          );
          // Wave 2.8: emit blocked_then_resolved when an op that previously
          // blocked completes successfully. Duration helps validate that the
          // wake-on-create-order path is closing on a reasonable timeline.
          if (operation.blockedAtMs) {
            try {
              Sentry.addBreadcrumb({
                category: "offline_sync.blocked_then_resolved",
                level: "info",
                message: `${operation.type} resolved after block`,
                data: {
                  op_type: operation.type,
                  local_order_id: operation.localOrderId,
                  duration_ms: Date.now() - operation.blockedAtMs,
                  block_count: operation.blockCount ?? 0,
                },
              });
            } catch {}
          }
          await removeOperation(operation.id);
          successCount++;

          // After completing an operation, unblock dependent operations
          await updateBlockedOperations();
        } else if ((operation.status as string) === "blocked") {
          // Wave 2.8: executor signaled "blocked" via side-channel
          // (markOperationBlocked). Skip retry-counter bump and
          // handleOperationFailure — updateBlockedOperations on the next
          // ready-op pass will re-evaluate dependencies. Cast required
          // because TS narrowed status to 'processing' before the await,
          // unaware that markOperationBlocked mutates op.status during it.
          console.log(
            `[OfflineSync] ↺ BLOCKED: ${operation.type} (${operation.id}) — retry budget preserved`,
          );
        } else {
          operation.retryCount++;
          failCount++;
          handleOperationFailure(operation, null);
        }
      } catch (error) {
        console.error(
          "[OfflineSync] Error executing operation:",
          operation.id,
          error,
        );
        // Wave 2.8: even on thrown errors, honor the blocked side-channel.
        // The executor sets status='blocked' before any throw it doesn't own.
        if ((operation.status as string) === "blocked") {
          console.log(
            `[OfflineSync] ↺ BLOCKED (thrown): ${operation.type} (${operation.id}) — retry budget preserved`,
          );
        } else {
          operation.retryCount++;
          failCount++;
          handleOperationFailure(operation, error);
        }
      }
    }

    perfFlush.end({
      success_count: successCount,
      fail_count: failCount,
      went_offline: !isOnline,
    });
    console.log(
      `[OfflineSync] Sync complete: ${successCount} succeeded, ${failCount} failed`,
    );

    // If we had failures but there are still ready operations, try again
    const stillReady = getReadyOperations();
    if (stillReady.length > 0 && isOnline) {
      console.log(
        "[OfflineSync] Still have ready operations, scheduling retry...",
      );
      scheduleSync();
    }
  } finally {
    syncInProgress = false;
    onQueueChange?.(getActivePendingCount());
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadQueueFromStorage(): Promise<void> {
  try {
    // Synchronous read from MMKV
    const stored = getSyncJSON<OfflineOperation[]>(STORAGE_KEY);
    if (stored) {
      pendingOperations = stored;
      // Reset any "processing" status to "pending" (in case app crashed during sync)
      // Also backfill idempotencyKey for operations loaded from storage pre-upgrade
      pendingOperations = pendingOperations.map((op) => ({
        ...op,
        status: op.status === "processing" ? ("pending" as const) : op.status,
        idempotencyKey: op.idempotencyKey || uuidv4(),
      }));
      // Dead-letter ops with missing or outdated schema version
      const staleOps: OfflineOperation[] = [];
      const validOps: OfflineOperation[] = [];
      for (const op of pendingOperations) {
        if ((op.version ?? 0) < CURRENT_OPERATION_VERSION) {
          staleOps.push({
            ...op,
            status: "discarded" as const,
            deadLetterReason: {
              code: "OFFLINE_OP_SCHEMA_VERSION_MISMATCH",
              message:
                "Operation schema version is missing or older than current runtime version",
              details: {
                operationVersion: op.version ?? null,
                currentVersion: CURRENT_OPERATION_VERSION,
                operationType: op.type,
              },
            },
          });
        } else {
          validOps.push(op);
        }
      }
      if (staleOps.length > 0) {
        console.warn(
          `[OfflineSync] Dead-lettering ${staleOps.length} ops with stale schema version`,
        );
        for (const op of staleOps) moveToDeadLetter(op);
        pendingOperations = validOps;
      }
      console.log(
        "[OfflineSync] Loaded",
        pendingOperations.length,
        "operations from storage",
      );
      // Build indexes for O(1) lookups
      rebuildIndexes();
    }

    // Load dead letter queue
    loadDeadLetterFromStorage();
    if (deadLetterQueue.length > 0) {
      console.log(
        "[OfflineSync] Dead letter queue:",
        deadLetterQueue.length,
        "operations",
      );
    }

    // Prune expired operations on load
    await pruneExpiredOperations();
    await enforceQueueSizeLimit();
  } catch (error) {
    console.error("[OfflineSync] Failed to load queue from storage:", error);
    pendingOperations = [];
    rebuildIndexes(); // Clear indexes when queue is cleared
  }
}

async function saveQueueToStorage(): Promise<void> {
  try {
    // Only persist non-discarded operations
    // Synchronous write to MMKV
    const toSave = pendingOperations.filter((op) => op.status !== "discarded");
    setSyncJSON(STORAGE_KEY, toSave);
  } catch (error) {
    console.error("[OfflineSync] Failed to save queue to storage:", error);
  }
}

// ============================================================================
// ORDER RECONCILIATION
// ============================================================================

export interface ReconciliationResult {
  success: boolean;
  itemsAdded: number;
  itemsRemoved: number;
  itemsUpdated: number;
  errors: string[];
}

/**
 * Reconcile local order state with backend after network recovery.
 * Backend is source of truth - local state is updated to match backend.
 *
 * @param supabase - Supabase client instance
 * @param localOrderId - Local order ID from useOrderStore
 * @param dbOrderId - Backend order UUID
 * @param getLocalOrder - Function to get local order state
 * @param updateLocalOrder - Function to update local order with backend state
 */
export async function reconcileOrderWithBackend(
  supabase: any,
  localOrderId: string,
  dbOrderId: string,
  getLocalOrder: () => any,
  updateLocalOrder: (updates: any) => void,
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    success: false,
    itemsAdded: 0,
    itemsRemoved: 0,
    itemsUpdated: 0,
    errors: [],
  };

  if (!supabase || !dbOrderId) {
    result.errors.push("Missing Supabase client or order ID");
    return result;
  }

  try {
    console.log(
      "[Reconciliation] Starting reconciliation for order:",
      dbOrderId,
    );

    // Fetch backend order state
    const { data, error } = await supabase.rpc("get_order_details", {
      p_order_id: dbOrderId,
    });

    if (error) {
      result.errors.push(`Failed to fetch backend order: ${error.message}`);
      return result;
    }

    if (!data) {
      result.errors.push("No order data returned from backend");
      return result;
    }

    const localOrder = getLocalOrder();
    if (!localOrder) {
      result.errors.push("Local order not found");
      return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Phase 6: Version-based reconciliation
    // ═══════════════════════════════════════════════════════════════════════
    const localVersion = (localOrder as any).sync_version ?? 0;
    const serverVersion = data.sync_version ?? 0;

    // Check for pending local changes
    const hasPendingLocalChanges =
      localOrder.sync_status === "pending" ||
      localOrder.items?.some((item: any) => item.sync_status === "pending");

    // Track version mismatch for reporting
    if (serverVersion > localVersion) {
      console.log(
        "[Reconciliation] Version mismatch - local:",
        localVersion,
        "server:",
        serverVersion,
      );

      if (hasPendingLocalChanges) {
        // Check if we can merge (non-overlapping changes)
        const localPendingItems =
          localOrder.items?.filter(
            (item: any) =>
              item.sync_status === "pending" || !item.db_order_item_id,
          ) || [];

        const serverItemIds = new Set(
          (data.items || []).map((item: any) => item.id),
        );

        // Local pending items that don't exist on server can be pushed
        const nonConflictingLocalItems = localPendingItems.filter(
          (item: any) =>
            !item.db_order_item_id || !serverItemIds.has(item.db_order_item_id),
        );

        if (nonConflictingLocalItems.length > 0) {
          console.log(
            "[Reconciliation] Merge possible - pushing",
            nonConflictingLocalItems.length,
            "non-conflicting local items",
          );
          // These will be synced in the next queue processing
        }
      }
    } else if (serverVersion < localVersion && !hasPendingLocalChanges) {
      console.log(
        "[Reconciliation] Local version newer - skipping server merge",
      );
      // Local is newer and synced - no need to pull from server
      result.success = true;
      return result;
    }

    // Build a map of backend items by their ID
    const backendItemsMap = new Map<string, any>();
    (data.items || []).forEach((item: any) => {
      backendItemsMap.set(item.id, item);
    });

    // Build a map of local items by their db_order_item_id
    const localItemsMap = new Map<string, any>();
    (localOrder.items || []).forEach((item: any) => {
      if (item.db_order_item_id) {
        localItemsMap.set(item.db_order_item_id, item);
      }
    });

    // Detect differences
    const itemsToAdd: any[] = [];
    const itemsToUpdate: any[] = [];
    const itemIdsToRemove = new Set<string>();

    // Check backend items against local
    backendItemsMap.forEach((backendItem, backendItemId) => {
      const localItem = localItemsMap.get(backendItemId);
      if (!localItem) {
        // Item in backend but not local - add it
        itemsToAdd.push(backendItem);
        result.itemsAdded++;
      } else {
        // Item exists in both - check for updates
        if (
          backendItem.quantity !== localItem.quantity ||
          backendItem.kitchen_status !== localItem.kitchen_status
        ) {
          itemsToUpdate.push({
            localId: localItem.id,
            updates: {
              quantity: backendItem.quantity,
              kitchen_status: backendItem.kitchen_status,
              item_status: backendItem.item_status,
            },
          });
          result.itemsUpdated++;
        }
      }
    });

    // Check local items that are not in backend (should be removed)
    localItemsMap.forEach((localItem, dbItemId) => {
      if (!backendItemsMap.has(dbItemId)) {
        // Item in local but not backend - mark for removal
        itemIdsToRemove.add(localItem.id);
        result.itemsRemoved++;
      }
    });

    // Apply reconciliation updates
    const reconciledItems = localOrder.items
      .filter((item: any) => !itemIdsToRemove.has(item.id))
      .map((item: any) => {
        const update = itemsToUpdate.find((u) => u.localId === item.id);
        if (update) {
          return { ...item, ...update.updates, sync_status: "synced" as const };
        }
        // Mark existing items as synced
        return item.db_order_item_id
          ? { ...item, sync_status: "synced" as const }
          : item;
      });

    // Add new items from backend
    itemsToAdd.forEach((backendItem) => {
      reconciledItems.push({
        id: `sync_${backendItem.id}`,
        db_order_item_id: backendItem.id,
        menuItemId: backendItem.menu_item_id || "",
        // For open items, use open_item_name; otherwise use item_name
        name: backendItem.is_open_item
          ? backendItem.open_item_name || "Open Item"
          : backendItem.item_name || "Unknown Item",
        quantity: backendItem.quantity || 1,
        // For open items, use open_item_price; otherwise use unit_price
        price: backendItem.is_open_item
          ? backendItem.open_item_price || 0
          : backendItem.unit_price || 0,
        unitPrice: backendItem.is_open_item
          ? backendItem.open_item_price || 0
          : backendItem.unit_price || 0,
        cashPrice:
          backendItem.cash_price ||
          backendItem.cash_unit_price ||
          (backendItem.is_open_item
            ? backendItem.open_item_price
            : backendItem.unit_price) ||
          0,
        originalPrice:
          backendItem.cash_price ||
          (backendItem.is_open_item
            ? backendItem.open_item_price
            : backendItem.unit_price) ||
          0,
        paidQuantity: backendItem.paid_quantity || 0,
        // Open item support
        is_open_item: backendItem.is_open_item || false,
        open_item_name: backendItem.open_item_name || undefined,
        open_item_price: backendItem.open_item_price || undefined,
        kitchen_status: backendItem.kitchen_status,
        item_status: backendItem.item_status,
        courseNumber: backendItem.course_number || 1,
        // Carry seat assignment from backend so the bill seat pill survives
        // offline reconciliation (matches utils/orderTransformers.ts:250).
        seatNumber: backendItem.seat_number ?? null,
        category_name: backendItem.category_name || "Uncategorized",
        is_voided: backendItem.is_voided || false,
        sync_status: "synced" as const,
        customizations: {
          notes: backendItem.special_instructions || undefined,
          modifiers: [], // Would need more data to populate
        },
        // Financial fields
        subtotal:
          backendItem.subtotal ||
          (backendItem.is_open_item
            ? backendItem.open_item_price
            : backendItem.unit_price) * backendItem.quantity ||
          0,
        cashSubtotal:
          backendItem.cash_subtotal ||
          backendItem.cash_price * backendItem.quantity ||
          0,
        taxRate: backendItem.tax_rate || 0,
        taxAmount: backendItem.tax_amount || 0,
        cashTaxAmount: backendItem.cash_tax_amount || 0,
        // Discount distribution fields
        discount_amount: backendItem.discount_amount ?? 0,
        discount_cash_amount:
          backendItem.discount_cash_amount ?? backendItem.discount_amount ?? 0,
      });
    });

    // Update local order with reconciled state
    // Phase 6: Include sync_version in reconciled state
    updateLocalOrder({
      items: reconciledItems,
      total_amount: data.total_amount,
      total_tax: data.tax_amount,
      order_status: data.status,
      sync_version: serverVersion, // Phase 6: Update local version to match server
      amount_paid: data.amount_paid,
      amount_due: data.amount_due,
      cash_amount_due: data.cash_amount_due,
    });

    result.success = true;
    console.log(
      "[Reconciliation] Complete:",
      result,
      "- sync_version updated to:",
      serverVersion,
    );

    return result;
  } catch (err: any) {
    result.errors.push(`Reconciliation error: ${err?.message || "Unknown"}`);
    console.error("[Reconciliation] Error:", err);
    return result;
  }
}

/**
 * Trigger reconciliation for all orders with failed sync status.
 */
export async function reconcileFailedOrders(
  supabase: any,
  getOrdersWithFailedSyncs: () => Array<{ localId: string; dbId: string }>,
  getLocalOrder: (id: string) => any,
  updateLocalOrder: (id: string, updates: any) => void,
): Promise<void> {
  const failedOrders = getOrdersWithFailedSyncs();

  if (failedOrders.length === 0) {
    console.log("[Reconciliation] No orders with failed syncs");
    return;
  }

  console.log(
    `[Reconciliation] Reconciling ${failedOrders.length} orders with failed syncs`,
  );

  for (const order of failedOrders) {
    await reconcileOrderWithBackend(
      supabase,
      order.localId,
      order.dbId,
      () => getLocalOrder(order.localId),
      (updates) => updateLocalOrder(order.localId, updates),
    );
  }
}
