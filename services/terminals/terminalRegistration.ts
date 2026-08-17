// ============================================================
// Terminal registration duplicate-detection
// File: services/terminals/terminalRegistration.ts
// ============================================================
// When an operator adds a payment terminal, we must not create a second
// payment_terminals row for a device that is ALREADY registered at this
// location — a duplicate row re-attributes settlement batches by physical
// device and resurfaces the station-terminal-resolution ambiguity.
//
// The DB partial-unique index `uq_payment_terminals_location_serial`
// (location_id, serial_number) is the hard backstop. This module provides the
// UX-layer lookup so registration can NAME the existing terminal (and which
// station owns it) and offer to reuse it instead of erroring on a collision.
//
// Identity is matched in priority order:
//   1. serial_number — the hard physical-device identity (Castles infSN,
//      Valor SERIAL_NO). Location-wide, so a device bound to ANOTHER station
//      is still caught.
//   2. valor_epi — the fallback for Valor terminals that have no serial yet
//      (USB can't report a serial until the first transaction). Weaker than
//      serial but stops the trivial "same USB reader registered twice" case.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSerial } from "./terminalIdentity";

export interface ExistingTerminalMatch {
  id: string;
  terminalName: string | null;
  stationId: string | null;
  stationName: string | null;
  isActive: boolean;
  /** Which identity signal matched — serial is authoritative, epi is a fallback. */
  matchedBy: "serial" | "epi";
}

/** PostgREST embeds a to-one relation as an object, but some client/mock
 * shapes return an array — read the station name defensively. */
function extractStationName(row: Record<string, unknown>): string | null {
  const st = (row as { stations?: unknown }).stations;
  if (!st) return null;
  if (Array.isArray(st)) {
    const first = st[0] as { station_name?: string } | undefined;
    return first?.station_name ?? null;
  }
  return (st as { station_name?: string }).station_name ?? null;
}

/**
 * Look up whether a physical device is already registered at this location.
 * Returns the first match (serial first, then EPI) with enough context to
 * prompt the operator, or null when the device is genuinely new / unidentified.
 *
 * Never throws for the not-found case — resolves to null. A hard DB error is
 * surfaced by rejecting so the caller can decide (registration should fail
 * closed rather than blindly INSERT and risk a duplicate).
 */
export async function findExistingTerminalByIdentity(params: {
  supabase: SupabaseClient;
  locationId: string;
  serial?: string | null;
  epi?: string | null;
  /** Exclude a known row (e.g. the terminal being edited) from the match. */
  excludeId?: string | null;
}): Promise<ExistingTerminalMatch | null> {
  const { supabase, locationId, excludeId } = params;
  if (!locationId) return null;

  const serial = normalizeSerial(params.serial);
  const epi = (params.epi ?? "").trim();
  const cols =
    "id, terminal_name, station_id, is_active, stations(station_name)";

  const runLookup = async (
    column: "serial_number" | "valor_epi",
    value: string,
    matchedBy: "serial" | "epi",
  ): Promise<ExistingTerminalMatch | null> => {
    let q = supabase
      .from("payment_terminals")
      .select(cols)
      .eq("location_id", locationId)
      .eq(column, value)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(`findExistingTerminalByIdentity: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      terminalName: (row.terminal_name as string) ?? null,
      stationId: (row.station_id as string) ?? null,
      stationName: extractStationName(row),
      isActive: Boolean(row.is_active),
      matchedBy,
    };
  };

  // Serial is the hard identity — check it first.
  if (serial) {
    const bySerial = await runLookup("serial_number", serial, "serial");
    if (bySerial) return bySerial;
  }
  // EPI is the Valor fallback when no serial is available yet (e.g. USB).
  if (epi) {
    const byEpi = await runLookup("valor_epi", epi, "epi");
    if (byEpi) return byEpi;
  }
  return null;
}
