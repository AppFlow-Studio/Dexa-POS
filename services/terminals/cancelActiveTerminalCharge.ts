// ============================================================
// cancelActiveTerminalCharge — UI-free "cancel the in-flight sale" helper
// File: services/terminals/cancelActiveTerminalCharge.ts
// ============================================================
// The counterpart to `chargeActiveTerminal`. Mirrors the per-processor cancel
// branches the POS uses in `components/bill/ paymentView/CardPaymentView.tsx`
// (and `PreAuthPaymentView.tsx`) so a self-service kiosk's Back button can abort
// a card read on the station's active terminal:
//
//   Castles → gracefulDisconnect()  (return2Idle + close socket; the in-flight
//             processSale then resolves not-ok — the authoritative cancel signal)
//   Valor   → cancelInFlight(refId)  (cancel-before-card on the 2nd socket / USB;
//             `cleared` reports positive device confirmation)
//   Dejavoo → abortTransaction().referenceId(refId).execute()
//   ATOM    → unsupported (no cancel-before-card endpoint in v1)
//
// This layer only DISPATCHES the abort. The authoritative outcome — cancelled
// (no charge) vs. indeterminate (may have charged) vs. raced-to-approved — is
// decided by the caller when the in-flight `chargeActiveTerminal` promise
// settles. That keeps the "never void/re-charge an indeterminate sale" guard in
// one place.
// ============================================================

import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { resolveActiveProcessor } from "@/hooks/useActiveProcessor";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getSharedValorService } from "@/services/terminals/valor-service";
import type { useSupabaseClient } from "@/hooks/useSupabaseClient";

export interface CancelActiveChargeArgs {
  /** Reference id from the in-flight charge (Valor/Dejavoo need it; Castles doesn't). */
  referenceId?: string;
  /** Live Supabase client (Dejavoo needs it to load terminal creds). */
  supabase: ReturnType<typeof useSupabaseClient>;
}

export interface CancelActiveChargeResult {
  /** terminal_type we attempted to cancel (null if no terminal configured). */
  terminalType: string | null;
  /** A cancel/abort command was dispatched to the device. */
  dispatched: boolean;
  /** Valor only: the device positively confirmed the sale cleared before card entry. */
  cleared?: boolean;
  /** This processor can't cancel an in-flight sale (ATOM v1, or unknown type). */
  unsupported?: boolean;
  /** Non-fatal error while dispatching the cancel. */
  error?: string;
}

/**
 * Dispatch a cancel/abort for the sale currently in flight on the active
 * terminal. Best-effort and non-throwing — a failed dispatch is reported in the
 * result, never thrown, so the caller's flow isn't derailed.
 */
export async function cancelActiveTerminalCharge(
  args: CancelActiveChargeArgs,
): Promise<CancelActiveChargeResult> {
  const { referenceId, supabase } = args;
  const terminal = resolveActiveProcessor().activeTerminal;
  const terminalType = terminal?.terminal_type ?? null;

  if (!terminal) return { terminalType: null, dispatched: false };

  try {
    if (terminalType === "castles") {
      // Closing the socket aborts the in-flight card read; the service sends
      // return2Idle first so the device returns to its idle screen. processSale
      // then resolves not-ok, which is the authoritative "cancelled" signal.
      await getSharedCastlesService().gracefulDisconnect();
      return { terminalType, dispatched: true };
    }

    if (terminalType === "valor") {
      // Cancel-before-card on the 2nd socket (TCP) / shared line (USB). If the
      // card already landed this is a no-op and the main sale reconciles via
      // TRAN_MODE 90 (surfaced as indeterminate by chargeActiveTerminal).
      if (!referenceId) {
        return { terminalType, dispatched: false, error: "No reference id" };
      }
      const res = await getSharedValorService().cancelInFlight(referenceId);
      return {
        terminalType,
        dispatched: res.sent ?? true,
        cleared: res.cleared,
        error: res.error,
      };
    }

    if (terminalType === "atom") {
      // ATOM has no cancel-before-card endpoint in v1 — the /authorize call
      // blocks until the terminal resolves on its own.
      return { terminalType, dispatched: false, unsupported: true };
    }

    if (terminalType === "dejavoo") {
      if (!referenceId) {
        return { terminalType, dispatched: false, error: "No reference id" };
      }
      const api = new DejavooSpinAPI(supabase);
      await api.loadTerminal(terminal.id || "", terminal);
      await api.abortTransaction().referenceId(referenceId).execute();
      return { terminalType, dispatched: true };
    }

    return { terminalType, dispatched: false, unsupported: true };
  } catch (err) {
    return {
      terminalType,
      dispatched: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
