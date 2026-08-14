// ============================================================
// Terminal serial-number identity reconciliation
// File: services/terminals/terminalIdentity.ts
// ============================================================
// The `payment_terminals.serial_number` column is the PHYSICAL-DEVICE
// identity. Settlement batches are attributed per physical device, so a
// terminal row's serial must never be silently overwritten with a DIFFERENT
// device's serial — doing so re-attributes the old device's open/settled
// batches onto the new hardware (funds mis-attribution).
//
// This module is the single arbiter of serial writes across every POS path
// (health checks, sale-response backfills, settlement provisioning, edit).
// Policy:
//   • stored serial NULL/blank  → FILL it in (first-time discovery)
//   • stored === discovered     → no-op
//   • stored !== discovered     → BLOCK (never overwrite); caller warns the
//                                 operator to register the replacement as a
//                                 NEW terminal.
//
// Registration (INSERT-by-serial) intentionally does NOT go through here — a
// brand-new serial has no matching row, so it correctly creates a new record.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { ATOM_INTERNAL_TERMINAL_ID } from "@/stores/useAtomTerminalStore";

/**
 * Sentinel written to `payment_terminals.last_connection_status` when a device
 * reports a different serial than the one on file. The column is free-text, so
 * this is storable even though the TS union is narrower elsewhere.
 */
export const TERMINAL_IDENTITY_MISMATCH_STATUS = "IdentityMismatch";

export type ReconcileResult =
  | { kind: "noop" } // stored === discovered
  | { kind: "skipped"; reason: "sentinel-id" | "empty-serial" } // atom / nothing to write
  | { kind: "filled"; serial: string } // NULL/blank stored → value written
  | { kind: "mismatch"; storedSerial: string; discoveredSerial: string };

/**
 * Normalize a serial for BOTH comparison and storage: trim + uppercase.
 * Serials are case-insensitive alnum strings; casing/whitespace drift must
 * never read as a mismatch nor spawn a duplicate terminal row. Returns "" for
 * null / undefined / blank.
 */
export function normalizeSerial(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/** UI predicate: is this connection status the identity-mismatch sentinel? */
export function isSerialMismatch(status: string | null | undefined): boolean {
  return status === TERMINAL_IDENTITY_MISMATCH_STATUS;
}

/**
 * Reconcile a discovered device serial against the terminal row's stored
 * serial, enforcing the identity policy above. Fetches the stored serial
 * itself (the in-memory store copy can be stale) so it is the single source of
 * truth and race-safe.
 *
 * Never throws for the policy branches — returns a discriminated result the
 * caller can act on (toast / stamp / mirror). Only throws on a hard DB error.
 */
export async function reconcileTerminalSerial(params: {
  supabase: SupabaseClient;
  terminalId: string;
  discoveredSerial: string | null | undefined;
  /** Stamp last_connection_status/last_error_message on mismatch. Default true. */
  stampStatusOnMismatch?: boolean;
}): Promise<ReconcileResult> {
  const {
    supabase,
    terminalId,
    discoveredSerial,
    stampStatusOnMismatch = true,
  } = params;

  // Never touch the in-memory ATOM sentinel — it is not a payment_terminals UUID.
  if (!terminalId || terminalId === ATOM_INTERNAL_TERMINAL_ID) {
    return { kind: "skipped", reason: "sentinel-id" };
  }

  const discovered = normalizeSerial(discoveredSerial);
  if (!discovered) return { kind: "skipped", reason: "empty-serial" };

  // Single source of truth: re-fetch the stored serial (store copy may be stale).
  const { data, error } = await supabase
    .from("payment_terminals")
    .select("serial_number")
    .eq("id", terminalId)
    .single();
  if (error) {
    throw new Error(`reconcileTerminalSerial: fetch failed: ${error.message}`);
  }

  const stored = normalizeSerial(data?.serial_number);

  if (!stored) {
    // First-time discovery. Compare-and-set: only write when serial is still
    // unset (NULL or legacy empty string) so a concurrent writer that just
    // filled it can't be clobbered. Store the normalized form.
    const { error: upErr } = await supabase
      .from("payment_terminals")
      .update({
        serial_number: discovered,
        updated_at: new Date().toISOString(),
      })
      .eq("id", terminalId)
      .or("serial_number.is.null,serial_number.eq.");
    if (upErr) {
      throw new Error(`reconcileTerminalSerial: fill failed: ${upErr.message}`);
    }
    return { kind: "filled", serial: discovered };
  }

  if (stored === discovered) return { kind: "noop" };

  // Different non-null serial → BLOCK. Never overwrite. Optionally stamp status
  // so the Devices screen surfaces the mismatch even outside a live toast.
  if (stampStatusOnMismatch) {
    await supabase
      .from("payment_terminals")
      .update({
        last_connection_status: TERMINAL_IDENTITY_MISMATCH_STATUS,
        last_error_message:
          `Device serial ${discovered} does not match registered ${stored}. ` +
          `Register the replacement as a new terminal.`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", terminalId)
      .then(({ error: stampErr }) => {
        if (stampErr) {
          console.warn(
            "[terminalIdentity] mismatch status stamp failed:",
            stampErr.message,
          );
        }
      });
  }

  return { kind: "mismatch", storedSerial: stored, discoveredSerial: discovered };
}
