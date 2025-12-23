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
  p_item_description?: string;
  p_category_name: string;

  // Pre-calculated prices
  p_unit_price: number; // effective_price
  p_cash_price?: number; // effective_cash_price
  p_price_paid?: number; // Real amount paid per item (usually unit_price unless discounted)
  p_use_cash_price?: boolean; // Default true

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
  p_prep_station?: string;
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
