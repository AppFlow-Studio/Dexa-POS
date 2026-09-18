// ============================================================
// CodePay auto-provision
// File: services/terminals/codepayAutoProvision.ts
// ============================================================
// Creates (or adopts) a REAL payment_terminals row for the on-device CodePay
// terminal, so batch-out/settlement works without hand-provisioning every device
// via SQL. Sales run fine off the synthetic in-memory terminal (they only need
// the Intent app_id), but settlement needs a DB row: BatchoutPanel operates on
// the station's configured terminal and prepare_codepay_settlement takes a
// terminal UUID + merchant_id.
//
// Idempotent find-or-create keyed on a STABLE per-device serial
// (resolveCodePayDeviceIdentity → hardware serial, else ANDROID_ID). The DB
// partial-unique index (location_id, serial_number) is the hard backstop, so a
// race resolves to an adopt rather than a duplicate. No operator prompt (unlike
// the manual "Add Terminal" flow) — this is headless.
//
// Called from:
//   • the Settings CodePay card ("Provision this device")           — explicit
//   • the CodePay detector, once per session (kill-switchable)       — automatic
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import {
  CODEPAY_TERMINAL_DISPLAY_NAME,
} from "@/types/codepay";
import { useCodePayTerminalStore } from "@/stores/useCodePayTerminalStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { findExistingTerminalByIdentity } from "./terminalRegistration";
import { normalizeSerial } from "./terminalIdentity";
import { resolveCodePayDeviceIdentity } from "./codepayDeviceIdentity";

const TAG = "[CodePayAutoProvision]";

/** Registered by PosSyncProvider so the headless detector path has a client. */
let _supabase: SupabaseClient | null = null;
export function setCodePayProvisionSupabaseClient(
  client: SupabaseClient | null,
): void {
  _supabase = client;
}

export interface EnsureCodePayResult {
  ok: boolean;
  terminalId?: string;
  /** True when a new row was inserted (vs adopting an existing one). */
  created?: boolean;
  /** The stable serial the row is keyed on. */
  serial?: string;
  /** Set when ok=false. One of: no_supabase, missing_session, no_app_id,
   *  no_serial, or a DB error message. */
  reason?: string;
}

/**
 * Ensure a payment_terminals row exists for this device's on-terminal CodePay.
 * Never throws — returns { ok:false, reason } so callers (incl. a boot-time
 * probe) can retry silently. Missing session / offline both surface as ok:false.
 */
export async function ensureCodePayTerminalProvisioned(params?: {
  supabase?: SupabaseClient | null;
  appId?: string;
  serial?: string | null;
  merchantId?: string;
  locationId?: string;
  stationId?: string;
  terminalName?: string;
}): Promise<EnsureCodePayResult> {
  const supabase = params?.supabase ?? _supabase;
  if (!supabase) return { ok: false, reason: "no_supabase" };

  const settings = useStoreSettingsStore.getState();
  const locationId = params?.locationId ?? settings.selectedStore?.id;
  const merchantId = params?.merchantId ?? settings.selectedStore?.merchant_id;
  const stationId = params?.stationId ?? settings.selectedStation?.id;
  const appId = (
    params?.appId ??
    useCodePayTerminalStore.getState().appId ??
    ""
  ).trim();

  if (!locationId || !merchantId || !stationId) {
    return { ok: false, reason: "missing_session" };
  }
  if (!appId) return { ok: false, reason: "no_app_id" };

  const rawSerial =
    params?.serial ?? (await resolveCodePayDeviceIdentity())?.serial ?? null;
  const serial = normalizeSerial(rawSerial);
  if (!serial) return { ok: false, reason: "no_serial" };

  const terminalName = params?.terminalName ?? CODEPAY_TERMINAL_DISPLAY_NAME;

  // Fields refreshed when adopting an existing row (device moved station, app_id
  // changed, or an old null-serial row just got its serial filled).
  const adoptPayload: Record<string, unknown> = {
    terminal_name: terminalName,
    terminal_type: "codepay",
    register_id: appId,
    connection_type: "local",
    station_id: stationId,
    is_active: true,
    serial_number: serial,
  };
  const insertPayload: Record<string, unknown> = {
    location_id: locationId,
    merchant_id: merchantId,
    station_id: stationId,
    terminal_name: terminalName,
    terminal_type: "codepay",
    // The Intent app_id rides on register_id (charge paths read app_id ?? register_id).
    register_id: appId,
    auth_key: null,
    connection_type: "local",
    is_active: true,
    is_connected: true,
    api_environment: "production",
    serial_number: serial,
  };

  try {
    // Find-or-adopt by serial first — this is also the "already provisioned"
    // fast path (returns the existing row, refreshed).
    const existing = await findExistingTerminalByIdentity({
      supabase,
      locationId,
      serial,
    }).catch(() => null);

    let terminalId: string;
    let created = false;

    if (existing) {
      await supabase
        .from("payment_terminals")
        .update(adoptPayload)
        .eq("id", existing.id);
      terminalId = existing.id;
    } else {
      const { data, error } = await supabase
        .from("payment_terminals")
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (error) {
        // Uniqueness race (another actor inserted the same device) → adopt it.
        if ((error as { code?: string }).code === "23505") {
          const match = await findExistingTerminalByIdentity({
            supabase,
            locationId,
            serial,
          }).catch(() => null);
          if (!match) return { ok: false, reason: error.message };
          await supabase
            .from("payment_terminals")
            .update(adoptPayload)
            .eq("id", match.id);
          terminalId = match.id;
        } else {
          return { ok: false, reason: error.message };
        }
      } else {
        terminalId = (data as { id: string }).id;
        created = true;
      }
    }

    // One active terminal per station — otherwise the station RPC resolves the
    // active terminal ambiguously (mirrors the manual register path).
    await supabase
      .from("payment_terminals")
      .update({ is_active: false })
      .eq("station_id", stationId)
      .eq("is_active", true)
      .neq("id", terminalId);

    console.log(
      `${TAG} ${created ? "provisioned" : "adopted"} codepay terminal ${terminalId} (serial ${serial})`,
    );
    return { ok: true, terminalId, created, serial };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`${TAG} provision failed:`, reason);
    return { ok: false, reason };
  }
}
