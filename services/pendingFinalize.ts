// ============================================================
// Pending Finalize Journal
// File: services/pendingFinalize.ts
// ============================================================
// When the Castles terminal successfully closes its batch but our
// finalize_castles_settlement RPC fails (network drop, deadline,
// merchant-scope error, transient DB issue), the batch is left in
// 'pending' status on our side while the terminal has already
// reconciled. We persist the raw Castles response locally so the user
// can replay finalize from the BatchoutPanel without re-talking to
// the terminal.
//
// Storage: MMKV `storage` instance (persists across app restarts).
// finalize_castles_settlement is safe to re-call against a row in
// 'pending' / 'settling' / 'retry' / 'failed' (existing status guard).

import { storage } from "@/lib/storage";
import { SupabaseClient } from "@supabase/supabase-js";

const KEY_PREFIX = "pending_finalize:";

export interface PendingFinalizeEntry {
  batchUuid: string;
  merchantId: string;
  terminalId: string;
  castlesResponse: any;
  savedAt: string; // ISO
}

function key(batchUuid: string): string {
  return `${KEY_PREFIX}${batchUuid}`;
}

export function addPendingFinalize(entry: PendingFinalizeEntry): void {
  storage.set(key(entry.batchUuid), JSON.stringify(entry));
}

export function removePendingFinalize(batchUuid: string): void {
  storage.remove(key(batchUuid));
}

export function listPendingFinalizes(): PendingFinalizeEntry[] {
  const out: PendingFinalizeEntry[] = [];
  for (const k of storage.getAllKeys()) {
    if (!k.startsWith(KEY_PREFIX)) continue;
    const raw = storage.getString(k);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as PendingFinalizeEntry);
    } catch {
      // corrupted entry — drop it
      storage.remove(k);
    }
  }
  return out.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

export interface RetryFinalizeOutput {
  success: boolean;
  status?: string;
  shouldRetry: boolean;
  error?: string;
}

export async function retryPendingFinalize(
  supabase: SupabaseClient,
  entry: PendingFinalizeEntry,
): Promise<RetryFinalizeOutput> {
  const { data, error } = await supabase.rpc("finalize_castles_settlement", {
    p_batch_uuid: entry.batchUuid,
    p_merchant_id: entry.merchantId,
    p_castles_response: entry.castlesResponse,
  });

  if (error) {
    // The 'already settled' guard means a previous retry actually
    // succeeded but we never cleared the journal. Treat as success
    // and clear so we stop showing it.
    if (typeof error.message === "string" && error.message.includes("already settled")) {
      removePendingFinalize(entry.batchUuid);
      return { success: true, status: "settled", shouldRetry: false };
    }
    return {
      success: false,
      shouldRetry: true,
      error: error.message ?? "Retry failed",
    };
  }

  removePendingFinalize(entry.batchUuid);
  return {
    success: Boolean(data?.success),
    status: data?.status,
    shouldRetry: Boolean(data?.should_retry),
  };
}
