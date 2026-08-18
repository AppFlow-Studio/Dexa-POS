// ============================================================
// Auto-Batch Settlement progress (Castles)
// File: stores/useAutoSettlementStore.ts
// ============================================================
// Per-terminal, MMKV-persisted state for the unattended daily batch-out
// scheduler (services/autoSettlementScheduler.ts). Survives app kills so the
// scheduler can (a) not double-fire the same day and (b) catch up a missed day
// on the next boot/foreground.
//
// Day-gating uses TWO markers on purpose:
//   • resolvedDueDay — the last calendar day the SCHEDULED settle (fired at/after
//     settle_time) reached a terminal outcome. Gates today's scheduled fire.
//   • catchupDay     — the last calendar day a PRE-due catch-up sweep ran (when a
//     prior day was missed because the tablet was off). A morning catch-up must
//     NOT consume today's scheduled evening settle, so these are separate.
// `lastSettledDay` is a narrower observability marker: the last day we CONFIRMED
// a successful settle (never set on finalize_pending / needs_manual).
//
// All day strings are the PLAIN calendar date in the location timezone
// ("YYYY-MM-DD"), matching the backend watchdog — never a business-day rollover.
// ============================================================

import { createLazyPersistStorage } from "@/lib/storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Persist key — the scheduler flushes this synchronously at critical points. */
export const AUTO_SETTLEMENT_PERSIST_NAME = "dexa-pos-auto-settlement";

export type AutoSettlePhase =
  | "idle"
  | "settling"
  | "settled"
  | "finalize_pending"
  | "needs_manual"
  | "failed";

/** Which trigger fired the settle — decides which day-marker advances. */
export type FireMode = "scheduled" | "catchup";

export interface TerminalAutoSettleProgress {
  // ── decision gating ──
  resolvedDueDay: string | null;
  catchupDay: string | null;
  /** Day that attemptCountToday / nextRetryAtMs pertain to (reset on day change). */
  attemptDay: string | null;
  attemptCountToday: number;
  nextRetryAtMs: number | null;
  phase: AutoSettlePhase;
  /** epoch ms when the current 'settling' phase began (mirrors the server 10-min guard). */
  settlingSince: number | null;
  /** epoch ms of the last unsettled-stats preflight (throttles the network probe). */
  lastPreflightAtMs: number | null;

  // ── observability (surfaced in BatchoutPanel) ──
  /** Last day a settle was CONFIRMED successful. */
  lastSettledDay: string | null;
  consecutiveFailedDays: number;
  armed: boolean;
  nextFireAtMs: number | null;
  lastTickAtMs: number | null;
  lastDecision: string | null; // 'fire' | 'wait' | 'skip'
  lastReason: string | null;
  lastResultAt: string | null; // ISO
  lastResultOk: boolean | null;
  lastResultStatus: string | null; // 'settled' | 'nothing_to_settle' | 'finalize_pending' | 'needs_manual' | 'failed'
  lastResultMessage: string | null;
  lastBatchUuid: string | null;
}

export function defaultProgress(): TerminalAutoSettleProgress {
  return {
    resolvedDueDay: null,
    catchupDay: null,
    attemptDay: null,
    attemptCountToday: 0,
    nextRetryAtMs: null,
    phase: "idle",
    settlingSince: null,
    lastPreflightAtMs: null,
    lastSettledDay: null,
    consecutiveFailedDays: 0,
    armed: false,
    nextFireAtMs: null,
    lastTickAtMs: null,
    lastDecision: null,
    lastReason: null,
    lastResultAt: null,
    lastResultOk: null,
    lastResultStatus: null,
    lastResultMessage: null,
    lastBatchUuid: null,
  };
}

interface OutcomeInput {
  mode: FireMode;
  day: string;
  message?: string | null;
  batchUuid?: string | null;
  nowIso: string;
}

interface AutoSettlementState {
  byTerminal: Record<string, TerminalAutoSettleProgress>;

  getProgress: (terminalId: string) => TerminalAutoSettleProgress;

  /** Reset within-day backoff/attempt counters when the calendar day changes. */
  rollDayIfNeeded: (terminalId: string, today: string) => void;

  /** Observability written on every tick (fire or not). */
  recordTick: (
    terminalId: string,
    info: {
      armed: boolean;
      nextFireAtMs: number | null;
      decision: string;
      reason: string | null;
      tickAtMs: number;
    },
  ) => void;

  /** Throttle marker for the unsettled-stats preflight. */
  markPreflight: (terminalId: string, nowMs: number) => void;

  /** Enter 'settling' just before the terminal command (persist ASAP). */
  markFiring: (terminalId: string, nowMs: number) => void;

  // ── terminal-for-today outcomes (advance the mode's day-marker) ──
  markSettled: (terminalId: string, o: OutcomeInput & { status?: string }) => void;
  markNothingToSettle: (terminalId: string, o: OutcomeInput) => void;
  markFinalizePending: (terminalId: string, o: OutcomeInput) => void;
  markNeedsManual: (
    terminalId: string,
    o: OutcomeInput & { status?: string },
  ) => void;

  // ── transient failure: retry within the same day (does NOT advance markers) ──
  markFailedBackoff: (
    terminalId: string,
    o: OutcomeInput & { nextRetryAtMs: number },
  ) => void;
}

/**
 * Apply a mutation to one terminal's progress and merge it back. This store has
 * NO immer middleware, so we build a fresh record and return a partial update.
 */
function patch(
  set: (partial: Partial<AutoSettlementState>) => void,
  get: () => AutoSettlementState,
  terminalId: string,
  mut: (p: TerminalAutoSettleProgress) => void,
) {
  const prev = get().byTerminal[terminalId] ?? defaultProgress();
  const next = { ...prev };
  mut(next);
  set({ byTerminal: { ...get().byTerminal, [terminalId]: next } });
}

/** Advance resolvedDueDay for a scheduled fire, catchupDay for a catch-up sweep. */
function advanceDayMarker(p: TerminalAutoSettleProgress, mode: FireMode, day: string) {
  if (mode === "scheduled") p.resolvedDueDay = day;
  else p.catchupDay = day;
}

export const useAutoSettlementStore = create<AutoSettlementState>()(
  persist(
    (set, get) => ({
      byTerminal: {},

      getProgress: (terminalId) =>
        get().byTerminal[terminalId] ?? defaultProgress(),

      rollDayIfNeeded: (terminalId, today) =>
        patch(set, get, terminalId, (p) => {
          if (p.attemptDay !== today) {
            p.attemptDay = today;
            p.attemptCountToday = 0;
            p.nextRetryAtMs = null;
          }
        }),

      recordTick: (terminalId, info) =>
        patch(set, get, terminalId, (p) => {
          p.armed = info.armed;
          p.nextFireAtMs = info.nextFireAtMs;
          p.lastTickAtMs = info.tickAtMs;
          p.lastDecision = info.decision;
          p.lastReason = info.reason;
        }),

      markPreflight: (terminalId, nowMs) =>
        patch(set, get, terminalId, (p) => {
          p.lastPreflightAtMs = nowMs;
        }),

      markFiring: (terminalId, nowMs) =>
        patch(set, get, terminalId, (p) => {
          p.phase = "settling";
          p.settlingSince = nowMs;
        }),

      markSettled: (terminalId, o) =>
        patch(set, get, terminalId, (p) => {
          p.phase = "settled";
          p.settlingSince = null;
          p.lastSettledDay = o.day;
          p.consecutiveFailedDays = 0;
          advanceDayMarker(p, o.mode, o.day);
          p.lastResultAt = o.nowIso;
          p.lastResultOk = true;
          p.lastResultStatus = o.status ?? "settled";
          p.lastResultMessage = o.message ?? null;
          p.lastBatchUuid = o.batchUuid ?? p.lastBatchUuid;
        }),

      markNothingToSettle: (terminalId, o) =>
        patch(set, get, terminalId, (p) => {
          p.phase = "settled";
          p.settlingSince = null;
          p.consecutiveFailedDays = 0;
          advanceDayMarker(p, o.mode, o.day);
          p.lastResultAt = o.nowIso;
          p.lastResultOk = true;
          p.lastResultStatus = "nothing_to_settle";
          p.lastResultMessage = o.message ?? "No unsettled payments";
        }),

      markFinalizePending: (terminalId, o) =>
        patch(set, get, terminalId, (p) => {
          // Terminal cut the batch (money moving); only the finalize DB-write is
          // outstanding. Advance the day-marker so we DON'T re-command the
          // terminal today — the pendingFinalize drain replays finalize only.
          p.phase = "finalize_pending";
          p.settlingSince = null;
          advanceDayMarker(p, o.mode, o.day);
          p.lastResultAt = o.nowIso;
          p.lastResultOk = false;
          p.lastResultStatus = "finalize_pending";
          p.lastResultMessage =
            o.message ?? "Terminal settled; recording result…";
          p.lastBatchUuid = o.batchUuid ?? p.lastBatchUuid;
        }),

      markNeedsManual: (terminalId, o) =>
        patch(set, get, terminalId, (p) => {
          // Ambiguous / partial / stuck — a human must reconcile. Advance the
          // day-marker (never auto-fire again today) but do NOT mark settled.
          p.phase = "needs_manual";
          p.settlingSince = null;
          p.consecutiveFailedDays += 1;
          advanceDayMarker(p, o.mode, o.day);
          p.lastResultAt = o.nowIso;
          p.lastResultOk = false;
          p.lastResultStatus = o.status ?? "needs_manual";
          p.lastResultMessage = o.message ?? "Manual review required";
          p.lastBatchUuid = o.batchUuid ?? p.lastBatchUuid;
        }),

      markFailedBackoff: (terminalId, o) =>
        patch(set, get, terminalId, (p) => {
          // Transient — retry within the same day. Deliberately does NOT advance
          // resolvedDueDay/catchupDay so the next eligible tick re-fires.
          p.phase = "failed";
          p.settlingSince = null;
          p.attemptDay = o.day;
          p.attemptCountToday += 1;
          p.nextRetryAtMs = o.nextRetryAtMs;
          p.lastResultAt = o.nowIso;
          p.lastResultOk = false;
          p.lastResultStatus = "failed";
          p.lastResultMessage = o.message ?? "Settlement failed (will retry)";
        }),
    }),
    {
      name: AUTO_SETTLEMENT_PERSIST_NAME,
      storage: createLazyPersistStorage(),
      partialize: (s) => ({ byTerminal: s.byTerminal }),
      version: 1,
    },
  ),
);
