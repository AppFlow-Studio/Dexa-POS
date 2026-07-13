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
