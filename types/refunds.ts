import type { PaymentMethod } from "@/types/db-order-management-types";
import type { DejavooRefundResponse } from "@/types/dejavoo-spin-api";

export type ReversalType =
  | "void"
  | "refund"
  | "partial_refund"
  | "item_return";

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
}

export interface ReversalRecord {
  id: string;
  original_payment_id: string;
  original_psp_reference: string | null;
  reversal_reference_id: string | null;
  merchant_id: string;
  location_id: string;
  reversal_type: ReversalType;
  amount: number;
  reason_code: RefundReasonType;
  reason_description: string | null;
  status: ReversalStatusType;
  initiated_by: string | null;
  approved_by: string | null;
  requested_at: string;
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
  terminalResponse?: DejavooRefundResponse;
  error?: string;
}

export interface PaymentRefundContext {
  paymentId: string;
  referenceId: string;
  rrn: string;
  authCode: string;
  amount: number;
  tipAmount: number;
  refundedAmount: number;
  availableForRefund: number;
  paymentMethod: PaymentMethod;
  batchNumber: string;
  isVoidable: boolean;
  terminalId?: string | null;
}

export interface PaymentItemAllocation {
  paymentId: string;
  paymentItemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tax: number;
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
