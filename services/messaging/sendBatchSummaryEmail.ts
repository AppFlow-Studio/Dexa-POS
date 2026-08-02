import type { SupabaseClient } from "@supabase/supabase-js";

export interface SendBatchSummaryEmailParams {
  client: SupabaseClient;
  /**
   * settlement_batches.id — the SAME UUID passed to get_batch_summary_v1 as
   * p_settlement_batch_id (i.e. SettlementOutput.batchUuid). NOT the human batch
   * number.
   */
  settlementBatchId: string;
}

export interface SendBatchSummaryEmailResult {
  success: boolean;
  /** Set when the function short-circuited: 'disabled' | 'no_recipient' | 'already_sent' | 'forbidden' | 'not_found'. */
  skipped?: string;
  message?: string;
}

/**
 * Fire-and-forget trigger for the `email-batch-summary` Edge Function (added in
 * DexaPOS-Website PR #246). POSTs { settlement_batch_id } with the cashier's
 * forwarded Clerk token (supabase-js attaches it via the client's accessToken()
 * callback — the same auth path get_batch_summary_v1 already uses from
 * BatchoutPanel). The function re-fetches the authoritative summary server-side
 * (ownership gate + print-parity data), checks the per-location opt-in toggle,
 * and emails the location owner.
 *
 * This runs in PARALLEL with the batch-summary print — it is a background
 * nicety and must NEVER block, throw, or surface an error to the settlement
 * flow. Every failure (function not deployed to this env, network, disabled,
 * no recipient) is swallowed and returned as { success: false }. Idempotency is
 * enforced server-side (UNIQUE settlement_batch_id), so a re-fire is a no-op.
 */
export async function sendBatchSummaryEmail(
  params: SendBatchSummaryEmailParams
): Promise<SendBatchSummaryEmailResult> {
  const { client, settlementBatchId } = params;
  if (!settlementBatchId) {
    return { success: false, message: "Missing settlement batch id" };
  }

  try {
    const { data, error } = await client.functions.invoke(
      "email-batch-summary",
      { body: { settlement_batch_id: settlementBatchId } }
    );

    if (error) {
      console.warn(
        "[sendBatchSummaryEmail] edge function error:",
        error.message ?? error
      );
      return { success: false, message: error.message ?? "invoke failed" };
    }

    if (data && typeof data === "object") {
      return data as SendBatchSummaryEmailResult;
    }
    return { success: false, message: "Unexpected response from server" };
  } catch (err: unknown) {
    const message =
      (err as { message?: string })?.message ??
      "Failed to send batch summary email";
    console.warn("[sendBatchSummaryEmail] threw:", message);
    return { success: false, message };
  }
}
