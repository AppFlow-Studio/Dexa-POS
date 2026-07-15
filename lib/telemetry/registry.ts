/**
 * Wave-0 telemetry registry (rush-lag evidence pack).
 *
 * Module singleton holding:
 *  - interned key dictionary (string -> Uint16 id)
 *  - session counters (count/sum/max per key) — cover the whole session,
 *    never consume ring slots
 *  - a fixed-size ring buffer of samples in packed parallel typed arrays
 *  - live attribution state (current route, last stringify/broadcast/flush
 *    end timestamps) used to tag long-task samples
 *
 * LEAF MODULE — imports nothing from app code except react-native-mmkv.
 * lib/storage.ts imports this module to instrument its persist hot path, so
 * any app-code import here would create a cycle. Keep it that way.
 *
 * Overhead budget: every public record fn is O(1) and allocation-free on the
 * hot path. Serialization happens only in flushToMMKV() (every 30s + on
 * background). A fixed-capacity ring means this instrument can never become
 * the unbounded-collection disease it exists to measure.
 *
 * Dedicated MMKV instance ("dexa-pos-telemetry"): deliberately NOT the
 * general "dexa-pos-general" instance so a captured rush survives the
 * Settings "reset cache" path (CLEARABLE_STORAGE_KEYS) and env-switch wipes.
 */
import { createMMKV } from "react-native-mmkv";

// ============================================================================
// CONFIG
// ============================================================================

/**
 * Ring capacity. Sizing: expected steady-state append rate is ~120-240/min
 * (stringify spans + long tasks + flushes + >=4ms realtime/fan-out spans),
 * so 8192 slots ≈ 34-70 min of history. Counters survive wrap regardless.
 * Escape hatch if pilot data shows churn: 16384 costs ~160KB total.
 */
export const RING_SLOTS = 8192;

/** Spans below this (ms) are counter-only; at/above they also ring-append. */
export const SPAN_RING_THRESHOLD_MS = 4;

/** Max interned keys (ids are stored in a Uint16Array). */
const MAX_KEYS = 65535;

const MMKV_KEY_CURRENT = "telemetry-ring-v1";
const MMKV_KEY_PREV = "telemetry-ring-prev";

export const telemetryStorage = createMMKV({ id: "dexa-pos-telemetry" });

// ============================================================================
// ENABLE FLAGS
// ============================================================================

/**
 * Master switch, synced from useSettingsStore by lib/telemetry/init.ts.
 * Hot paths read this module boolean — never the zustand store.
 */
let enabled = true;

/**
 * Overhead-verification sub-flag (dev-flags screen): mutes the instrumented
 * call sites while the long-task watcher keeps recording, so a hooks-on vs
 * hooks-muted A/B can prove the <1% overhead acceptance criterion. The
 * watcher records through recordWatcherSample(), which ignores this flag.
 */
let hooksMuted = false;

export function setTelemetryEnabled(value: boolean): void {
  enabled = value;
}

export function isTelemetryEnabled(): boolean {
  return enabled;
}

export function setTelemetryHooksMuted(value: boolean): void {
  hooksMuted = value;
}

export function isTelemetryHooksMuted(): boolean {
  return hooksMuted;
}

// ============================================================================
// KEY INTERNING
// ============================================================================

const keyToId: Record<string, number> = Object.create(null);
const idToKey: string[] = [];

/**
 * Intern a key string to a stable small integer id. Callers on hot paths
 * should intern ONCE at module init and hold the id; interning itself is a
 * dictionary hit after the first call, but holding the id avoids even that.
 */
export function internKey(key: string): number {
  let id = keyToId[key];
  if (id === undefined) {
    if (idToKey.length >= MAX_KEYS) return 0; // saturate rather than grow
    id = idToKey.length;
    keyToId[key] = id;
    idToKey.push(key);
    // Grow counter storage lazily alongside the dictionary.
    counterCount.push(0);
    counterSum.push(0);
    counterMax.push(0);
  }
  return id;
}

// ============================================================================
// COUNTERS (count / sum / max per key id — plain arrays indexed by id)
// ============================================================================

const counterCount: number[] = [];
const counterSum: number[] = [];
const counterMax: number[] = [];

// Reserved id 0 so "no route" / saturation is representable. Must run after
// the counter arrays exist (internKey grows them).
internKey("__none__");

// ============================================================================
// RING BUFFER — packed parallel arrays, head index, wrap on overflow
// ============================================================================

// t: ms since sessionStartEpoch (Uint32 covers ~49 days)
// k: interned key id
// v: value (duration ms, drift ms, or byte count)
// a: attribution bits: routeId << 3 | flushBit << 2 | broadcastBit << 1 | stringifyBit
const ringT = new Uint32Array(RING_SLOTS);
const ringK = new Uint16Array(RING_SLOTS);
const ringV = new Float32Array(RING_SLOTS);
const ringA = new Uint32Array(RING_SLOTS);
let ringHead = 0; // next write position
let ringTotal = 0; // monotonic append count; > RING_SLOTS means wrapped

let sessionStartEpoch = Date.now();

function appendRing(keyId: number, value: number, attr: number): void {
  ringT[ringHead] = Date.now() - sessionStartEpoch;
  ringK[ringHead] = keyId;
  ringV[ringHead] = value;
  ringA[ringHead] = attr;
  ringHead = ringHead + 1 === RING_SLOTS ? 0 : ringHead + 1;
  ringTotal++;
}

// ============================================================================
// ATTRIBUTION STATE
// ============================================================================

let currentRouteId = 0;
let lastStringifyEndMs = 0;
let lastBroadcastFanoutEndMs = 0;
let lastFlushAllEndMs = 0;

/** Called from the route tracker in app/(main)/_layout.tsx on path change. */
export function setCurrentRoute(path: string): void {
  if (!enabled) return;
  currentRouteId = internKey(`route:${path}`);
}

/** Called from lib/storage.ts right after a persist JSON.stringify completes. */
export function noteStringifyEnd(): void {
  lastStringifyEndMs = Date.now();
}

/** Called after the 3-store broadcast fan-out completes. */
export function noteBroadcastFanoutEnd(): void {
  lastBroadcastFanoutEndMs = Date.now();
}

/** Called after flushAllPendingWrites completes. */
export function noteFlushAllEnd(): void {
  lastFlushAllEndMs = Date.now();
}

/**
 * Pack attribution bits for a long-task sample. The blocked window is
 * [now - driftMs, now]; since blocking work runs to completion before the
 * starved heartbeat tick fires, work whose END timestamp falls inside the
 * window overlapped the block. This is the persist-vs-render arbiter.
 */
export function buildLongTaskAttr(nowMs: number, driftMs: number): number {
  const windowStart = nowMs - driftMs;
  const stringifyBit = lastStringifyEndMs >= windowStart ? 1 : 0;
  const broadcastBit = lastBroadcastFanoutEndMs >= windowStart ? 2 : 0;
  const flushBit = lastFlushAllEndMs >= windowStart ? 4 : 0;
  return (currentRouteId << 3) | flushBit | broadcastBit | stringifyBit;
}

// ============================================================================
// RECORD API (hot paths — O(1), allocation-free)
// ============================================================================

/** Counter-only increment. `inc` defaults to 1; pass byte counts etc. */
export function recordCount(keyId: number, inc: number = 1): void {
  if (!enabled || hooksMuted) return;
  counterCount[keyId]++;
  counterSum[keyId] += inc;
  if (inc > counterMax[keyId]) counterMax[keyId] = inc;
}

/**
 * Duration span: counter always (count/sum/max in ms); ring-append only when
 * the span is at/above the threshold, so sub-ms chatter never eats slots.
 */
export function recordSpan(
  keyId: number,
  ms: number,
  ringThresholdMs: number = SPAN_RING_THRESHOLD_MS,
): void {
  if (!enabled || hooksMuted) return;
  counterCount[keyId]++;
  counterSum[keyId] += ms;
  if (ms > counterMax[keyId]) counterMax[keyId] = ms;
  if (ms >= ringThresholdMs) {
    appendRing(keyId, ms, currentRouteId << 3);
  }
}

/** Always-ring sample (long tasks, stringify spans, flush durations). */
export function recordSample(keyId: number, value: number, attr?: number): void {
  if (!enabled || hooksMuted) return;
  counterCount[keyId]++;
  counterSum[keyId] += value;
  if (value > counterMax[keyId]) counterMax[keyId] = value;
  appendRing(keyId, value, attr ?? currentRouteId << 3);
}

/**
 * Watcher-only sample path: ignores hooksMuted (the watcher is the measuring
 * instrument in the overhead A/B and must record in both arms).
 */
export function recordWatcherSample(
  keyId: number,
  value: number,
  attr?: number,
): void {
  if (!enabled) return;
  counterCount[keyId]++;
  counterSum[keyId] += value;
  if (value > counterMax[keyId]) counterMax[keyId] = value;
  appendRing(keyId, value, attr ?? currentRouteId << 3);
}

// Lazy intern cache for perf.ts span names (bounded by the number of distinct
// pos.* span names — a handful).
const perfSpanKeyIds: Record<string, number> = Object.create(null);

/**
 * Tap for lib/perf.ts finish(): mirrors every Sentry interaction span into the
 * local registry (counter always, ring if >= threshold), independent of
 * Sentry sampling.
 */
export function telemetryRecordSpan(name: string, ms: number): void {
  if (!enabled) return;
  let keyId = perfSpanKeyIds[name];
  if (keyId === undefined) {
    keyId = internKey(`perf.${name}`);
    perfSpanKeyIds[name] = keyId;
  }
  recordSpan(keyId, ms);
}

// ============================================================================
// SNAPSHOT / PERSISTENCE
// ============================================================================

export interface TelemetryRingEntry {
  /** ms since sessionStartEpoch */
  t: number;
  /** interned key name */
  k: string;
  v: number;
  route: string | null;
  stringifyOverlap: boolean;
  broadcastOverlap: boolean;
  flushOverlap: boolean;
}

export interface TelemetryCounterEntry {
  k: string;
  count: number;
  sum: number;
  max: number;
}

export interface TelemetrySnapshot {
  schema: 1;
  sessionStartEpoch: number;
  config: {
    slots: number;
    spanRingThresholdMs: number;
  };
  dict: string[];
  counters: TelemetryCounterEntry[];
  ring: {
    total: number;
    entries: TelemetryRingEntry[];
  };
}

function decodeAttr(attr: number): {
  route: string | null;
  stringifyOverlap: boolean;
  broadcastOverlap: boolean;
  flushOverlap: boolean;
} {
  const routeId = attr >>> 3;
  const routeKey = idToKey[routeId];
  return {
    route:
      routeId > 0 && routeKey !== undefined
        ? routeKey.replace(/^route:/, "")
        : null,
    stringifyOverlap: (attr & 1) !== 0,
    broadcastOverlap: (attr & 2) !== 0,
    flushOverlap: (attr & 4) !== 0,
  };
}

/** Decoded, chronological snapshot of the current session. */
export function snapshot(): TelemetrySnapshot {
  const used = Math.min(ringTotal, RING_SLOTS);
  const entries: TelemetryRingEntry[] = new Array(used);
  // Oldest entry: at head when wrapped, at 0 otherwise.
  const start = ringTotal > RING_SLOTS ? ringHead : 0;
  for (let i = 0; i < used; i++) {
    const idx = (start + i) % RING_SLOTS;
    entries[i] = {
      t: ringT[idx],
      k: idToKey[ringK[idx]] ?? `#${ringK[idx]}`,
      v: ringV[idx],
      ...decodeAttr(ringA[idx]),
    };
  }

  const counters: TelemetryCounterEntry[] = [];
  for (let id = 1; id < idToKey.length; id++) {
    if (counterCount[id] > 0) {
      counters.push({
        k: idToKey[id],
        count: counterCount[id],
        sum: counterSum[id],
        max: counterMax[id],
      });
    }
  }

  return {
    schema: 1,
    sessionStartEpoch,
    config: { slots: RING_SLOTS, spanRingThresholdMs: SPAN_RING_THRESHOLD_MS },
    dict: idToKey.slice(),
    counters,
    ring: { total: ringTotal, entries },
  };
}

/**
 * Serialize the current snapshot to the dedicated MMKV instance. Called every
 * 30s and on app background by init.ts, and right before export. One
 * JSON.stringify of ~8k decoded entries every 30s ≈ 5-15ms — inside the <1%
 * budget precisely because it never happens per event.
 */
export function flushToMMKV(): void {
  if (!enabled) return;
  try {
    telemetryStorage.set(MMKV_KEY_CURRENT, JSON.stringify(snapshot()));
  } catch {
    // Telemetry must never crash the app.
  }
}

/**
 * Boot-time rollover: preserve the previous session's final flush (crash or
 * normal exit) under the prev key, then start this session fresh.
 */
export function hydrateFromMMKV(): void {
  try {
    const prev = telemetryStorage.getString(MMKV_KEY_CURRENT);
    if (prev) {
      telemetryStorage.set(MMKV_KEY_PREV, prev);
      telemetryStorage.remove(MMKV_KEY_CURRENT);
    }
  } catch {
    // ignore
  }
}

/** Previous session's snapshot (for the export dump), or null. */
export function getPrevSessionSnapshot(): TelemetrySnapshot | null {
  try {
    const raw = telemetryStorage.getString(MMKV_KEY_PREV);
    return raw ? (JSON.parse(raw) as TelemetrySnapshot) : null;
  } catch {
    return null;
  }
}

/** Test-only: reset all module state to a fresh session. */
export function resetSessionForTests(): void {
  ringT.fill(0);
  ringK.fill(0);
  ringV.fill(0);
  ringA.fill(0);
  ringHead = 0;
  ringTotal = 0;
  sessionStartEpoch = Date.now();
  currentRouteId = 0;
  lastStringifyEndMs = 0;
  lastBroadcastFanoutEndMs = 0;
  lastFlushAllEndMs = 0;
  for (let i = 0; i < counterCount.length; i++) {
    counterCount[i] = 0;
    counterSum[i] = 0;
    counterMax[i] = 0;
  }
}
