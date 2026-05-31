import type { PaymentMethod } from "@/types/db-order-management-types";
import type { DejavooRefundResponse } from "@/types/dejavoo-spin-api";
import { StationPaymentTerminal } from "./station";

export type ReversalType = "void" | "refund" | "partial_refund" | "item_return";

export type RefundReasonType =
  | "customer_request"
  | "item_quality"
  | "wrong_item"
  | "never_received"
  | "duplicate_charge"
  | "price_adjustment"
  | "order_cancelled"
  | "kitchen_error"
  | "manager_comp"
  | "other";

export type ReversalStatusType = "pending" | "completed" | "failed";

export interface RefundItemRequest {
  orderItemId: string;
  quantityToRefund: number;
  reason: RefundReasonType;
  reasonDetail?: string;
  returnToInventory?: boolean;
}

export interface RefundRequest {
  orderId: string;
  paymentId?: string; // If specific payment, otherwise finds best match
  refundType:
    | { type: "full_payment" }
    | { type: "partial_amount"; amount: number }
    | { type: "item_return"; items: RefundItemRequest[] };
  reason: RefundReasonType;
  reasonDetail?: string;
  initiatedBy: string; // staff_id
  approvedBy?: string; // manager_id if required
  referenceId?: string;
  payment_terminal_id: string;
  payment_terminal_name?: string;
  payment_terminal?: StationPaymentTerminal;
  stationId?: string; // station performing the refund
  metadata?: Record<string, unknown>; // Fraud flags, audit context
}

export interface ReversalRecord {
  id: string;
  original_payment_id: string;
  original_psp_reference: string | null;
  reversal_reference_id: string | null;
  reversal_psp_reference?: string | null; // RRN from void/refund response
  merchant_id: string;
  location_id: string;
  reversal_type: ReversalType;
  amount: number;
  reason_code: RefundReasonType;
  reason_description: string | null;
  status: ReversalStatusType;
  result_code?: string | null; // Terminal result code (e.g., "0" for approved)
  response_message?: string | null; // Terminal response message (e.g., "Approved")
  initiated_by: string | null;
  approved_by: string | null;
  requested_at: string;
  processed_at?: string | null; // When terminal processed the reversal
  completed_at: string | null;
  failed_at: string | null;
  terminal_response?: Record<string, unknown> | null;
  emv_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface OrderRefundItemRecord {
  id: string;
  reversal_id: string;
  order_item_id: string;
  order_payment_item_id?: string | null;
  quantity_refunded: number;
  unit_price_refunded: number;
  subtotal_refunded: number;
  tax_refunded: number;
  total_refunded: number;
  refund_reason: RefundReasonType;
  refund_reason_detail?: string | null;
  return_to_inventory?: boolean | null;
  inventory_updated?: boolean | null;
  created_at: string;
}

export interface RefundResult {
  success: boolean;
  reversalId?: string;
  reversals?: Array<{ reversalId: string; paymentId: string; amount: number }>;
  terminalResponse?: DejavooRefundResponse | Record<string, unknown>;
  error?: string;
}

export interface PaymentRefundContext {
  paymentId: string;
  referenceId: string;
  rrn: string;
  stan: string;
  authCode: string;
  amount: number;
  tipAmount: number;
  refundedAmount: number;
  availableForRefund: number;
  paymentMethod: PaymentMethod;
  batchNumber: string;
  isVoidable: boolean;
  // Wave R-SC: per-payment SC share baked into `amount` by process_payment_v14.
  // Used by buildItemRefundAllocation to prorate the SC slice into item refunds
  // so the customer is refunded what they actually paid (items + tax + SC),
  // not just (items + tax). Pre-v13 payments default to 0 — no-op.
  serviceCharge: number;
  terminalId?: string | null;
  terminalConfig?: StationPaymentTerminal; // resolved from payment_terminals at gather time
}

// ─────────────────────────────────────────────
// Wave R-1 — Refund pipeline outcome union
// ─────────────────────────────────────────────

/**
 * Discriminated union returned by refundService.processRefund (and the
 * store wrappers refundFullOrder / refundItems). The modal branches on
 * `kind`:
 *   'success'   — pipeline completed; data holds the RefundResult.
 *   'verifying' — a transient error (DEADLINE_EXCEEDED / 40001) left the
 *                 outcome unknown; show the polling verifying view.
 *   'error'     — permanent failure (e.g. terminal declined); show error toast.
 */
export type RefundRpcOutcome<T = RefundResult> =
  | { kind: "success"; data: T }
  | {
      kind: "verifying";
      journalId: string;
      failedStep: import("@/services/refundJournal").RefundPipelineStep;
      reason: string;
    }
  | { kind: "error"; error: string };

export interface PaymentItemAllocation {
  paymentId: string;
  paymentItemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tax: number;
  // Wave R-SC: prorated SC slice from the parent payment's service_charge.
  // Already folded into `total` for downstream callers; surfaced separately
  // for observability + tests.
  scShare?: number;
  total: number;
}

export interface ItemRefundAllocationItem {
  orderItemId: string;
  quantityRefunded: number;
  reason: RefundReasonType;
  reasonDetail?: string;
  returnToInventory: boolean;
  paymentAllocations: PaymentItemAllocation[];
}

export interface ItemRefundAllocation {
  items: ItemRefundAllocationItem[];
  totalRefund: number;
}
