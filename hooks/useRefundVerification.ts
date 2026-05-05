import {
    connectionQuality,
    type Quality,
} from "@/lib/network/connectionQuality";
import { DEADLINES, PAYMENT_VERIFY_TIMER_MS } from "@/lib/network/deadlines";
import { runWithDeadline } from "@/lib/network/runWithDeadline";
import { OrderService } from "@/services/orderService";
import {
    completeRefundJournal,
    failRefundJournal,
    type RefundJournalEntry
} from "@/services/refundJournal";
import {
    getOrderStoreSupabaseClient,
    useOrderStore,
} from "@/stores/useOrderStore";
import { useRefundRecoveryStore } from "@/stores/useRefundRecoveryStore";
import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ──────────────────────────────────────────────────────────────────────
// Sentry helper (mirrors payment recovery pattern)
// ──────────────────────────────────────────────────────────────────────

function _sentryRefundEvent(opts: {
  message: string;
  level: "info" | "warning" | "error";
  data: Record<string, unknown>;
  alsoCapture?: boolean;
  tags?: Record<string, string>;
}): void {
  try {
    Sentry.addBreadcrumb({
      category: "refund_recovery",
      level: opts.level,
      message: opts.message,
      data: opts.data,
    });
    if (opts.alsoCapture) {
      Sentry.captureMessage(opts.message, {
        level: opts.level,
        tags: { event: "refund_recovery", ...(opts.tags ?? {}) },
        extra: opts.data,
      });
    }
  } catch {
    /* Sentry must never break refund recovery */
  }
}

/** After consuming the head journal, promote next if any. Returns true if caller falls through. */
function _promoteNext(consumedJournalId: string): boolean {
  const next = useRefundRecoveryStore
    .getState()
    .pendingJournals.find((j) => j.id !== consumedJournalId);
  if (!next) return true;
  // Caller sets its own follow-up state; we just remove consumed entry.
  return false;
}

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface CheckRecentRefundMatch {
  matched: boolean;
  reversal_id?: string;
  payment_id?: string;
  amount?: number;
  status?: string;
  idempotency_key?: string | null;
  reversal_type?: string;
  captured_at?: string;
}

const ELAPSED_TICK_MS = 250;

// ──────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────

/**
 * Wave R-2: drives the verifying-state recovery flow for refunds.
 * Reads the head of `useRefundRecoveryStore.pendingJournals`, polls
 * `check_recent_refund` on a connection-quality-aware cadence, and
 * exposes the state machine to the refund verifying view.
 *
 * Poll cadence mirrors usePaymentVerification:
 *   `min(2000, totalMs / 4)` ms
 *   `totalMs` extends on quality drops; never shortens below `elapsedMs`
 *
 * Sentry sites (6):
 *   1. Verifying entry — breadcrumb with journal_id, failed_step, reason
 *   2. Cold-start sweep detects journals (in _layout.tsx — see comment)
 *   3. markComplete with had_key_mismatch=true (cross-station write)
 *   4. retryRefund (HIGH SIGNAL rate metric)
 *   5. markRefundAsCompleted — manual reconciliation success
 *   6. markRefundAsNotCompleted — HIGH SIGNAL
 */
export function useRefundVerification(
  activeJournal: RefundJournalEntry | null,
) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [matchedRefund, setMatchedRefund] =
    useState<CheckRecentRefundMatch | null>(null);
  const [pollAllTimedOut, setPollAllTimedOut] = useState(false);
  const [quality, setQuality] = useState<Quality>(() =>
    connectionQuality.get(),
  );
  const [totalMs, setTotalMs] = useState<number>(
    () => PAYMENT_VERIFY_TIMER_MS[connectionQuality.get()],
  );

  const pollCountsRef = useRef({ total: 0, timedOut: 0 });
  const journalIdRef = useRef<string | null>(null);

  const isVerifying = activeJournal !== null;

  // Quality subscription: extend totalMs on drops, never shorten below elapsedMs.
  useEffect(() => {
    const unsub = connectionQuality.subscribe(() => {
      const next = connectionQuality.get();
      setQuality(next);
      setTotalMs((prev) =>
        Math.max(prev, PAYMENT_VERIFY_TIMER_MS[next], elapsedMs),
      );
    });
    return unsub;
  }, [elapsedMs]);

  // Reset per-attempt state when journal changes.
  useEffect(() => {
    if (activeJournal && activeJournal.id !== journalIdRef.current) {
      journalIdRef.current = activeJournal.id;
      pollCountsRef.current = { total: 0, timedOut: 0 };
      setElapsedMs(0);
      setMatchedRefund(null);
      setPollAllTimedOut(false);
      setTotalMs(PAYMENT_VERIFY_TIMER_MS[connectionQuality.get()]);

      // Sentry site 1: verifying entry
      _sentryRefundEvent({
        message: "refund_recovery.verifying_started",
        level: "warning",
        data: {
          journal_id: activeJournal.id,
          failed_step: activeJournal.failedStep ?? null,
          reason: activeJournal.error ?? null,
          amount: activeJournal.amount,
          refund_type: activeJournal.refundType,
          payment_method: activeJournal.paymentMethod,
        },
      });
    } else if (!activeJournal) {
      journalIdRef.current = null;
    }
  }, [activeJournal]);

  // Tick elapsedMs while verifying.
  useEffect(() => {
    if (!isVerifying) return;
    const interval = setInterval(() => {
      setElapsedMs((e) => e + ELAPSED_TICK_MS);
    }, ELAPSED_TICK_MS);
    return () => clearInterval(interval);
  }, [isVerifying]);

  const checkOnce = useCallback(async (): Promise<{
    data: CheckRecentRefundMatch | null;
    error: any;
  } | null> => {
    if (!activeJournal) return null;
    if (!activeJournal.dbOrderId) return null;
    const supabase = getOrderStoreSupabaseClient();
    if (!supabase) return null;

    const lookbackSeconds = Math.max(
      600,
      Math.ceil(
        (Date.now() - new Date(activeJournal.createdAt).getTime()) / 1000,
      ) + 300,
    );

    return runWithDeadline<CheckRecentRefundMatch>(
      "check_recent_refund",
      DEADLINES.paymentAuthCheck,
      async (signal) => {
        const amountCents = Math.round(activeJournal.amount * 100);
        const { data, error } = await supabase
          .rpc("check_recent_refund", {
            p_order_id: activeJournal.dbOrderId,
            p_lookback_seconds: lookbackSeconds,
            p_amount_cents: amountCents,
            p_idempotency_key: activeJournal.idempotencyKey ?? null,
          })
          .abortSignal(signal);
        return {
          data: data as unknown as CheckRecentRefundMatch | null,
          error,
        };
      },
    );
  }, [activeJournal]);

  // Poll loop (identical cadence to usePaymentVerification).
  useEffect(() => {
    if (!isVerifying || matchedRefund) return;
    let cancelled = false;
    const cadenceMs = Math.min(2000, Math.max(500, Math.floor(totalMs / 4)));

    const tick = async () => {
      if (cancelled) return;
      const result = await checkOnce();
      if (cancelled) return;
      pollCountsRef.current.total += 1;
      if (result?.error?.code === "DEADLINE_EXCEEDED") {
        pollCountsRef.current.timedOut += 1;
      } else if (result?.data) {
        setMatchedRefund(result.data);
        if (result.data.matched) return;
      }
      if (!cancelled) {
        setTimeout(tick, cadenceMs);
      }
    };

    const initial = setTimeout(tick, cadenceMs);
    return () => {
      cancelled = true;
      clearTimeout(initial);
    };
  }, [isVerifying, activeJournal?.id, totalMs, matchedRefund, checkOnce]);

  // Detect all-polls-timed-out (fail-conservative gating for Try Again).
  useEffect(() => {
    if (
      isVerifying &&
      elapsedMs >= totalMs &&
      pollCountsRef.current.total > 0 &&
      pollCountsRef.current.timedOut === pollCountsRef.current.total
    ) {
      setPollAllTimedOut(true);
    }
  }, [elapsedMs, totalMs, isVerifying]);

  const canRetryNow = useMemo(() => {
    if (!isVerifying) return false;
    if (pollAllTimedOut) return false;
    if (matchedRefund && matchedRefund.matched === false) return true;
    return elapsedMs >= totalMs;
  }, [isVerifying, elapsedMs, totalMs, matchedRefund, pollAllTimedOut]);

  const manualCheckNow = useCallback(async () => {
    const result = await checkOnce();
    if (result?.data) {
      setMatchedRefund(result.data);
    }
  }, [checkOnce]);

  // ──────────────────────────────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Mark refund complete — server already has the reversal row (poll matched).
   * Finalises journal, removes from recovery store, reconciles local order state.
   * Sentry site 3: fires with had_key_mismatch when cross-station write detected.
   */
  const markComplete = useCallback(() => {
    if (!activeJournal) return;
    const consumedId = activeJournal.id;
    const hadKeyMismatch = !!(
      matchedRefund?.idempotency_key &&
      activeJournal.idempotencyKey &&
      matchedRefund.idempotency_key !== activeJournal.idempotencyKey
    );

    _sentryRefundEvent({
      message: "refund_recovery.mark_complete",
      level: "info",
      data: {
        journal_id: consumedId,
        server_reversal_id: matchedRefund?.reversal_id ?? null,
        had_key_mismatch: hadKeyMismatch,
        amount: activeJournal.amount,
        refund_type: activeJournal.refundType,
      },
      alsoCapture: hadKeyMismatch, // Sentry site 3: cross-station write
      tags: hadKeyMismatch ? { event_kind: "cross_station_refund" } : undefined,
    });

    completeRefundJournal(
      consumedId,
      matchedRefund?.reversal_id ?? "manual_adoption",
    );
    useRefundRecoveryStore.getState().consume(consumedId);

    if (activeJournal.dbOrderId) {
      const orderState = useOrderStore.getState();
      const localOrderId = orderState.dbOrderIdIndex?.[activeJournal.dbOrderId];
      if (localOrderId) {
        queueMicrotask(() => {
          useOrderStore.getState().syncOrderFromBackendComplete(localOrderId);
        });
      }
    }

    _promoteNext(consumedId);
  }, [activeJournal, matchedRefund]);

  /**
   * Retry refund — operator confirms no server record found and wants to retry.
   * Reuses the same journal key so the server can deduplicate if it does
   * already have a record (race between the poll and our retry).
   * Sentry site 4: HIGH SIGNAL rate metric (retryRefund tap rate).
   */
  const retryRefund = useCallback(() => {
    if (!activeJournal) return;
    _sentryRefundEvent({
      message: "refund_recovery.retry_refund",
      level: "warning",
      alsoCapture: true, // Sentry site 4
      tags: { event_kind: "try_again_refund" },
      data: {
        journal_id: activeJournal.id,
        idempotency_key: activeJournal.idempotencyKey,
        failed_step: activeJournal.failedStep ?? null,
        amount: activeJournal.amount,
        elapsed_ms: elapsedMs,
      },
    });
    // Reset poll state so polling restarts fresh.
    setMatchedRefund(null);
    setPollAllTimedOut(false);
    setElapsedMs(0);
    setTotalMs(PAYMENT_VERIFY_TIMER_MS[connectionQuality.get()]);
    pollCountsRef.current = { total: 0, timedOut: 0 };
  }, [activeJournal, elapsedMs]);

  // ──────────────────────────────────────────────────────────────────────
  // TCP-in-flight manual reconciliation
  // Used when journal.status === 'initiated' and terminalTxnId is absent.
  // Operator confirms against terminal display whether refund was approved.
  // ──────────────────────────────────────────────────────────────────────

  const [isAdopting, setIsAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);

  /**
   * Yes — the terminal showed APPROVED for the refund.
   * Fire apply_refund_to_payment_v2 with keyOverride so server records
   * the refund even though the TCP response was lost.
   * Sentry site 5: success breadcrumb.
   */
  const markRefundAsCompleted = useCallback(async () => {
    if (!activeJournal) return;
    if (!activeJournal.dbOrderId || !activeJournal.reversalId) {
      // No reversal ID means the TCP crash happened before create_reversal.
      // We can't safely reconstruct — direct operator to manual reconciliation.
      setAdoptionError(
        "Cannot record refund automatically — reversal record was not created. " +
          "Please verify in the backend dashboard.",
      );
      return;
    }
    const supabase = getOrderStoreSupabaseClient();
    if (!supabase) {
      setAdoptionError("No backend connection.");
      return;
    }

    setIsAdopting(true);
    setAdoptionError(null);

    const consumedId = activeJournal.id;
    const recoveredAt = new Date().toISOString();

    try {
      // Update the reversal row to 'completed' using the journal's key.
      const { error: reversalErr } = await OrderService.updateReversalStatus(
        supabase,
        activeJournal.reversalId,
        "completed",
        {
          manual_reconciliation: true,
          recovered_at: recoveredAt,
          terminal_vendor: "castles",
        },
        null,
        null,
        null,
        null,
        { keyOverride: activeJournal.idempotencyKey },
      );

      if (reversalErr) {
        const code = (reversalErr as any)?.code;
        const msg = ((reversalErr as any)?.message ?? "").toLowerCase();
        if (
          code === "DEADLINE_EXCEEDED" ||
          code === "40001" ||
          msg.includes("idempotency_in_flight")
        ) {
          setAdoptionError("Network slow — try again in a moment.");
          setIsAdopting(false);
          return;
        }
        setAdoptionError(
          `Recording failed: ${(reversalErr as any)?.message ?? "unknown error"}`,
        );
        setIsAdopting(false);
        return;
      }

      // Sentry site 5: reconciliation success
      _sentryRefundEvent({
        message: "refund_recovery.mark_refund_as_completed",
        level: "info",
        alsoCapture: false,
        data: {
          journal_id: consumedId,
          reversal_id: activeJournal.reversalId,
          amount: activeJournal.amount,
          recovered_at: recoveredAt,
        },
      });

      completeRefundJournal(consumedId, activeJournal.reversalId);
      useRefundRecoveryStore.getState().consume(consumedId);

      if (activeJournal.dbOrderId) {
        const orderState = useOrderStore.getState();
        const localOrderId =
          orderState.dbOrderIdIndex?.[activeJournal.dbOrderId];
        if (localOrderId) {
          queueMicrotask(() => {
            useOrderStore.getState().syncOrderFromBackendComplete(localOrderId);
          });
        }
      }
    } catch (err) {
      setAdoptionError(
        `Recording failed: ${(err as any)?.message ?? String(err)}`,
      );
    } finally {
      setIsAdopting(false);
    }
  }, [activeJournal]);

  /**
   * No — the terminal did NOT show APPROVED.
   * Mark journal failed, emit Sentry HIGH SIGNAL.
   * Sentry site 6: HIGH SIGNAL for unrecoverable TCP-in-flight discard.
   */
  const markRefundAsNotCompleted = useCallback(() => {
    if (!activeJournal) return;
    const consumedId = activeJournal.id;

    _sentryRefundEvent({
      message: "refund_recovery.mark_refund_as_not_completed",
      level: "error",
      alsoCapture: true, // Sentry site 6 — HIGH SIGNAL
      tags: { event_kind: "tcp_inflight_refund_discard" },
      data: {
        journal_id: consumedId,
        reversal_id: activeJournal.reversalId ?? null,
        amount: activeJournal.amount,
        refund_type: activeJournal.refundType,
        payment_method: activeJournal.paymentMethod,
        original_payment_id: activeJournal.originalPaymentId,
      },
    });

    failRefundJournal(
      consumedId,
      "terminal_refund",
      "Operator confirmed terminal did not approve",
    );
    useRefundRecoveryStore.getState().consume(consumedId);
    _promoteNext(consumedId);
  }, [activeJournal]);

  return {
    isVerifying,
    elapsedMs,
    totalMs,
    canRetryNow,
    matchedRefund,
    manualCheckNow,
    markComplete,
    retryRefund,
    markRefundAsCompleted,
    markRefundAsNotCompleted,
    isAdopting,
    adoptionError,
    quality,
    activeJournal,
  };
}
