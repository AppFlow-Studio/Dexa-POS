// services/paymentService.ts

import { captureRpcError } from "@/lib/supabase";
import { OrderService } from "@/services/orderService";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import type { ProcessPaymentV2Params } from "@/types/db-order-management-types";
import { round2 } from "@/utils/money";

// ============================================================================
// PAYMENT RESULT TYPES
// ============================================================================

export interface ProcessPaymentV2Result {
  success: boolean;
  payment_id: string;
  payment_method: "card" | "cash";
  amount_charged: number;
  tip_amount: number;
  total_collected: number;
  change_given: number;
  is_cash_priced: boolean;
  pricing_mode: "card" | "cash" | "mixed";
  items_covered: string[];
  order_amount_paid: number;
  order_amount_due: number;
  order_fully_paid: boolean;
}

/**
 * Wave Cat-B: typed return for payment RPCs. Makes "we don't know if the
 * payment landed" a first-class outcome callers cannot accidentally retry
 * blindly. `verifying` means the original RPC may have committed — the caller
 * MUST hand off to the recovery flow (check_recent_payment poll), not retry.
 */
export type PaymentRpcOutcome<T> =
  | { kind: "success"; data: T }
  | {
      kind: "verifying";
      reason: "deadline_exceeded" | "idempotency_in_flight";
      idempotencyKey: string;
    }
  | { kind: "error"; error: any };

// Helper to get Supabase client with error handling
function getSupabase() {
  const supabase = getOrderStoreSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Supabase client not initialized. Ensure the app is connected.",
    );
  }
  return supabase;
}

/**
 * Internal: run a process_payment call through the wrapped OrderService path,
 * then map { data, error } → PaymentRpcOutcome. Centralizes the
 * deadline/40001 → 'verifying' classification used across all 4 helpers.
 */
async function processPaymentOutcome(
  params: ProcessPaymentV2Params,
  idempotencyKey: string,
): Promise<PaymentRpcOutcome<ProcessPaymentV2Result>> {
  const supabase = getSupabase();
  const { data, error } = await OrderService.processPayment(supabase, params, {
    keyOverride: idempotencyKey,
  });

  if (error) {
    const code = (error as any)?.code;
    const msg = ((error as any)?.message || "").toLowerCase();
    if (code === "DEADLINE_EXCEEDED") {
      return { kind: "verifying", reason: "deadline_exceeded", idempotencyKey };
    }
    if (code === "40001" || msg.includes("idempotency_in_flight")) {
      return {
        kind: "verifying",
        reason: "idempotency_in_flight",
        idempotencyKey,
      };
    }
    captureRpcError("process_payment", error);
    return { kind: "error", error };
  }

  return { kind: "success", data: data as unknown as ProcessPaymentV2Result };
}

// ============================================================================
// PAYMENT FUNCTIONS
// ============================================================================

/**
 * SCENARIO 1: Full Card Payment
 * - Uses card_total from order
 * - No change calculation
 *
 * Wave Cat-B: caller MUST mint `idempotencyKey` (typically via paymentJournal)
 * so retries reuse the same key. Returns PaymentRpcOutcome<T> — caller cannot
 * accidentally retry on 'verifying' (would create a duplicate charge).
 */
export async function payFullCard(
  orderId: string,
  amount: number,
  idempotencyKey: string,
  tipAmount: number = 0,
  terminalResponse?: Record<string, unknown>,
  terminalId?: string,
): Promise<PaymentRpcOutcome<ProcessPaymentV2Result>> {
  return processPaymentOutcome(
    {
      p_order_id: orderId,
      p_payment_method: "card",
      p_amount: amount,
      p_tip_amount: tipAmount,
      p_terminal_response: terminalResponse || null,
      p_terminal_id: terminalId || null,
    } as unknown as ProcessPaymentV2Params,
    idempotencyKey,
  );
}

/**
 * SCENARIO 2: Full Cash Payment
 * - Uses cash_total (discounted price)
 * - Calculates change from amount_tendered
 */
export async function payFullCash(
  orderId: string,
  cashTotal: number,
  amountTendered: number,
  idempotencyKey: string,
  tipAmount: number = 0,
): Promise<PaymentRpcOutcome<ProcessPaymentV2Result>> {
  return processPaymentOutcome(
    {
      p_order_id: orderId,
      p_payment_method: "cash",
      p_amount: cashTotal,
      p_tip_amount: tipAmount,
      p_amount_tendered: amountTendered,
    } as unknown as ProcessPaymentV2Params,
    idempotencyKey,
  );
}

/**
 * SCENARIO 3: Split Payment (by amount)
 * - Each person pays X amount
 * - Can be card or cash
 */
export async function paySplitPortion(
  orderId: string,
  paymentMethod: "card" | "cash",
  amount: number,
  idempotencyKey: string,
  tipAmount: number = 0,
  amountTendered?: number, // For cash
  terminalResponse?: Record<string, unknown>, // For card
  splitCount?: number, // Total number of split portions
  splitPortionIndex?: number, // Which portion this is (1-based)
  terminalId?: string,
): Promise<PaymentRpcOutcome<ProcessPaymentV2Result>> {
  return processPaymentOutcome(
    {
      p_order_id: orderId,
      p_payment_method: paymentMethod,
      p_amount: amount,
      p_tip_amount: tipAmount,
      p_amount_tendered: amountTendered || null,
      p_terminal_response: terminalResponse || null,
      // Split parameters
      p_split_count: splitCount || null,
      p_split_portion_index: splitPortionIndex || null,
      p_terminal_id: terminalId || null,
    } as unknown as ProcessPaymentV2Params,
    idempotencyKey,
  );
}

/**
 * SCENARIO 4: Pay for Specific Items
 * - Select which items and quantities this payment covers
 * - Supports partial quantity payment (e.g., 1 of 3 lattes)
 * - Marks items as paid with specified quantities
 */
export async function payForItems(
  orderId: string,
  itemAllocations: {
    order_item_id: string;
    quantity: number;
    amount?: number;
  }[],
  paymentMethod: "card" | "cash",
  idempotencyKey: string,
  tipAmount: number = 0,
  amountTendered?: number,
  terminalResponse?: Record<string, unknown>,
  terminalId?: string,
): Promise<PaymentRpcOutcome<ProcessPaymentV2Result>> {
  return processPaymentOutcome(
    {
      p_order_id: orderId,
      p_payment_method: paymentMethod,
      p_amount: 0, // Backend calculates from items
      p_tip_amount: tipAmount,
      p_amount_tendered: amountTendered || null,
      p_item_allocations: itemAllocations,
      p_terminal_response: terminalResponse || null,
      p_terminal_id: terminalId || null,
    } as unknown as ProcessPaymentV2Params,
    idempotencyKey,
  );
}

/**
 * SCENARIO 5: Mixed Payment (Card + Cash)
 * - First charge card for X amount
 * - Then pay remaining with cash
 *
 * NOTE: payMixed atomic-multi-payment recovery is deferred to a follow-up wave.
 * Each portion gets its own idempotency key. If the card portion returns
 * `verifying`, the cash portion is NOT attempted — caller must resolve via
 * the recovery flow before retrying.
 */
export async function payMixed(
  orderId: string,
  cardAmount: number,
  cashAmount: number,
  cashTendered: number,
  cardIdempotencyKey: string,
  cashIdempotencyKey: string,
  cardTerminalResponse?: Record<string, unknown>,
  terminalId?: string,
): Promise<{
  cardPayment: PaymentRpcOutcome<ProcessPaymentV2Result>;
  cashPayment: PaymentRpcOutcome<ProcessPaymentV2Result> | null;
}> {
  // 1. Process card portion first
  const cardPayment = await payFullCard(
    orderId,
    cardAmount,
    cardIdempotencyKey,
    0,
    cardTerminalResponse,
    terminalId,
  );

  // 2. If card didn't cleanly succeed, halt — operator must resolve before
  //    cash is attempted (avoids the partial-mixed double-charge variant).
  if (cardPayment.kind !== "success") {
    return { cardPayment, cashPayment: null };
  }

  // 3. Process cash for remaining
  const cashPayment = await payFullCash(
    orderId,
    cashAmount,
    cashTendered,
    cashIdempotencyKey,
    0,
  );

  return { cardPayment, cashPayment };
}

/**
 * Calculate split amounts for N people
 * Handles rounding to ensure exact total coverage
 */
export function calculateEvenSplit(
  total: number,
  splitCount: number,
): { perPerson: number; lastPerson: number } {
  const perPerson = round2(Math.floor((total / splitCount) * 100) / 100);
  const lastPerson = round2(total - perPerson * (splitCount - 1));
  return { perPerson, lastPerson };
}

/**
 * Calculate split amounts for both card and cash pricing
 */
export function calculateEvenSplitDualPrice(
  cardTotal: number,
  cashTotal: number,
  splitCount: number,
): {
  cardPerPerson: number;
  cardLastPerson: number;
  cashPerPerson: number;
  cashLastPerson: number;
} {
  const cardSplit = calculateEvenSplit(cardTotal, splitCount);
  const cashSplit = calculateEvenSplit(cashTotal, splitCount);

  return {
    cardPerPerson: cardSplit.perPerson,
    cardLastPerson: cardSplit.lastPerson,
    cashPerPerson: cashSplit.perPerson,
    cashLastPerson: cashSplit.lastPerson,
  };
}

// ============================================================================
// CASH DRAWER INTEGRATION
// ============================================================================

/**
 * Record cash payment in the cash drawer.
 * Call this after a successful cash payment to track the operation.
 * Records the net amount (amount_charged) — change is implicit.
 * Formula: expected = opening + cash_sales - cash_refunds + pay_ins - pay_outs - cash_drops
 */
export function trackCashPaymentInDrawer(
  paymentResult: ProcessPaymentV2Result,
  orderId: string,
  staffProfileId: string,
): void {
  // Lazy import to avoid circular deps
  const { useCashDrawerStore } = require("@/stores/useCashDrawerStore") as {
    useCashDrawerStore: typeof import("@/stores/useCashDrawerStore").useCashDrawerStore;
  };
  const { recordDrawerOperation } =
    require("@/services/cashDrawerService") as typeof import("@/services/cashDrawerService");

  const store = useCashDrawerStore.getState();
  if (!store.activeSession || !store.drawerId) return;

  const supabase = getSupabase();

  // Record net amount (what stays in the drawer after change)
  if (paymentResult.amount_charged > 0) {
    recordDrawerOperation(supabase, {
      cashDrawerId: store.drawerId,
      sessionId: store.activeSession.id,
      operationType: "cash_sale",
      amount: paymentResult.amount_charged,
      performedBy: staffProfileId,
      orderId,
      paymentId: paymentResult.payment_id,
    });
  }
}

/**
 * Record cash refund in the cash drawer.
 * Call this after a successful cash refund.
 */
export function trackCashRefundInDrawer(
  refundAmount: number,
  orderId: string,
  staffProfileId: string,
  paymentId?: string,
): void {
  const { useCashDrawerStore } = require("@/stores/useCashDrawerStore") as {
    useCashDrawerStore: typeof import("@/stores/useCashDrawerStore").useCashDrawerStore;
  };
  const { recordDrawerOperation } =
    require("@/services/cashDrawerService") as typeof import("@/services/cashDrawerService");

  const store = useCashDrawerStore.getState();
  if (!store.activeSession || !store.drawerId || refundAmount <= 0) return;

  const supabase = getSupabase();

  recordDrawerOperation(supabase, {
    cashDrawerId: store.drawerId,
    sessionId: store.activeSession.id,
    operationType: "cash_refund",
    amount: refundAmount,
    performedBy: staffProfileId,
    orderId,
    paymentId,
  });
}
