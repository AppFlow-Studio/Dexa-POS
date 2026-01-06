// types/database.types.ts
export type OrderStatus =
  | "draft"
  | "pending"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled"
  | "refunded"
  | "void";

export type OrderType =
  | "dine_in"
  | "takeout"
  | "delivery"
  | "online"
  | "catering";

export type PaymentMethod =
  | "cash"
  | "card_spinapi"
  | "card_dvpaylite"
  | "card_manual"
  | "gift_card"
  | "house_account"
  | "external";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "authorized"
  | "captured"
  | "failed"
  | "declined"
  | "refunded"
  | "partially_refunded"
  | "void";

export type TerminalType =
  | "dejavoo_spinapi"
  | "dejavoo_p18"
  | "manual"
  | "none";

export interface Order {
  id: string;
  order_number: string;
  display_number: string;
  merchant_id: string;
  location_id: string;
  order_type: OrderType;
  status: OrderStatus;
  customer_name?: string;
  customer_phone?: string;
  table_number?: string;
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  discount_amount: number;
  service_charge: number;
  total_amount: number;
  payment_status: PaymentStatus;
  amount_paid: number;
  amount_due: number;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
  sent_to_kitchen_at?: string;
  completed_at?: string;
  sync_version: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id?: string;
  location_exclusive_item_id?: string;
  item_name: string;
  item_description?: string;
  category_name?: string;
  quantity: number;
  unit_price: number;
  cash_price?: number;
  price_paid: number;
  subtotal: number;
  selected_size_id?: string;
  selected_size_name?: string;
  size_price_modifier: number;
  item_status: string;
  is_voided: boolean;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  modifier_group_id?: string;
  modifier_item_id?: string;
  modifier_group_name: string;
  modifier_name: string;
  price_modifier: number;
  quantity: number;
  total_price: number;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  payment_method: PaymentMethod;
  amount: number;
  tip_amount: number;
  total_amount: number;
  status: PaymentStatus;
  terminal_type: TerminalType;
  terminal_id?: string;
  transaction_id?: string;
  authorization_code?: string;
  card_type?: string;
  card_last_four?: string;
  initiated_at: string;
  captured_at?: string;
}

export interface CreateOrderParams {
  p_merchant_id: string;
  p_location_id: string;
  p_order_type?: OrderType;
  p_table_number?: string;
  p_customer_name?: string;
  p_customer_phone?: string;
  p_special_instructions?: string;
  p_device_id?: string;
  p_created_by_staff_id?: string;
}

export interface AddOrderItemParams {
  p_order_id: string;
  p_menu_item_id?: string;
  p_location_exclusive_item_id?: string;

  // Pre-calculated item information
  p_item_name: string;
  p_category_name: string;

  // Pre-calculated prices
  p_unit_price: number; // Card price (effective price with modifiers)
  p_cash_unit_price?: number; // Cash price (base cash price + modifiers)

  // Quantity
  p_quantity?: number;

  // Size information (pre-calculated)
  p_selected_size_id?: string;
  p_selected_size_name?: string;
  p_size_price_modifier?: number;

  // Instructions
  p_special_instructions?: string;

  // Modifiers (pre-calculated prices)
  p_modifiers?: Array<{
    modifier_group_id: string;
    modifier_item_id: string;
    modifier_group_name: string;
    modifier_name: string;
    price_modifier: number;
    quantity?: number;
  }>;

  // Kitchen/Coursing
  p_course_number?: number;
}

// Result from add_order_item RPC
export interface AddOrderItemResult {
  success: boolean;
  order_item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  cash_price?: number;
  price_paid: number;
  modifier_total: number;
  subtotal: number;
}

export interface ProcessPaymentParams {
  p_order_id: string;
  p_payment_method: PaymentMethod;
  p_amount: number;
  p_tip_amount?: number;
  p_amount_tendered?: number; // For cash: what customer gave
  p_terminal_type?: TerminalType;
  p_terminal_id?: string;
  p_device_id?: string;
  p_transaction_details?: Record<string, any>;
}

export interface ProcessPaymentResult {
  success: boolean;
  payment_id: string;
  payment_method: PaymentMethod;
  amount_applied: number;
  tip_amount: number;
  total_payment: number;
  amount_tendered?: number;
  change_given?: number;
  payment_sequence: number;
  is_split_payment: boolean;
  order_total: number;
  order_amount_paid: number;
  order_amount_due: number;
  order_fully_paid: boolean;
  remaining_balance: number;
}

export interface CalculateSplitPaymentResult {
  success: boolean;
  order_total: number;
  amount_already_paid: number;
  remaining_balance: number;
  split_count: number;
  suggested_splits: Array<{
    split_number: number;
    split_label: string;
    suggested_amount: number;
  }>;
}

export interface CalculateOrderTaxResult {
  success: boolean;
  tax_amount: number;
}

// --- Order Item CRUD Types ---

export interface UpdateOrderItemQuantityResult {
  success: boolean;
  order_item_id: string;
  quantity: number;
  price_paid: number;
  modifier_total: number;
  new_subtotal: number;
}

export interface UpdateOrderItemParams {
  p_order_item_id: string;
  p_quantity?: number;
  p_special_instructions?: string | null;
  p_prep_station?: string;
  p_course_number?: number;
  p_price_override?: number; // Requires manager permission
}

export interface UpdateOrderItemResult {
  success: boolean;
  order_item_id: string;
  updated_fields: Record<string, any>;
  new_subtotal: number;
}

// Note: OrderItemModifier is already defined earlier in this file

export interface ReplaceOrderItemModifiersResult {
  success: boolean;
  order_item_id: string;
  modifiers: OrderItemModifier[];
  new_subtotal: number;
}

export interface DuplicateOrderItemResult {
  success: boolean;
  new_item_id: string;
  original_item_id: string;
  quantity: number;
}

export interface GetOrderItemResult {
  success: boolean;
  order_item_id: string;
  menu_item_id: string;
  item_name: string;
  quantity: number;
  price_paid: number;
  subtotal: number;
  special_instructions?: string;
  modifiers: OrderItemModifier[];
}

// ============================================================================
// PROCESS PAYMENT V2 TYPES (Unified Payment Function)
// ============================================================================

// export interface ProcessPaymentV2Params {
//   p_order_id: string;
//   p_payment_method: 'cash' | 'card';
//   p_amount: number;
//   p_tip_amount?: number;
//   p_amount_tendered?: number;   // Cash only: what customer gave
//   p_item_ids?: string[];        // Per-item payment: which items
//   p_terminal_response?: Record<string, unknown>;
//   p_terminal_id?: string;
//   p_device_id?: string;
//   p_staff_id?: string;
//   p_transaction_details?: Record<string, unknown>;
// }

// export interface ProcessPaymentV2Result {
//   'success': true,
//   'payment_id': string,
//   'payment_method': 'cash' | 'card',
//   'amount_charged': number,
//   'tip_amount': number,
//   'total_collected': number,
//   'change_given': number,
//   'is_cash_priced': boolean,
//   'pricing_mode': 'card' | 'cash',
//   'is_item_payment': boolean,
//   'is_split_payment': boolean,
//   'split_count': number,
//   'split_portion_index': number,
//   'portions_paid': number,
//   'portions_remaining': number,
//   'split_card_portion': number,
//   'split_cash_portion': number,
//   'items_covered': { id: string, quantity: number }[],
//   'items_paid': { id: string, quantity: number }[],
//   'order_amount_paid': number,
//   'order_amount_due': number,
//   'order_fully_paid': boolean,
//   'unpaid_items_count': number,
//   'unpaid_card_total': number,
//   'unpaid_cash_total': number

// }

// types/payment.ts

// ============================================================================
// PROCESS PAYMENT V2 - RPC TYPES
// ============================================================================

/**
 * Item details returned when paying for specific items
 */
export interface PaidItemDetail {
  /** UUID of the order_item that was paid */
  order_item_id: string;
  /** Name of the menu item */
  item_name: string;
  /** Number of units paid in this transaction */
  quantity_paid: number;
  /** Price per unit used (card or cash price depending on payment method) */
  unit_price: number;
  /** Subtotal for this item (quantity_paid × unit_price) */
  subtotal: number;
}

/**
 * Payment method type
 */
// export type PaymentMethod = 'card' | 'cash';

/**
 * Pricing mode - tracks which pricing context is being used
 * - 'card': All payments so far are card
 * - 'cash': All payments so far are cash
 * - 'mixed': Some payments are card, some are cash
 */
export type PricingMode = 'card' | 'cash' | 'mixed';

/**
 * Response from process_payment_v2 RPC function
 */
export interface ProcessPaymentV2Response {
  // ===========================
  // CORE RESULT
  // ===========================
  
  /** Whether the payment was successful */
  success: boolean;
  
  /** UUID of the created order_payment record */
  payment_id: string;
  
  /** Payment method used: 'card' or 'cash' */
  payment_method: PaymentMethod;
  
  /** Amount charged for this payment (excluding tip) */
  amount_charged: number;
  
  /** Tip amount added to this payment */
  tip_amount: number;
  
  /** Total collected: amount_charged + tip_amount */
  total_collected: number;
  
  /** Change to give back (cash only, 0 for card) */
  change_given: number;
  
  /** Whether cash pricing was used for this payment */
  is_cash_priced: boolean;
  
  /** Current pricing mode after this payment */
  pricing_mode: PricingMode;

  // ===========================
  // PAYMENT TYPE FLAGS
  // ===========================
  
  /** True if this was a per-item payment (p_item_allocations was provided) */
  is_item_payment: boolean;
  
  /** True if this was a split evenly payment (p_split_count was provided) */
  is_split_payment: boolean;

  // ===========================
  // SPLIT PAYMENT INFO
  // (Only populated when is_split_payment = true)
  // ===========================
  
  /** Total number of portions the order is split into */
  split_count: number | null;
  
  /** Which portion this payment covers (1-based index) */
  split_portion_index: number | null;
  
  /** Number of portions paid so far (including this one) */
  portions_paid: number;
  
  /** Number of portions still unpaid */
  portions_remaining: number;
  
  /** Per-person amount at card pricing */
  split_card_portion: number | null;
  
  /** Per-person amount at cash pricing */
  split_cash_portion: number | null;

  // ===========================
  // PER-ITEM PAYMENT INFO
  // (Only populated when is_item_payment = true)
  // ===========================
  
  /** 
   * Detailed info about each item paid
   * Array of objects with item details
   * Empty array [] if not an item payment
   */
  items_paid: PaidItemDetail[];
  
  /** 
   * Array of order_item UUIDs that were covered by this payment
   * Empty array if not an item payment
   */
  items_covered: string[];

  // ===========================
  // ORDER STATE AFTER PAYMENT
  // ===========================
  
  /** Total amount paid on this order (sum of all payments) */
  order_amount_paid: number;
  
  /** Amount still due on this order */
  order_amount_due: number;
  
  /** Whether the order is now fully paid */
  order_fully_paid: boolean;
  
  /** Count of items that still have unpaid quantity */
  unpaid_items_count: number;
  
  /** Total card price of all unpaid items (including tax) */
  unpaid_card_total: number;
  
  /** Total cash price of all unpaid items (including tax) */
  unpaid_cash_total: number;
}

// ============================================================================
// REQUEST PARAMS
// ============================================================================

/**
 * Parameters for calling process_payment_v2 RPC
 */
export interface ProcessPaymentV2Params {
  /** Order UUID to process payment for */
  p_order_id: string;
  
  /** Payment method: 'card' or 'cash' */
  p_payment_method: PaymentMethod;
  
  /** Payment amount (required, but may be ignored for split payments) */
  p_amount: number;
  
  /** Tip amount (optional, default 0) */
  p_tip_amount?: number;
  
  /** Amount tendered by customer - cash only (for change calculation) */
  p_amount_tendered?: number | null;
  
  /**
   * Array of item allocations for per-item payment
   * Supports partial quantity payment (e.g., 1 of 3 lattes)
   * Each allocation specifies order_item_id, quantity, and optional amount
   */
  p_item_allocations?: { order_item_id: string; quantity: number; amount?: number }[] | null;
  
  /** Terminal response data for card payments */
  p_terminal_response?: TerminalResponse | null;
  
  /** Terminal ID that processed the payment */
  p_terminal_id?: string | null;
  
  /** Device ID that initiated the payment */
  p_device_id?: string | null;
  
  /** Staff member who processed the payment */
  p_staff_id?: string | null;
  
  /** 
   * Total number of portions for split payment
   * Must be > 1 to trigger split payment logic
   */
  p_split_count?: number | null;
  
  /** 
   * Which portion this payment is for (1-based)
   * Required if p_split_count is provided
   */
  p_split_portion_index?: number | null;
}

/**
 * Terminal response data from card processor
 */
export interface TerminalResponse {
  transaction_id?: string;
  authorization_code?: string;
  card_type?: string;
  card_last_four?: string;
  terminal_type?: string;
  [key: string]: unknown; // Allow additional fields
}

// ============================================================================
// HELPER TYPES FOR UI
// ============================================================================

/**
 * Simplified result for UI consumption
 */
export interface PaymentResult {
  success: boolean;
  paymentId: string;
  method: PaymentMethod;
  amountCharged: number;
  tipAmount: number;
  changeGiven: number;
  orderFullyPaid: boolean;
  amountDue: number;
  pricingMode: PricingMode;
  
  // Split-specific (for UI state management)
  isSplitPayment: boolean;
  portionsPaid: number;
  portionsRemaining: number;
  
  // Per-item specific
  isItemPayment: boolean;
  itemsPaid: PaidItemDetail[];
}

/**
 * Convert RPC response to simplified UI result
 */
export function toPaymentResult(response: ProcessPaymentV2Response): PaymentResult {
  return {
    success: response.success,
    paymentId: response.payment_id,
    method: response.payment_method,
    amountCharged: response.amount_charged,
    tipAmount: response.tip_amount,
    changeGiven: response.change_given,
    orderFullyPaid: response.order_fully_paid,
    amountDue: response.order_amount_due,
    pricingMode: response.pricing_mode,
    isSplitPayment: response.is_split_payment,
    portionsPaid: response.portions_paid,
    portionsRemaining: response.portions_remaining,
    isItemPayment: response.is_item_payment,
    itemsPaid: response.items_paid || [],
  };
}

// ============================================================================
// SUPABASE RPC CALL WRAPPER
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Type-safe wrapper for process_payment_v2 RPC call
 */
export async function processPaymentV2(
  supabase: SupabaseClient,
  params: ProcessPaymentV2Params
): Promise<{ data: ProcessPaymentV2Response | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('process_payment_v3', {
    p_order_id: params.p_order_id,
    p_payment_method: params.p_payment_method,
    p_amount: params.p_amount,
    p_tip_amount: params.p_tip_amount ?? 0,
    p_amount_tendered: params.p_amount_tendered ?? null,
    p_item_allocations: params.p_item_allocations ?? null,
    p_terminal_response: params.p_terminal_response ?? null,
    p_terminal_id: params.p_terminal_id ?? null,
    p_device_id: params.p_device_id ?? null,
    p_staff_id: params.p_staff_id ?? null,
    p_split_count: params.p_split_count ?? null,
    p_split_portion_index: params.p_split_portion_index ?? null,
  });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as ProcessPaymentV2Response, error: null };
}