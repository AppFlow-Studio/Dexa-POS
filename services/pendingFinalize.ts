// ============================================================
// Pending Finalize Journal
// File: services/pendingFinalize.ts
// ============================================================
// When the Castles terminal successfully closes its batch but our
// finalize_castles_settlement RPC fails (network drop, deadline,
// merchant-scope error, transient DB issue), the batch is left in
// 'pending' status on our side while the terminal has already
// reconciled. We persist the raw Castles response so the user can
// replay finalize from the BatchoutPanel without re-talking to the
// terminal.
//
// Storage: MMKV `storage` (device-local fallback) + Supabase table
// `pending_finalize_journal` (server mirror, merchant-scoped RLS).
// On list, the server is authoritative — any device for the same
// merchant can drive the retry. MMKV-only entries (server write
// failed) still surface as a fallback.

import { storage } from "@/lib/storage";
import { SupabaseClient } from "@supabase/supabase-js";

const KEY_PREFIX = "pending_finalize:";

export interface PendingFinalizeEntry {
  batchUuid: string;
  merchantId: string;
  terminalId: string;
  /** Which finalize RPC to replay. Defaults to 'castles' for legacy entries. */
  processor?: "castles" | "valor";
  /**
   * The terminal close response to replay into finalize. Kept as `castlesResponse`
   * for back-compat; for Valor this holds the Valor settlement response.
   */
  castlesResponse: any;
  savedAt: string; // ISO
}

function key(batchUuid: string): string {
  return `${KEY_PREFIX}${batchUuid}`;
}

function writeMmkv(entry: PendingFinalizeEntry): void {
  storage.set(key(entry.batchUuid), JSON.stringify(entry));
}

function removeMmkv(batchUuid: string): void {
  storage.remove(key(batchUuid));
}

function readAllMmkv(): PendingFinalizeEntry[] {
  const out: PendingFinalizeEntry[] = [];
  for (const k of storage.getAllKeys()) {
    if (!k.startsWith(KEY_PREFIX)) continue;
    const raw = storage.getString(k);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as PendingFinalizeEntry);
    } catch {
      storage.remove(k);
    }
  }
  return out;
}

export async function addPendingFinalize(
  entry: PendingFinalizeEntry,
  supabase?: SupabaseClient,
): Promise<void> {
  writeMmkv(entry);
  if (!supabase) return;
  const processor = entry.processor ?? "castles";
  const { error } = await supabase
    .from("pending_finalize_journal")
    .upsert(
      {
        batch_uuid: entry.batchUuid,
        merchant_id: entry.merchantId,
        terminal_id: entry.terminalId,
        processor,
        // `response` is the generic column; keep `castles_response` populated for
        // Castles rows so existing readers/reports stay intact.
        response: entry.castlesResponse,
        castles_response: processor === "castles" ? entry.castlesResponse : null,
        saved_at: entry.savedAt,
      },
      { onConflict: "batch_uuid" },
    );
  if (error) {
    console.warn(
      "[pendingFinalize] server upsert failed (kept in MMKV):",
      error.message,
    );
  }
}

export async function removePendingFinalize(
  batchUuid: string,
  supabase?: SupabaseClient,
): Promise<void> {
  removeMmkv(batchUuid);
  if (!supabase) return;
  const { error } = await supabase
    .from("pending_finalize_journal")
    .delete()
    .eq("batch_uuid", batchUuid);
  if (error) {
    console.warn(
      "[pendingFinalize] server delete failed:",
      error.message,
    );
  }
}

export async function listPendingFinalizes(
  supabase?: SupabaseClient,
): Promise<PendingFinalizeEntry[]> {
  const mmkvEntries = readAllMmkv();

  if (!supabase) {
    return mmkvEntries.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  }

  const { data, error } = await supabase
    .from("pending_finalize_journal")
    .select("batch_uuid, merchant_id, terminal_id, processor, response, castles_response, saved_at")
    .order("saved_at", { ascending: true });

  if (error) {
    console.warn(
      "[pendingFinalize] server list failed (falling back to MMKV):",
      error.message,
    );
    return mmkvEntries.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  }

  const serverEntries: PendingFinalizeEntry[] = (data ?? []).map((r: any) => ({
    batchUuid: r.batch_uuid,
    merchantId: r.merchant_id,
    terminalId: r.terminal_id,
    processor: (r.processor as "castles" | "valor") ?? "castles",
    castlesResponse: r.response ?? r.castles_response,
    savedAt: r.saved_at,
  }));

  const byUuid = new Map<string, PendingFinalizeEntry>();
  // Server is authoritative; MMKV-only entries (failed upsert) fill gaps.
  for (const e of mmkvEntries) byUuid.set(e.batchUuid, e);
  for (const e of serverEntries) byUuid.set(e.batchUuid, e);

  return Array.from(byUuid.values()).sort((a, b) =>
    a.savedAt.localeCompare(b.savedAt),
  );
}

export interface RetryFinalizeOutput {
  success: boolean;
  status?: string;
  shouldRetry: boolean;
  error?: string;
}

/**
 * Replay every journaled finalize once. finalize-replay ONLY — never re-commands
 * the terminal — and `retryPendingFinalize` self-clears on success / "already
 * settled", so this is safe to run repeatedly and idempotently (e.g. from the
 * auto-settle scheduler tick and a background resume task). Errors are swallowed;
 * unresolved entries stay journaled for the next drain.
 */
export async function drainPendingFinalizes(
  supabase: SupabaseClient,
): Promise<{ attempted: number; resolved: number }> {
  const entries = await listPendingFinalizes(supabase);
  let resolved = 0;
  for (const entry of entries) {
    try {
      const r = await retryPendingFinalize(supabase, entry);
      if (r.success) resolved++;
    } catch {
      /* leave journaled for next drain */
    }
  }
  return { attempted: entries.length, resolved };
}

export async function retryPendingFinalize(
  supabase: SupabaseClient,
  entry: PendingFinalizeEntry,
): Promise<RetryFinalizeOutput> {
  const { data, error } =
    (entry.processor ?? "castles") === "valor"
      ? await supabase.rpc("finalize_valor_settlement", {
          p_batch_uuid: entry.batchUuid,
          p_merchant_id: entry.merchantId,
          p_valor_response: entry.castlesResponse,
        })
      : await supabase.rpc("finalize_castles_settlement", {
          p_batch_uuid: entry.batchUuid,
          p_merchant_id: entry.merchantId,
          p_castles_response: entry.castlesResponse,
        });

  if (error) {
    // The 'already settled' guard means a previous retry actually
    // succeeded but we never cleared the journal. Treat as success
    // and clear so we stop showing it.
    if (typeof error.message === "string" && error.message.includes("already settled")) {
      await removePendingFinalize(entry.batchUuid, supabase);
      return { success: true, status: "settled", shouldRetry: false };
    }
    return {
      success: false,
      shouldRetry: true,
      error: error.message ?? "Retry failed",
    };
  }

  await removePendingFinalize(entry.batchUuid, supabase);
  return {
    success: Boolean(data?.success),
    status: data?.status,
    shouldRetry: Boolean(data?.should_retry),
  };
}
