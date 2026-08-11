import { connectionQuality, type Quality } from "@/lib/network/connectionQuality";
import { DEADLINES, PAYMENT_VERIFY_TIMER_MS } from "@/lib/network/deadlines";
import { runWithDeadline } from "@/lib/network/runWithDeadline";
import { OrderService } from "@/services/orderService";
import { getSharedValorService } from "@/services/terminals/valor-service";
import {
    completePaymentJournal,
    failPaymentJournal,
} from "@/services/paymentJournal";
import {
    getOrderStoreSupabaseClient,
    useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentRecoveryStore } from "@/stores/usePaymentRecoveryStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { PaymentJournalEntry } from "@/services/paymentJournal";
import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Sentry helper for payment-recovery events. Wrapped in try/catch — Sentry
 * failures must never break payment recovery itself.
 */
function _sentryRecoveryEvent(opts: {
  message: string;
  level: "info" | "warning" | "error";
  data: Record<string, unknown>;
  alsoCapture?: boolean;
  tags?: Record<string, string>;
}): void {
  try {
    Sentry.addBreadcrumb({
      category: "payment_recovery",
      level: opts.level,
      message: opts.message,
      data: opts.data,
    });
    if (opts.alsoCapture) {
      Sentry.captureMessage(opts.message, {
        level: opts.level,
        tags: { event: "payment_recovery", ...(opts.tags ?? {}) },
        extra: opts.data,
      });
    }
  } catch {
    /* no-op: Sentry must never break recovery */
  }
}

/**
 * After consuming the head journal, walk to the next pending entry if any —
 * keeps the operator triaging back-to-back recoveries. Returns true if the
 * caller should set its own follow-up view (no next journal); false if we
 * already promoted the next one.
 */
function _promoteNextOrFallback(consumedJournalId: string): boolean {
  const next = usePaymentRecoveryStore
    .getState()
    .pendingJournals.find((j) => j.id !== consumedJournalId);
  if (!next) return true; // caller falls through to its own setView
  // promote next: re-open verification on the new head
  usePaymentStore.getState().openForVerification(next as PaymentJournalEntry);
  return false;
}

/**
 * Server response shape from `check_recent_payment_v1`.
 * Wave Cat-B added `idempotency_key` (nullable — older rows / pre-v9 calls
 * leave it null).
 */
export interface CheckRecentPaymentMatch {
  matched: boolean;
  payment_id?: string;
  amount_cents?: number;
  tip_cents?: number;
  created_at?: string;
  idempotency_key?: string | null;
}

const ELAPSED_TICK_MS = 250;

/**
 * Wave Cat-B (C4): drives the verifying-state recovery flow. Mounted by the
 * PaymentVerifyingOverlay. Reads `usePaymentStore.verification` for the
 * active entry, polls `check_recent_payment` on a connection-quality-aware
 * cadence, and exposes the state machine to the overlay.
 *
 * Poll cadence: `min(2000, totalMs / 4)` ms.
 * `totalMs` extends on quality drop (never shortens below `elapsedMs`).
 * If ALL polls within `totalMs` time out, `canRetryNow` stays false
 * (fail-conservative — don't unlock Try Again when we never heard back).
 */
export function usePaymentVerification() {
  const verification = usePaymentStore((s) => s.verification);
  const clearVerification = usePaymentStore((s) => s.clearVerification);
  const setView = usePaymentStore((s) => s.setView);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [matchedPayment, setMatchedPayment] =
    useState<CheckRecentPaymentMatch | null>(null);
  const [pollAllTimedOut, setPollAllTimedOut] = useState(false);
  const [quality, setQuality] = useState<Quality>(() => connectionQuality.get());
  const [totalMs, setTotalMs] = useState<number>(
    () => PAYMENT_VERIFY_TIMER_MS[connectionQuality.get()],
  );

  const pollCountsRef = useRef({ total: 0, timedOut: 0 });
  const startedAtRef = useRef<number | null>(null);

  const isVerifying = verification !== null;

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

  // Reset per-attempt state when a new verification entry takes the slot.
  useEffect(() => {
    if (verification && verification.startedAt !== startedAtRef.current) {
      startedAtRef.current = verification.startedAt;
      pollCountsRef.current = { total: 0, timedOut: 0 };
      setElapsedMs(0);
      setMatchedPayment(null);
      setPollAllTimedOut(false);
      setTotalMs(PAYMENT_VERIFY_TIMER_MS[connectionQuality.get()]);
    } else if (!verification) {
      startedAtRef.current = null;
    }
  }, [verification]);

  // Tick elapsedMs while verifying.
  useEffect(() => {
    if (!isVerifying) return;
    const interval = setInterval(() => {
      setElapsedMs((e) => e + ELAPSED_TICK_MS);
    }, ELAPSED_TICK_MS);
    return () => clearInterval(interval);
  }, [isVerifying]);

  const checkOnce = useCallback(async (): Promise<{
    data: CheckRecentPaymentMatch | null;
    error: any;
  } | null> => {
    if (!verification) return null;
    if (!verification.orderDbId) {
      // No db_order_id yet — the original payment was queued (offline first).
      // The defensive check_recent_payment in the queue replay path covers this.
      return null;
    }
    const supabase = getOrderStoreSupabaseClient();
    if (!supabase) return null;

    const lookbackSeconds = Math.max(
      600,
      Math.ceil((Date.now() - verification.startedAt) / 1000) + 300,
    );

    return runWithDeadline<CheckRecentPaymentMatch>(
      "check_recent_payment",
      DEADLINES.paymentAuthCheck,
      async (signal) => {
        const { data, error } = await supabase
          .rpc("check_recent_payment", {
            p_order_id: verification.orderDbId,
            p_lookback_seconds: lookbackSeconds,
            p_amount_cents: verification.amountCents,
            p_split_portion_index: verification.splitPortionIndex ?? null,
          })
          .abortSignal(signal);
        return {
          data: data as unknown as CheckRecentPaymentMatch | null,
          error,
        };
      },
    );
  }, [verification]);

  // Poll loop.
  useEffect(() => {
    if (!isVerifying || matchedPayment) return;
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
        setMatchedPayment(result.data);
        if (result.data.matched) return; // stop polling once we have a hit
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
  }, [isVerifying, verification?.startedAt, totalMs, matchedPayment, checkOnce]);

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
    if (pollAllTimedOut) return false; // fail-conservative
    if (matchedPayment && matchedPayment.matched === false) return true;
    return elapsedMs >= totalMs;
  }, [isVerifying, elapsedMs, totalMs, matchedPayment, pollAllTimedOut]);

  const manualCheckNow = useCallback(async () => {
    const result = await checkOnce();
    if (result?.data) {
      setMatchedPayment(result.data);
    }
  }, [checkOnce]);

  /**
   * Wave 8 (C5): adoption path. The matched server payment becomes canonical
   * — we DO NOT call process_payment again (would double-charge). The server
   * already has the row; we just finalize local state.
   *
   * 1. Complete the journal so crash recovery skips it.
   * 2. Remove from the recovery queue.
   * 3. Trigger a backend pull to overlay canonical state on local optimistic.
   * 4. Drop into success view.
   */
  const markComplete = useCallback(() => {
    if (!verification) return;
    const consumedId = verification.journalId;
    const hadKeyMismatch = !!(
      matchedPayment?.idempotency_key &&
      verification.idempotencyKey &&
      matchedPayment.idempotency_key !== verification.idempotencyKey
    );
    _sentryRecoveryEvent({
      message: "payment_recovery.mark_complete",
      level: "info",
      data: {
        journal_id: consumedId,
        server_payment_id: matchedPayment?.payment_id ?? null,
        had_key_mismatch: hadKeyMismatch,
        amount_cents: verification.amountCents,
        reason: verification.reason,
      },
    });
    if (matchedPayment?.payment_id) {
      completePaymentJournal(consumedId, matchedPayment.payment_id);
    } else {
      // Manual operator override (matched but no payment_id surfaced) —
      // record an adoption marker so the journal isn't perpetually incomplete.
      completePaymentJournal(consumedId, "manual_adoption");
    }
    usePaymentRecoveryStore.getState().consume(consumedId);

    // Reconcile local order state against the backend (canonical truth).
    const orderDbId = verification.orderDbId;
    if (orderDbId) {
      const orderState = useOrderStore.getState();
      const localOrderId = orderState.dbOrderIdIndex?.[orderDbId];
      if (localOrderId) {
        queueMicrotask(() => {
          useOrderStore.getState().syncOrderFromBackendComplete(localOrderId);
        });
      }
    }

    // Auto-promote next pending journal if any; otherwise show success.
    const fallback = _promoteNextOrFallback(consumedId);
    if (fallback) {
      clearVerification();
      setView("success");
    }
  }, [verification, matchedPayment, clearVerification, setView]);

  /**
   * Wave 8 (C6): gated retry. Only callable when canRetryNow is true. The
   * verifying overlay layers a secondary tap-confirm on top of this — the
   * hook itself doesn't enforce that (UI concern). On confirm:
   * 1. Fail the existing journal (so it's not adopted later).
   * 2. Drop back to the card view; operator re-swipe mints a fresh journal
   *    + idempotency key via addPaymentToOrder.
   */
  const retryWithNewCharge = useCallback(() => {
    if (!verification) return;
    const consumedId = verification.journalId;
    // HIGH-SIGNAL event: V3 alert is "Try Again tap rate > 0.5% of payments".
    // Capture as message (not just breadcrumb) so it's queryable.
    _sentryRecoveryEvent({
      message: "payment_recovery.retry_with_new_charge",
      level: "warning",
      tags: { event_kind: "try_again" },
      alsoCapture: true,
      data: {
        journal_id: consumedId,
        idempotency_key: verification.idempotencyKey,
        amount_cents: verification.amountCents,
        elapsed_ms: elapsedMs,
        reason: verification.reason,
      },
    });
    failPaymentJournal(consumedId, "manual_retry_after_verify");
    usePaymentRecoveryStore.getState().consume(consumedId);

    // Auto-promote next pending journal if any; otherwise drop back to card
    // entry so the operator can re-swipe.
    const fallback = _promoteNextOrFallback(consumedId);
    if (fallback) {
      clearVerification();
      setView("card");
    }
  }, [verification, elapsedMs, clearVerification, setView]);

  // ──────────────────────────────────────────────────────────────────────
  // TCP-in-flight crash recovery (manual operator reconciliation)
  // Used when verification.reason === 'tcp_inflight_crash' (journal stuck
  // in 'initiated'). The polling flow doesn't help here — server has no
  // record. Operator confirms against the terminal display.
  // ──────────────────────────────────────────────────────────────────────
  const [isAdopting, setIsAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);

  /**
   * Yes — record this payment. The operator confirmed by checking the
   * terminal display that the charge actually went through. Fire
   * process_payment_v9 with the journal's idempotencyKey so the server
   * records canonical state. If the original v9 had partially run before
   * the crash (rare), the cached idempotency result returns and we don't
   * double-charge.
   *
   * TODO(gap-pin): manager-PIN gate for amounts > $X — see Cat-B Gap 3.
   */
  const markAsCharged = useCallback(async () => {
    if (!verification) return;
    if (!verification.orderDbId) {
      setAdoptionError(
        "Cannot record this payment — original order is not synced to the backend.",
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

    const stationId =
      useStoreSettingsStore.getState().selectedStation?.id ?? null;
    const terminalId =
      useStoreSettingsStore.getState().selectedStation?.payment_terminal?.id ??
      null;

    const consumedId = verification.journalId;
    const recoveredAt = new Date().toISOString();
    const terminalType =
      useStoreSettingsStore.getState().selectedStation?.payment_terminal
        ?.terminal_type;

    // Build the terminal_response the RPC sniffs to set order_payments.terminal_type.
    let terminalResponse: Record<string, unknown>;

    if (terminalType === "valor") {
      // Valor upgrade over Castles: instead of trusting the operator's eyeball,
      // re-query the terminal authoritatively by STAN (TRAN_MODE 90). The STAN
      // was captured into the journal's terminalTxnId at S2 (before card).
      const stan = verification.terminalTxnId ?? undefined;
      let recovered: Record<string, unknown> | null = null;
      if (stan) {
        try {
          const rec = await getSharedValorService().transactionStatus(stan);
          if (rec.outcome === "approved" && rec.terminalResponse) {
            recovered = rec.terminalResponse;
          }
        } catch {
          // Fall through to the operator-confirmed marker.
        }
      }
      terminalResponse = recovered ?? {
        manual_reconciliation: true,
        recovered_at: recoveredAt,
        terminal_vendor: "valor",
        // Server keys off this nested field to set terminal_type='valor'.
        valor_transaction: {
          reqTxnId: null,
          stanNo: stan ?? null,
          amountBase: (verification.amountCents / 100).toFixed(2),
          amountTip: ((verification.tipCents ?? 0) / 100).toFixed(2),
          amountTotal: (
            (verification.amountCents + (verification.tipCents ?? 0)) /
            100
          ).toFixed(2),
          transactionType: "sale",
          manual_reconciliation: true,
          recovered_at: recoveredAt,
        },
      };
    } else {
      // Castles (and default): manual marker — card details / RRN / STAN /
      // approval code are gone with the lost TCP response.
      terminalResponse = {
        manual_reconciliation: true,
        recovered_at: recoveredAt,
        terminal_vendor: "castles",
        castles_transaction: {
          referenceId: verification.terminalTxnId ?? null,
          amountBase: (verification.amountCents / 100).toFixed(2),
          amountTip: ((verification.tipCents ?? 0) / 100).toFixed(2),
          amountTotal: (
            (verification.amountCents + (verification.tipCents ?? 0)) /
            100
          ).toFixed(2),
          transactionType: "sale",
          manual_reconciliation: true,
          recovered_at: recoveredAt,
        },
      };
    }

    const params: any = {
      p_order_id: verification.orderDbId,
      p_payment_method: (verification.paymentMethod ?? "card").toLowerCase(),
      p_amount: verification.amountCents / 100,
      p_tip_amount: (verification.tipCents ?? 0) / 100,
      p_terminal_id: terminalId,
      p_station_id: stationId,
      p_terminal_response: terminalResponse,
    };

    try {
      const { data, error } = await OrderService.processPayment(
        supabase,
        params,
        { keyOverride: verification.idempotencyKey },
      );
      setIsAdopting(false);

      if (error) {
        const code = (error as any)?.code;
        const msg = ((error as any)?.message ?? "").toLowerCase();
        // Verifying-style outcomes: leave journal alone, surface toast,
        // operator can try again.
        if (
          code === "DEADLINE_EXCEEDED" ||
          code === "40001" ||
          msg.includes("idempotency_in_flight")
        ) {
          setAdoptionError(
            "Network slow — couldn't confirm with the server. Try again in a moment.",
          );
          return;
        }
        setAdoptionError(
          `Recording failed: ${(error as any)?.message ?? "unknown error"}`,
        );
        return;
      }

      const paymentId = (data as any)?.payment_id ?? "manual_adoption";
      _sentryRecoveryEvent({
        message: "payment_recovery.mark_as_charged",
        level: "info",
        data: {
          journal_id: consumedId,
          server_payment_id: paymentId,
          amount_cents: verification.amountCents,
          tip_cents: verification.tipCents ?? 0,
        },
      });
      completePaymentJournal(consumedId, paymentId);
      usePaymentRecoveryStore.getState().consume(consumedId);

      // Reconcile local state from canonical server. syncOrderFromBackendComplete
      // accepts either a local key or a db_order_id (resolves via dbOrderIdIndex
      // internally). It no-ops silently if the order isn't loaded into
      // ordersById yet — common right after a fresh app launch where the
      // bootstrap may not have reached this order. The next general
      // foreground/realtime refresh will catch up regardless.
      queueMicrotask(() => {
        useOrderStore
          .getState()
          .syncOrderFromBackendComplete(verification.orderDbId!);
      });

      // Seed completedPaymentInfo so the success view has meaningful context
      // (otherwise it falls back to whatever stale value was last set).
      const principalDollars = verification.amountCents / 100;
      const tipDollars = (verification.tipCents ?? 0) / 100;
      usePaymentStore.setState({
        completedPaymentInfo: {
          totalPaid: principalDollars,
          totalTips: tipDollars,
          paymentMethod: verification.paymentMethod ?? "Card",
          transactionId: verification.orderDbId!,
        },
      });

      const fallback = _promoteNextOrFallback(consumedId);
      if (fallback) {
        clearVerification();
        setView("success");
      }
    } catch (err) {
      setIsAdopting(false);
      setAdoptionError(
        `Recording failed: ${(err as any)?.message ?? String(err)}`,
      );
    }
  }, [verification, clearVerification, setView]);

  /**
   * No — discard this entry. Operator confirmed the terminal did NOT charge.
   * Fail the journal and consume from the recovery queue.
   */
  const markAsNotCharged = useCallback(() => {
    if (!verification) return;
    const consumedId = verification.journalId;
    // HIGH-SIGNAL event: silent under-recording risk if operator is wrong.
    _sentryRecoveryEvent({
      message: "payment_recovery.mark_as_not_charged",
      level: "warning",
      tags: { event_kind: "tcp_inflight_discard" },
      alsoCapture: true,
      data: {
        journal_id: consumedId,
        idempotency_key: verification.idempotencyKey,
        amount_cents: verification.amountCents,
        terminal_txn_id: verification.terminalTxnId ?? null,
      },
    });
    failPaymentJournal(consumedId, "manual_discard_no_charge");
    usePaymentRecoveryStore.getState().consume(consumedId);

    const fallback = _promoteNextOrFallback(consumedId);
    if (fallback) {
      clearVerification();
      // Drop back to the entry view so the operator can start fresh if needed.
      setView("payment-method-selection");
    }
  }, [verification, clearVerification, setView]);

  return {
    isVerifying,
    elapsedMs,
    totalMs,
    canRetryNow,
    matchedPayment,
    manualCheckNow,
    markComplete,
    retryWithNewCharge,
    // TCP-in-flight crash recovery
    markAsCharged,
    markAsNotCharged,
    isAdopting,
    adoptionError,
    quality,
    pollCounts: pollCountsRef.current,
    verification,
  };
}
