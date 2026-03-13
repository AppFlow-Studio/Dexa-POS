// services/paymentService.ts

import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";

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

// ============================================================================
// PAYMENT FUNCTIONS
// ============================================================================

/**
 * SCENARIO 1: Full Card Payment
 * - Uses card_total from order
 * - No change calculation
 */
export async function payFullCard(
  orderId: string,
  amount: number,
  tipAmount: number = 0,
  terminalResponse?: Record<string, unknown>,
): Promise<ProcessPaymentV2Result> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("process_payment_v7", {
    p_order_id: orderId,
    p_payment_method: "card",
    p_amount: amount,
    p_tip_amount: tipAmount,
    p_terminal_response: terminalResponse || null,
  });

  if (error) throw error;
  return data as ProcessPaymentV2Result;
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
  tipAmount: number = 0,
): Promise<ProcessPaymentV2Result> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("process_payment_v7", {
    p_order_id: orderId,
    p_payment_method: "cash",
    p_amount: cashTotal,
    p_tip_amount: tipAmount,
    p_amount_tendered: amountTendered,
  });

  if (error) throw error;
  return data as ProcessPaymentV2Result;
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
  tipAmount: number = 0,
  amountTendered?: number, // For cash
  terminalResponse?: Record<string, unknown>, // For card
  splitCount?: number, // Total number of split portions
  splitPortionIndex?: number, // Which portion this is (1-based)
): Promise<ProcessPaymentV2Result> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("process_payment_v7", {
    p_order_id: orderId,
    p_payment_method: paymentMethod,
    p_amount: amount,
    p_tip_amount: tipAmount,
    p_amount_tendered: amountTendered || null,
    p_terminal_response: terminalResponse || null,
    // Split parameters
    p_split_count: splitCount || null,
    p_split_portion_index: splitPortionIndex || null,
  });

  if (error) throw error;
  return data as ProcessPaymentV2Result;
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
  tipAmount: number = 0,
  amountTendered?: number,
  terminalResponse?: Record<string, unknown>,
): Promise<ProcessPaymentV2Result> {
  const supabase = getSupabase();
  // Backend calculates amount from items and their quantities
  const { data, error } = await supabase.rpc("process_payment_v7", {
    p_order_id: orderId,
    p_payment_method: paymentMethod,
    p_amount: 0, // Backend calculates from items
    p_tip_amount: tipAmount,
    p_amount_tendered: amountTendered || null,
    p_item_allocations: itemAllocations,
    p_terminal_response: terminalResponse || null,
  });

  if (error) throw error;
  return data as ProcessPaymentV2Result;
}

/**
 * SCENARIO 5: Mixed Payment (Card + Cash)
 * - First charge card for X amount
 * - Then pay remaining with cash
 */
export async function payMixed(
  orderId: string,
  cardAmount: number,
  cashAmount: number,
  cashTendered: number,
  cardTerminalResponse?: Record<string, unknown>,
): Promise<{
  cardPayment: ProcessPaymentV2Result;
  cashPayment: ProcessPaymentV2Result;
}> {
  // 1. Process card portion first
  const cardPayment = await payFullCard(
    orderId,
    cardAmount,
    0,
    cardTerminalResponse,
  );

  // 2. Process cash for remaining
  const cashPayment = await payFullCash(orderId, cashAmount, cashTendered, 0);

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
  const perPerson = Math.floor((total / splitCount) * 100) / 100;
  const lastPerson =
    Math.round((total - perPerson * (splitCount - 1)) * 100) / 100;
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
