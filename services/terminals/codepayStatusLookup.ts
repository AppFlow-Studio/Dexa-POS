// ============================================================
// CodePay Cloud status lookup — client for `codepay-transaction-status`
// File: services/terminals/codepayStatusLookup.ts
// ============================================================
// Asks CodePay's host (via our edge function, which holds the merchant's Cloud
// API key) what happened to one of our sales, by its CP_ merchant_order_no.
// Independent of the on-terminal Register app — which is exactly the thing that
// failed when a kiosk sale comes back unknown.
//
// Never throws: any transport/auth problem is `unavailable`, and an edge
// function with no config for this location is `unconfigured` (callers then
// keep their on-device behaviour).
// ============================================================

import type { useSupabaseClient } from "@/hooks/useSupabaseClient";

export type CodePayCloudStatus =
  | "approved"
  | "failed"
  | "pending"
  | "not_found"
  | "unavailable"
  | "unconfigured";

export interface CodePayCloudLookup {
  status: CodePayCloudStatus;
  reason?: string;
  source?: "recall" | "orderquery";
  trans_no?: string;
  trans_status?: number;
  trans_type?: string;
  merchant_order_no?: string;
  merchant_no?: string;
  /** Raw amount strings from CodePay (no float round-trip). */
  order_amount?: string;
  tip_amount?: string;
  trans_amount?: string;
  paid_amount?: string;
  auth_no?: string;
  /** Masked PAN, e.g. "41004003****4735". */
  card_no?: string;
  /** RRN. */
  ref_no?: string;
  /** "1" swipe / "2" chip / "3" contactless / "4" manual. */
  entry_mode?: string;
  /** e.g. "Visa", "MasterCard". */
  pay_method_id?: string;
  terminal_sn?: string;
  /** Host decline detail for a failed sale, e.g. "TS-D2012" / "Insufficient Funds". */
  error_code?: string;
  error_msg?: string;
  trans_time?: string;
  code?: string;
  msg?: string;
  /** Round-trip time of this lookup (ms). */
  latencyMs?: number;
}

/** A bound lookup for one location — what CodePayService.processSale takes. */
export type CodePayStatusLookupFn = (
  merchantOrderNo: string,
) => Promise<CodePayCloudLookup>;

/** Client-side ceiling; the function itself spends ≤ ~10s on CodePay. */
const LOOKUP_TIMEOUT_MS = 15_000;

const KNOWN: readonly CodePayCloudStatus[] = [
  "approved",
  "failed",
  "pending",
  "not_found",
  "unavailable",
  "unconfigured",
];

export async function lookupCodePaySaleStatus(params: {
  supabase: ReturnType<typeof useSupabaseClient>;
  locationId: string;
  merchantOrderNo: string;
}): Promise<CodePayCloudLookup> {
  const startedAt = Date.now();
  try {
    const { data, error } = await params.supabase.functions.invoke(
      "codepay-transaction-status",
      {
        body: {
          location_id: params.locationId,
          merchant_order_no: params.merchantOrderNo,
        },
        timeout: LOOKUP_TIMEOUT_MS,
      },
    );
    const latencyMs = Date.now() - startedAt;
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      // Function not deployed on this project yet — same as no config: the
      // caller keeps its on-device behaviour instead of retrying.
      if (status === 404) {
        return { status: "unconfigured", reason: "function_not_deployed", latencyMs };
      }
      return {
        status: "unavailable",
        reason: status ? `http_${status}` : error.name || "invoke_failed",
        latencyMs,
      };
    }
    const result = data as Partial<CodePayCloudLookup> | null;
    if (!result || !KNOWN.includes(result.status as CodePayCloudStatus)) {
      return { status: "unavailable", reason: "bad_response", latencyMs };
    }
    return { ...(result as CodePayCloudLookup), latencyMs };
  } catch (e) {
    return {
      status: "unavailable",
      reason: e instanceof Error ? e.name || "error" : "error",
      latencyMs: Date.now() - startedAt,
    };
  }
}
