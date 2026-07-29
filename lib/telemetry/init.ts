/**
 * Telemetry bootstrap — called once from app/_layout.tsx.
 *
 * Owns everything with app-code dependencies so the registry stays a leaf:
 *  - session rollover (previous session's blob preserved for export)
 *  - enabled-flag sync from useSettingsStore (module boolean, not per-event
 *    getState() reads)
 *  - its own AppState listener: background/inactive -> flush + pause watcher;
 *    active -> resume watcher + resume-settle sample
 *  - the 30s ring flush interval
 */
import { AppState, AppStateStatus, InteractionManager } from "react-native";
import { useSettingsStore } from "@/stores/useSettingsStore";
import {
  flushToMMKV,
  hydrateFromMMKV,
  isTelemetryEnabled,
  recordSample,
  setTelemetryEnabled,
} from "@/lib/telemetry/registry";
import { KEY_RESUME_SETTLE_MS } from "@/lib/telemetry/keys";
import { startWatcher, stopWatcher } from "@/lib/telemetry/longTaskWatcher";

const FLUSH_INTERVAL_MS = 30_000;

// Wave-0 telemetry is a measurement PILOT, not an optimization — it shipped
// defaulted ON (useSettingsStore `telemetryEnabled: true`), and that value is
// already persisted on every 2.2.3 install, so flipping the store default can
// no longer turn it off in the field. Gate the whole harness here instead:
// shipped (release) builds run it only when explicitly opted in via
// EXPO_PUBLIC_TELEMETRY_PILOT=1, while __DEV__ keeps it on for local work.
// This is the reliable kill switch; the in-app toggle still governs it wherever
// the pilot is allowed to run.
const PILOT_FORCED_ON =
  process.env.EXPO_PUBLIC_TELEMETRY_PILOT === "1" ||
  process.env.EXPO_PUBLIC_TELEMETRY_PILOT === "true";
const TELEMETRY_ALLOWED = __DEV__ || PILOT_FORCED_ON;

let initialized = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function startFlushTimer(): void {
  if (flushTimer !== null) return;
  flushTimer = setInterval(flushToMMKV, FLUSH_INTERVAL_MS);
}

function stopFlushTimer(): void {
  if (flushTimer === null) return;
  clearInterval(flushTimer);
  flushTimer = null;
}

function onEnabledChange(enabled: boolean): void {
  setTelemetryEnabled(enabled);
  if (enabled && AppState.currentState === "active") {
    startWatcher();
    startFlushTimer();
  } else if (!enabled) {
    stopWatcher();
    stopFlushTimer();
  }
}

/**
 * Audit C #7 (resume stampede), minimal Wave-0 form: measure how long after
 * AppState 'active' the JS thread settles (all queued interactions + one
 * macrotask drained). Long tasks during the window are captured by the
 * watcher (resumed first) with normal attribution.
 */
function recordResumeSettle(): void {
  if (!isTelemetryEnabled()) return;
  const resumedAt = Date.now();
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      recordSample(KEY_RESUME_SETTLE_MS, Date.now() - resumedAt);
    }, 0);
  });
}

function handleAppStateChange(state: AppStateStatus): void {
  if (state === "background" || state === "inactive") {
    // Pause first so a background-throttled interval can't fabricate drift,
    // then persist what we have in case the OS kills the process.
    stopWatcher();
    stopFlushTimer();
    flushToMMKV();
  } else if (state === "active" && isTelemetryEnabled()) {
    startWatcher();
    startFlushTimer();
    recordResumeSettle();
  }
}

export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;

  // Shipped-build kill switch: force the harness off regardless of the
  // persisted toggle and start no timers/listeners/subscriptions. Every record*
  // path short-circuits on the disabled flag, so hot-path taps become no-ops.
  if (!TELEMETRY_ALLOWED) {
    setTelemetryEnabled(false);
    return;
  }

  hydrateFromMMKV();

  // useSettingsStore hydrates synchronously from MMKV at create time, so the
  // persisted toggle value is already correct here.
  onEnabledChange(useSettingsStore.getState().telemetryEnabled);
  useSettingsStore.subscribe((state, prevState) => {
    if (state.telemetryEnabled !== prevState.telemetryEnabled) {
      onEnabledChange(state.telemetryEnabled);
    }
  });

  AppState.addEventListener("change", handleAppStateChange);
}
