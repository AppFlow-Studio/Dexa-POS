// ============================================================
// Auto-Batch Settlement scheduler (Castles)
// File: services/autoSettlementScheduler.ts
// ============================================================
// Unattended daily batch-out. The tablet is the only device that can command a
// Castles terminal over LAN/USB, so it owns the timer. This module is the pure
// decision core (computeDueInstantMs / dayKey / decideFire) plus the orchestrator
// (tickAutoSettlement) that reuses the existing manual settle path
// (services/settlementService.ts::runSettlement).
//
// GOVERNING PRINCIPLE — an unattended actor must clear a HIGHER bar than a
// supervised human:
//   • fire only when the terminal is idle and no sale is active (shared mutex);
//   • never auto-cut when a prior batch is stuck (double-cut vector) — escalate;
//   • treat our own bookkeeping as NEVER the source of truth for "did money
//     settle" — only the terminal/DB is (verify with a post-fire unsettled recheck);
//   • never re-command a terminal after it closed a batch (dbWriteFailed →
//     pendingFinalize replay only);
//   • leave a diagnosable trail for NON-fires, not just fires.
//
// Day/time semantics match the backend watchdog: settle_time is a wall-clock time
// on the PLAIN calendar date in the location timezone — NOT a business-day
// rollover. Do not "helpfully" swap this for getCurrentBusinessDay.
// ============================================================

import { flushPendingWrite } from "@/lib/storage";
import { drainPendingFinalizes } from "@/services/pendingFinalize";
import {
  getUnsettledPaymentStats,
  logSettlementAttempt,
  runSettlement,
  type GetUnsettledStatsInput,
  type SettlementInput,
  type SettlementOutput,
  type UnsettledStats,
} from "@/services/settlementService";
import {
  AUTO_SETTLEMENT_PERSIST_NAME,
  useAutoSettlementStore,
  type FireMode,
  type TerminalAutoSettleProgress,
} from "@/stores/useAutoSettlementStore";
import { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

// ── tunables ──────────────────────────────────────────────────────
const SETTLING_STALE_MS = 10 * 60 * 1000; // mirror server prepare 10-min stale-reset
const BACKOFF_BASE_MS = 5 * 60 * 1000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_DAY = 4; // transient retries only (throws / shouldRetry)

// ── types ─────────────────────────────────────────────────────────
export interface AutoSettleConfig {
  terminalId: string;
  merchantId: string;
  locationId: string;
  timezone: string;
  autoSettle: boolean;
  /** "HH:MM" or "HH:MM:SS" in the location timezone. */
  settleTime: string | null;
  terminalType?: string; // must be 'castles' to fire
  terminalHost?: string;
  terminalPort?: number;
  connectionType?: "local_socket" | "usb";
  epi?: string;
  cancelPort?: number;
}

export interface AutoSettleProbes {
  /** WAN reachability (Supabase). */
  isOnline: () => boolean;
  /** Castles command mutex held (a live command is in flight). */
  isTerminalBusy: () => boolean;
  /** A payment is being processed / an order is locked for payment. */
  isSaleActive: () => boolean;
  /** Client kill switch (feature flag). */
  killSwitchOn: () => boolean;
}

export type FireDecision =
  | { action: "fire"; mode: FireMode; day: string; dueMs: number }
  | { action: "wait"; reason: string; day: string; dueMs: number | null }
  | { action: "skip"; reason: string; day: string; dueMs: number | null };

// ── pure time helpers ─────────────────────────────────────────────

function parseSettleTime(
  s: string,
): { h: number; m: number; sec: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const sec = match[3] ? Number(match[3]) : 0;
  if (h > 23 || m > 59 || sec > 59) return null;
  return { h, m, sec };
}

/** Plain calendar date ("YYYY-MM-DD") in the location timezone. */
export function dayKey(tz: string, nowMs?: number): string | null {
  const base = nowMs != null ? DateTime.fromMillis(nowMs) : DateTime.now();
  const dt = base.setZone(tz);
  if (!dt.isValid) return null;
  return dt.toISODate();
}

/** epoch ms of today's settle_time wall-clock in the location timezone (DST-correct). */
export function computeDueInstantMs(
  settleTime: string,
  tz: string,
  nowMs?: number,
): number | null {
  const parsed = parseSettleTime(settleTime);
  if (!parsed) return null;
  const base = (nowMs != null ? DateTime.fromMillis(nowMs) : DateTime.now()).setZone(
    tz,
  );
  if (!base.isValid) return null;
  const due = base.set({
    hour: parsed.h,
    minute: parsed.m,
    second: parsed.sec,
    millisecond: 0,
  });
  if (!due.isValid) return null;
  return due.toMillis();
}

function yesterdayOf(day: string): string | null {
  const dt = DateTime.fromISO(day);
  if (!dt.isValid) return null;
  return dt.minus({ days: 1 }).toISODate();
}

/** A prior scheduled day was never resolved (tablet was off across its settle_time). */
function isMissedPriorDay(
  resolvedDueDay: string | null,
  today: string,
): boolean {
  if (resolvedDueDay == null) return false; // fresh install — wait for first due
  const yesterday = yesterdayOf(today);
  if (yesterday == null) return false;
  // Lexicographic compare on "YYYY-MM-DD" == chronological.
  return resolvedDueDay < yesterday;
}

// ── pure decision ─────────────────────────────────────────────────

/**
 * PURE. Decides whether to fire for one terminal at `nowMs`. No network, no I/O.
 * `mode` distinguishes the SCHEDULED daily fire (at/after settle_time) from a
 * pre-due CATCH-UP sweep of a missed prior day — a catch-up must not consume the
 * scheduled fire (they advance different day-markers).
 */
export function decideFire(
  cfg: AutoSettleConfig,
  progress: TerminalAutoSettleProgress,
  probes: AutoSettleProbes,
  nowMs?: number,
): FireDecision {
  const now = nowMs ?? Date.now();
  const day = dayKey(cfg.timezone, now);
  const skip = (reason: string): FireDecision => ({
    action: "skip",
    reason,
    day: day ?? "",
    dueMs: null,
  });

  // ── disabled gates ──
  if (!probes.killSwitchOn()) return skip("kill_switch_off");
  if (cfg.terminalType !== "castles") return skip("not_castles");
  if (!cfg.autoSettle) return skip("auto_settle_off");
  if (!cfg.settleTime) return skip("no_settle_time");
  if (!day) return skip("bad_timezone");

  const dueMs = computeDueInstantMs(cfg.settleTime, cfg.timezone, now);
  if (dueMs == null) return skip("bad_settle_time");

  const wait = (reason: string): FireDecision => ({
    action: "wait",
    reason,
    day,
    dueMs,
  });

  // ── in-flight guard (client mirror of the server 10-min stale window) ──
  if (
    progress.phase === "settling" &&
    progress.settlingSince != null &&
    now - progress.settlingSince < SETTLING_STALE_MS
  ) {
    return skip("in_flight");
  }

  // ── within-day backoff ──
  if (
    progress.attemptDay === day &&
    progress.nextRetryAtMs != null &&
    now < progress.nextRetryAtMs
  ) {
    return wait("backoff");
  }
  if (
    progress.attemptDay === day &&
    progress.attemptCountToday >= MAX_ATTEMPTS_PER_DAY
  ) {
    return skip("attempt_cap");
  }

  // ── pick mode: scheduled (>= due) vs catch-up (pre-due, missed prior day) ──
  let mode: FireMode;
  const pastDue = now >= dueMs;
  if (pastDue) {
    if (progress.resolvedDueDay === day) return skip("already_settled");
    mode = "scheduled";
  } else {
    if (!isMissedPriorDay(progress.resolvedDueDay, day)) return wait("before_due");
    if (progress.catchupDay === day) return skip("catchup_done");
    mode = "catchup";
  }

  // ── runtime gates: DEFER (do not consume the day) ──
  if (probes.isSaleActive()) return wait("sale_active");
  if (probes.isTerminalBusy()) return wait("terminal_busy");
  if (!probes.isOnline()) return wait("offline");

  return { action: "fire", mode, day, dueMs };
}

// ── orchestration ─────────────────────────────────────────────────

/** Per-terminal serialization across concurrent ticks in one JS runtime. */
const inFlight = new Map<string, Promise<void>>();

const flush = () => flushPendingWrite(AUTO_SETTLEMENT_PERSIST_NAME);

// Periodic finalize-replay so a `finalize_pending` day still clears on a tablet
// that never backgrounds (the background resume task wouldn't fire there). Cheap
// (a merchant-scoped select) and finalize-replay only — never touches a terminal.
const DRAIN_THROTTLE_MS = 10 * 60 * 1000;
let lastDrainMs = 0;

async function maybeDrain(supabase: SupabaseClient, now: number): Promise<void> {
  if (now - lastDrainMs < DRAIN_THROTTLE_MS) return;
  lastDrainMs = now;
  try {
    await drainPendingFinalizes(supabase);
  } catch {
    /* stays journaled for the next drain */
  }
}

function computeBackoffMs(attemptCountBefore: number, now: number): number {
  const exp = Math.min(attemptCountBefore, 4);
  return now + Math.min(BACKOFF_BASE_MS * 2 ** exp, BACKOFF_MAX_MS);
}

export interface TickDeps {
  supabase: SupabaseClient;
  cfg: AutoSettleConfig;
  probes: AutoSettleProbes;
  nowMs?: number;
  /** Injectable for tests. Defaults to the real settle path. */
  run?: (input: SettlementInput) => Promise<SettlementOutput>;
  getStats?: (input: GetUnsettledStatsInput) => Promise<UnsettledStats>;
  onLog?: (msg: string) => void;
}

/**
 * One scheduler tick for one terminal: decide → (record observability) →
 * preflight → fire → verify-by-truth → record. Fire-and-forget safe; never throws.
 */
export async function tickAutoSettlement(deps: TickDeps): Promise<void> {
  const { supabase, cfg, probes } = deps;
  const now = deps.nowMs ?? Date.now();
  const run = deps.run ?? runSettlement;
  const getStats = deps.getStats ?? getUnsettledPaymentStats;
  const store = useAutoSettlementStore.getState();

  // Periodic finalize-replay, independent of whether we fire this tick.
  void maybeDrain(supabase, now);

  const day = dayKey(cfg.timezone, now);
  if (day) store.rollDayIfNeeded(cfg.terminalId, day);

  const progress = store.getProgress(cfg.terminalId);
  const decision = decideFire(cfg, progress, probes, now);
  const armed =
    probes.killSwitchOn() &&
    cfg.terminalType === "castles" &&
    !!cfg.autoSettle &&
    !!cfg.settleTime;

  // A concurrent tick already holds the terminal — record honestly, don't double-fire.
  const concurrent = decision.action === "fire" && inFlight.has(cfg.terminalId);
  store.recordTick(cfg.terminalId, {
    armed,
    nextFireAtMs: decision.dueMs,
    decision: concurrent ? "skip" : decision.action,
    reason: concurrent
      ? "in_flight_concurrent"
      : decision.action === "fire"
        ? null
        : decision.reason,
    tickAtMs: now,
  });

  if (decision.action !== "fire" || concurrent) return;

  const mode = decision.mode;
  const fireDay = decision.day;
  const nowIso = new Date(now).toISOString();

  const task = (async () => {
    try {
      // ── network preflight ──
      const stats = await getStats({
        supabase,
        merchantId: cfg.merchantId,
        locationId: cfg.locationId,
        terminalId: cfg.terminalId,
      });
      store.markPreflight(cfg.terminalId, now);

      // Stuck batch → a prior cut's outcome is unknown. NEVER auto-cut on top of
      // it (double-cut vector). Escalate to a human.
      if (stats.hasStuckBatch) {
        await logSettlementAttempt(supabase, {
          terminalId: cfg.terminalId,
          phase: "finalize",
          outcome: "blocked",
          detail: `auto-settle blocked: stuck batch (${stats.stuckBatchStatus ?? "unknown"})`,
          batchUuid: stats.stuckBatchUuid ?? null,
          initiatedBy: "pos_auto",
        });
        store.markNeedsManual(cfg.terminalId, {
          mode,
          day: fireDay,
          status: "stuck_batch",
          message: `A prior batch is stuck (${stats.stuckBatchStatus ?? "unknown"}). Manual reconcile required before auto-settle can run.`,
          batchUuid: stats.stuckBatchUuid ?? null,
          nowIso,
        });
        return;
      }

      // Nothing to settle → close the day WITHOUT touching the terminal (prepare
      // would RAISE on 0 payments). Manual-settled-already lands here too.
      if (stats.count === 0) {
        store.markNothingToSettle(cfg.terminalId, { mode, day: fireDay, nowIso });
        return;
      }

      // ── fire (reuses the full manual path; its own 2-attempt loop is inside) ──
      store.markFiring(cfg.terminalId, now);
      flush();

      const out = await run({
        terminalId: cfg.terminalId,
        merchantId: cfg.merchantId,
        initiatedBy: "pos_auto",
        terminalType: cfg.terminalType,
        terminalHost: cfg.terminalHost,
        terminalPort: cfg.terminalPort,
        connectionType: cfg.connectionType,
        epi: cfg.epi,
        cancelPort: cfg.cancelPort,
        locationId: cfg.locationId,
        supabase,
        onStatus: deps.onLog,
      });

      // ── verify by TRUTH, never by "attempted" ──
      if (out.success) {
        const post = await getStats({
          supabase,
          merchantId: cfg.merchantId,
          locationId: cfg.locationId,
          terminalId: cfg.terminalId,
        });
        if (post.count === 0 && !post.hasStuckBatch) {
          store.markSettled(cfg.terminalId, {
            mode,
            day: fireDay,
            status: out.status ?? "settled",
            message: out.batchId ? `Settled ${out.batchId}` : "Settled",
            batchUuid: out.batchUuid ?? null,
            nowIso,
          });
        } else {
          store.markNeedsManual(cfg.terminalId, {
            mode,
            day: fireDay,
            status: "partial",
            message: `Settled, but ${post.count} payment(s) remain unsettled — review.`,
            batchUuid: out.batchUuid ?? null,
            nowIso,
          });
        }
      } else if (out.dbWriteFailed) {
        // Terminal closed the batch; only the finalize DB-write failed. Keep the
        // day OPEN of "confirmed settled" but advance the marker so we NEVER
        // re-command the terminal today — the pendingFinalize drain replays finalize.
        store.markFinalizePending(cfg.terminalId, {
          mode,
          day: fireDay,
          message: out.error ?? "Terminal settled; finalize pending.",
          batchUuid: out.batchUuid ?? null,
          nowIso,
        });
      } else if (out.partialSuccess || out.requiresSupport) {
        store.markNeedsManual(cfg.terminalId, {
          mode,
          day: fireDay,
          status: "partial",
          message: out.error ?? "Partial settlement — manual review required.",
          batchUuid: out.batchUuid ?? null,
          nowIso,
        });
      } else if (out.shouldRetry) {
        backoff(cfg.terminalId, fireDay, now, progress.attemptCountToday, out.error ?? "terminal requested retry", nowIso);
      } else {
        // Hard failure after the internal 2-attempt loop → stop + escalate.
        // (Terminal-unreachable throws instead and is handled as transient below.)
        store.markNeedsManual(cfg.terminalId, {
          mode,
          day: fireDay,
          status: "failed",
          message: out.error ?? "Settlement failed — contact your payment processor.",
          batchUuid: out.batchUuid ?? null,
          nowIso,
        });
      }
    } catch (e) {
      // connect/verify threw (terminal unreachable / network) → transient → backoff.
      const msg = e instanceof Error ? e.message : String(e);
      backoff(cfg.terminalId, fireDay, now, progress.attemptCountToday, msg, nowIso);
    } finally {
      flush();
      inFlight.delete(cfg.terminalId);
    }

    // Replay any journaled finalize (finalize-only; never re-commands the terminal).
    try {
      await drainPendingFinalizes(supabase);
    } catch {
      /* stays journaled for the next drain */
    }
  })();

  inFlight.set(cfg.terminalId, task);
  await task;
}

function backoff(
  terminalId: string,
  day: string,
  now: number,
  attemptCountBefore: number,
  message: string,
  nowIso: string,
): void {
  useAutoSettlementStore.getState().markFailedBackoff(terminalId, {
    mode: "scheduled", // marker not advanced on backoff; mode is irrelevant here
    day,
    message,
    nextRetryAtMs: computeBackoffMs(attemptCountBefore, now),
    nowIso,
  });
}

/** Test-only: reset the in-process serialization map + drain throttle. */
export function __resetInFlightForTests(): void {
  inFlight.clear();
  lastDrainMs = 0;
}
