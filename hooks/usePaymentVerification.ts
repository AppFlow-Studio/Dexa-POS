import { connectionQuality, type Quality } from "@/lib/network/connectionQuality";
import { DEADLINES, PAYMENT_VERIFY_TIMER_MS } from "@/lib/network/deadlines";
import { runWithDeadline } from "@/lib/network/runWithDeadline";
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
import type { PaymentJournalEntry } from "@/services/paymentJournal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    failPaymentJournal(consumedId, "manual_retry_after_verify");
    usePaymentRecoveryStore.getState().consume(consumedId);

    // Auto-promote next pending journal if any; otherwise drop back to card
    // entry so the operator can re-swipe.
    const fallback = _promoteNextOrFallback(consumedId);
    if (fallback) {
      clearVerification();
      setView("card");
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
    quality,
    pollCounts: pollCountsRef.current,
    verification,
  };
}
