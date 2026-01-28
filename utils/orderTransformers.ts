/**
 * Order Transformers for Station-Based Order Management
 *
 * Phase 5: Transforms backend order data to local OrderProfile format.
 * Simplified - no ownership flags, uses db_order_id directly as local ID.
 */

import type {
  BroadcastModifierData,
  BroadcastOrderData,
  BroadcastOrderItemData,
  BroadcastOrderPaymentData,
} from "@/hooks/realtime/useOrdersRealtime";
import type {
  CartItem,
  OrderPaymentItemCoverage,
  OrderProfile,
  OrderProfilePayment,
  OrderRefundItemRecord,
  ReversalRecord,
} from "@/lib/types";

/**
 * Transform broadcast modifiers to CartItem customizations.modifiers format.
 *
 * Modifiers are grouped by their group name (category) to match the CartItem structure:
 * [{ categoryId, categoryName, options: [{ id, name, price }] }]
 *
 * @param modifiers - Array of modifier data from broadcast payload
 * @returns Grouped modifiers in CartItem format, or undefined if empty
 */
function transformBroadcastModifiers(
  modifiers: BroadcastModifierData[] | undefined,
): CartItem["customizations"]["modifiers"] {
  if (!modifiers || modifiers.length === 0) return undefined;

  // Group modifiers by their group name (category)
  const groupedModifiers = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      options: { id: string; name: string; price: number }[];
    }
  >();

  for (const mod of modifiers) {
    const groupKey = mod.modifier_group_name;

    if (!groupedModifiers.has(groupKey)) {
      groupedModifiers.set(groupKey, {
        categoryId: mod.modifier_group_id || groupKey,
        categoryName: mod.modifier_group_name,
        options: [],
      });
    }

    // Add each modifier option to its group
    // Handle quantity > 1 by adding the same option multiple times
    const optionCount = mod.quantity || 1;
    for (let i = 0; i < optionCount; i++) {
      groupedModifiers.get(groupKey)!.options.push({
        id: mod.modifier_item_id || mod.modifier_name,
        name: mod.modifier_name,
        price: mod.price_modifier,
      });
    }
  }

  return Array.from(groupedModifiers.values());
}

/**
 * Transform backend order items to local CartItem format.
 *
 * @param items - Array of order items from broadcast payload
 * @returns Array of CartItem objects for local store
 */
export function transformBroadcastItems(
  items: BroadcastOrderItemData[] | undefined,
): CartItem[] {
  if (!items || items.length === 0) return [];

  return items.map((item) => ({
    // Core identifiers
    id: `remote_item_${item.id}`,
    db_order_item_id: item.id,
    menuItemId: item.menu_item_id || "",

    // Item name (use open_item_name for open items)
    name: item.is_open_item
      ? item.open_item_name || "Open Item"
      : item.item_name,

    // Quantity tracking
    quantity: item.quantity,
    paidQuantity: item.paid_quantity || 0,
    refundedQuantity: item.refunded_quantity || 0,
    refundedAmount: item.refunded_amount || 0,

    // Pricing
    price: item.unit_price,
    unitPrice: item.unit_price,
    cashPrice: item.cash_price,
    originalPrice: item.cash_price,
    subtotal: item.subtotal,
    cashSubtotal: item.cash_subtotal,
    taxAmount: item.tax_amount,
    cashTaxAmount: item.cash_tax_amount,
    taxRate: 0, // Not included in broadcast

    baseCardPrice: item.base_card_price,
    baseCashPrice: item.base_cash_price,

    // Discount distribution
    discount_amount: item.discount_amount || 0,
    discount_cash_amount: item.discount_amount || 0,

    // Status tracking
    item_status: item.item_status as CartItem["item_status"],
    kitchen_status:
      (item.kitchen_status as CartItem["kitchen_status"]) || undefined,
    courseNumber: item.course_number || 1,

    // Item flags
    is_voided: item.is_voided || false,
    is_open_item: item.is_open_item || false,
    open_item_name: item.open_item_name || undefined,
    open_item_price: item.open_item_price || undefined,

    // Category
    category_name: item.category_name || "Uncategorized",

    // Sync status - already synced since from DB
    sync_status: "synced" as const,

    // Customizations - NOW includes modifiers (Phase 2.5)
    customizations: {
      notes: item.special_instructions || undefined,
      modifiers: transformBroadcastModifiers(item.modifiers),
    },
  }));
}

/**
 * Derive item coverage with quantities from covers_items UUIDs and order items.
 *
 * Strategy:
 * 1. If covers_items has UUIDs, find matching items and use paid_quantity
 * 2. If item has paid_quantity > 0 and is in covers_items, use that quantity
 * 3. Fallback: assume quantity of 1 for each covered item
 *
 * @param coversItems - Array of item UUIDs covered by this payment
 * @param orderItems - Order items array to derive quantities from
 * @param isCashPriced - Whether the payment used cash pricing
 * @returns Array of item coverage details
 */
function deriveItemCoverage(
  coversItems: string[],
  orderItems?: BroadcastOrderItemData[],
  isCashPriced?: boolean,
): OrderPaymentItemCoverage[] {
  if (!coversItems || coversItems.length === 0) return [];

  if (!orderItems || orderItems.length === 0) {
    // No items available - return basic coverage with unknown quantities
    return coversItems.map((itemId) => ({
      itemId,
      itemName: "Unknown Item",
      quantity: 1, // Default assumption
      unitPrice: 0,
      subtotal: 0,
    }));
  }

  return coversItems
    .map((itemId) => {
      const item = orderItems.find((oi) => oi.id === itemId);
      if (!item) {
        return {
          itemId,
          itemName: "Unknown Item",
          quantity: 1,
          unitPrice: 0,
          subtotal: 0,
        };
      }

      // Use paid_quantity from item, or fallback to item quantity
      const quantity =
        item.paid_quantity > 0 ? item.paid_quantity : item.quantity;
      const unitPrice = isCashPriced ? item.cash_price : item.unit_price;

      return {
        itemId: item.id,
        itemName: item.item_name,
        quantity,
        unitPrice,
        subtotal: quantity * unitPrice,
      };
    })
    .filter((coverage) => coverage.quantity > 0);
}

/**
 * Transform broadcast payment data to OrderProfile payment format.
 *
 * @param payment - Payment data from broadcast or normalized fetch
 * @param orderItems - Order items array to derive item coverage with quantities
 * @returns OrderProfilePayment for UI consumption
 */
function transformBroadcastPaymentToProfile(
  payment: BroadcastOrderPaymentData,
  orderItems?: BroadcastOrderItemData[],
): OrderProfilePayment {
  // Derive item coverage with quantities from order_items
  const itemsCovered = deriveItemCoverage(
    payment.covers_items,
    orderItems,
    payment.is_cash_priced,
  );

  // Determine PaymentType for UI
  const method = payment.payment_method === "cash" ? "Cash" : "Card";

  // Calculate cash savings if applicable
  const cashSavings =
    payment.is_cash_priced && payment.original_amount
      ? payment.original_amount - payment.amount
      : undefined;

  // Build split info if applicable
  const splitInfo =
    payment.split_count && payment.split_portion_index
      ? {
          portionIndex: payment.split_portion_index,
          totalPortions: payment.split_count,
          isLastPortion: payment.split_portion_index === payment.split_count,
        }
      : undefined;

  // Map status
  const status = ((): OrderProfilePayment["status"] => {
    switch (payment.status) {
      case "voided":
        return "voided";
      case "refunded":
        return "refunded";
      case "captured":
        return "captured";
      default:
        return "pending";
    }
  })();

  return {
    id: `payment_${payment.id}`,
    db_payment_id: payment.id,
    amount: payment.amount,
    method,
    tip_amount: payment.tip_amount,
    total_collected: payment.total_amount,
    cardBrand: payment.card_type ?? undefined,
    last4: payment.card_last_four ?? undefined,
    amountTendered: payment.amount_tendered ?? undefined,
    changeGiven: payment.change_given > 0 ? payment.change_given : undefined,
    isCashPriced: payment.is_cash_priced || undefined,
    cashSavings,
    subtotal_portion: payment.subtotal_portion,
    tax_portion: payment.tax_portion,
    splitInfo,
    itemsCovered,
    status,
    timestamp: payment.captured_at ?? payment.created_at,
    isVoided: payment.is_voided,
    voidReason: payment.void_reason ?? undefined,
    refundedAmount: payment.refunded_amount ?? undefined,
    refundedAt: payment.refunded_at ?? undefined,
    reference_id: payment.reference_id ?? undefined,
    // Return/refund tracking fields
    isReturned: payment.is_returned ?? undefined,
    returnedAt: payment.returned_at ?? undefined,
    returnedBy: payment.returned_by ?? undefined,
    returnAmount: payment.return_amount ?? undefined,
    returnRrn: payment.return_rrn ?? undefined,
    returnAuthCode: payment.return_auth_code ?? undefined,
    returnReferenceId: payment.return_reference_id ?? undefined,
    returnNumber: payment.return_number ?? undefined,
    returnReason: payment.return_reason ?? undefined,
    transactionDetails: payment.payment_method === "card" ? {
      terminalType: payment.terminal_type ?? undefined,
      authorizationCode: payment.authorization_code ?? payment.auth_code ?? undefined,
      cardType: payment.card_type ?? undefined,
      last4: payment.card_last_four ?? undefined,
      transactionId: payment.transaction_id ?? undefined,
      dejavooTransaction: {
        authCode: payment.auth_code ?? payment.authorization_code ?? undefined,
        batchNumber: payment.dejavoo_batch_number ?? payment.batch_number ?? undefined,
        invoiceNumber: payment.dejavoo_invoice_number ?? undefined,
        referenceId: payment.reference_id ?? undefined,
        transactionNumber: payment.transaction_id ?? undefined,
        cardType: payment.card_type ?? undefined,
        cardLast4: payment.card_last_four ?? undefined,
        entryMode: payment.entry_mode ?? undefined,
        rrn: payment.rrn ?? undefined,
        resultCode: payment.result_code ?? undefined,
      } as any,
    } : undefined,
    sync_status: "synced",
  };
}

/**
 * Transform array of broadcast payments to OrderProfile payments.
 *
 * @param payments - Array of payment data from broadcast or normalized fetch
 * @param orderItems - Order items array to derive item coverage with quantities
 * @returns Array of OrderProfilePayment for UI consumption
 */
export function transformBroadcastPaymentsToProfile(
  payments: BroadcastOrderPaymentData[] | undefined,
  orderItems?: BroadcastOrderItemData[],
): OrderProfilePayment[] {
  if (!payments || payments.length === 0) return [];
  return payments.map((p) => transformBroadcastPaymentToProfile(p, orderItems));
}

/**
 * Map backend payment_status to local paid_status format.
 *
 * @param paymentStatus - Backend payment status string
 * @returns Local paid_status string
 */
export function mapPaymentStatus(
  paymentStatus: string | null | undefined,
): OrderProfile["paid_status"] {
  switch (paymentStatus) {
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    case "pending":
      return "Pending";
    default:
      return "Unpaid";
  }
}

/**
 * Map backend order_type to local format.
 *
 * @param orderType - Backend order type string
 * @returns Local order_type string
 */
export function mapOrderType(
  orderType: string | null | undefined,
): OrderProfile["order_type"] {
  switch (orderType) {
    case "dine_in":
      return "Dine In";
    case "takeout":
      return "Takeaway";
    case "delivery":
      return "Delivery";
    default:
      return "Takeaway";
  }
}

/**
 * Transform backend broadcast order to local OrderProfile.
 *
 * Phase 5: Simplified - uses db_order_id directly as local ID,
 * no ownership flags. Any visible order can be modified.
 *
 * @param backendOrder - Order data from broadcast payload
 * @param sourceStationName - Optional display name of the source station (for display)
 * @returns OrderProfile object
 */
export function transformBroadcastToOrder(
  backendOrder: BroadcastOrderData,
  sourceStationName?: string | null,
): OrderProfile {
  // Use db_order_id directly as local ID (no prefix)
  const localId = backendOrder.id;

  return {
    // Core identifiers - use db_order_id as both id and db_order_id
    id: localId,
    db_order_id: backendOrder.id,
    order_number: backendOrder.order_number,
    display_number: backendOrder.display_number,

    // Station tracking (for display purposes)
    station_id: backendOrder.station_id,
    _sourceStationId: backendOrder.station_id,
    _sourceStationName: sourceStationName || null,

    // Order info
    order_type: mapOrderType(backendOrder.order_type),
    order_status: backendOrder.status,
    check_status: backendOrder.check_status || "Opened",
    paid_status: mapPaymentStatus(backendOrder.payment_status),
    service_location_id: backendOrder.table_number,
    // table_number IS the table name (e.g., "T1"), so use it directly for display
    service_location_name: backendOrder.table_number || undefined,
    server_name:
      backendOrder.server_name || backendOrder.assigned_server_id || undefined,
    customer_name: "",

    // Financial - use card pricing as default
    total_amount: backendOrder.card_total || backendOrder.total_amount,
    total_cash_amount:
      backendOrder.cash_total ||
      backendOrder.card_total ||
      backendOrder.total_amount,
    total_tax: backendOrder.card_tax_amount || backendOrder.tax_amount,
    total_discount: backendOrder.discount_amount,
    amount_paid: backendOrder.amount_paid,
    amount_due: backendOrder.amount_due,
    cash_amount_due: backendOrder.cash_amount_due,

    // Items
    items: transformBroadcastItems(backendOrder.order_items),

    // Payments - transform with item context for coverage derivation
    payments: transformBroadcastPaymentsToProfile(
      backendOrder.order_payments,
      backendOrder.order_items,
    ),
    // Cast reversals and refund items to proper types (broadcast returns Record<string, unknown>[])
    reversals: (backendOrder.reversals as unknown as ReversalRecord[]) ?? undefined,
    order_refund_items: (backendOrder.order_refund_items as unknown as OrderRefundItemRecord[]) ?? undefined,

    // Timestamps
    opened_at: backendOrder.created_at,
    sent_to_kitchen_at: backendOrder.sent_to_kitchen_at || undefined,
    closed_at: backendOrder.completed_at || undefined,

    // Sync status - already synced since from DB
    sync_status: "synced",
  };
}

/**
 * @deprecated Use transformBroadcastToOrder instead
 */
export const transformBroadcastToRemoteOrder = transformBroadcastToOrder;

// ============================================================================
// Phase 3: Normalizers for Fetched Orders
// ============================================================================

/**
 * Types for Supabase fetched data (with nested relations)
 */
export interface FetchedOrderData {
  id: string;
  order_number: string;
  display_number: string;
  external_id?: string | null;
  merchant_id: string;
  location_id: string;
  customer_id?: string | null;
  created_by_staff_id?: string | null;
  created_by_user_id?: string | null;
  assigned_server_id?: string | null;
  station_id?: string | null;
  station_name?: string | null;
  check_status?: string | null;
  session_id?: string | null;
  order_type: string;
  status: string;
  table_number?: string | null;
  seat_number?: string | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  tip_amount?: number | null;
  discount_amount?: number | null;
  service_charge?: number | null;
  total_amount?: number | null;
  card_subtotal?: number | null;
  card_tax_amount?: number | null;
  card_total?: number | null;
  cash_subtotal?: number | null;
  cash_tax_amount?: number | null;
  cash_total?: number | null;
  cash_discount_applied?: boolean | null;
  cash_discount_amount?: number | null;
  effective_subtotal?: number | null;
  effective_tax_amount?: number | null;
  effective_total?: number | null;
  payment_pricing_mode?: string | null;
  payment_status?: string | null;
  amount_paid?: number | null;
  amount_due?: number | null;
  cash_amount_due?: number | null;
  created_at: string;
  updated_at: string;
  sent_to_kitchen_at?: string | null;
  started_preparing_at?: string | null;
  ready_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  cancellation_reason?: string | null;
  sync_version?: number | null;
  is_offline?: boolean | null;
  // Nested relations from Supabase
  order_items?: FetchedOrderItem[];
  order_payments?: FetchedOrderPayment[];
  stations?: { station_name: string } | null;
  created_by_staff?: { first_name: string; last_name: string } | null;
}

export interface FetchedOrderItem {
  id: string;
  menu_item_id?: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  cash_price?: number | null;
  subtotal?: number | null;
  cash_subtotal?: number | null;
  tax_amount?: number | null;
  cash_tax_amount?: number | null;
  discount_amount?: number | null;
  item_status?: string | null;
  kitchen_status?: string | null;
  paid_quantity?: number | null;
  refunded_quantity?: number | null;
  refunded_amount?: number | null;
  course_number?: number | null;
  is_voided?: boolean | null;
  is_open_item?: boolean | null;
  open_item_name?: string | null;
  open_item_price?: number | null;
  special_instructions?: string | null;
  category_name?: string | null;
  // Nested modifiers from Supabase
  order_item_modifiers?: FetchedOrderItemModifier[];
  base_card_price: number;
  base_cash_price: number;
}

export interface FetchedOrderItemModifier {
  modifier_group_id?: string | null;
  modifier_item_id?: string | null;
  modifier_group_name: string;
  modifier_name: string;
  price_modifier: number;
  quantity?: number | null;
}

/**
 * Raw payment data from Supabase order_payments table.
 * Maps directly to database column names with null handling.
 */
export interface FetchedOrderPayment {
  // Core identifiers
  id: string;
  order_id: string;

  // Payment basics
  payment_method: string;
  amount: number;
  tip_amount: number | null;
  total_amount: number;
  status: string;

  // Portions (for prorated calculations)
  subtotal_portion: number | null;
  tax_portion: number | null;
  discount_portion: number | null;

  // Cash-specific fields
  amount_tendered: number | null;
  change_given: number | null;
  is_cash_priced: boolean | null;
  cash_discount_applied: boolean | null;
  original_amount: number | null;

  // Split payment tracking
  split_portion_index: number | null;
  split_count: number | null;

  // Item coverage (UUID array)
  covers_items: string[] | null;

  // Terminal/Card details
  terminal_type: string | null;
  terminal_id: string | null;
  card_type: string | null;
  card_last_four: string | null;
  transaction_id: string | null;
  authorization_code: string | null;
  processor_response: Record<string, unknown> | null;
  reference_number: string | null;

  // Dejavoo-specific columns (extracted by process_payment_v6.sql)
  dejavoo_response_code: string | null;
  dejavoo_batch_number: string | null;
  dejavoo_invoice_number: string | null;
  auth_code: string | null;
  rrn: string | null;
  result_code: string | null;
  result_message: string | null;
  batch_number: string | null;

  // Void/Refund tracking
  is_voided: boolean | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  refunded_amount: number | null;
  refunded_at: string | null;

  // Return/refund tracking fields
  is_returned: boolean | null;
  returned_at: string | null;
  returned_by: string | null;
  return_amount: number | null;
  return_rrn: string | null;
  return_auth_code: string | null;
  return_reference_id: string | null;
  return_number: string | null;
  return_reason: string | null;

  // Staff tracking
  processed_by_staff_id: string | null;

  // Timestamps
  initiated_at: string | null;
  captured_at: string | null;
  created_at: string;
  updated_at: string;

  // Metadata
  metadata: Record<string, unknown> | null;
}

/**
 * Normalize fetched modifiers to broadcast format.
 *
 * @param modifiers - Array of modifiers from Supabase fetch
 * @returns Array of BroadcastModifierData for transformer
 */
function normalizeFetchedModifiers(
  modifiers: FetchedOrderItemModifier[] | undefined,
): BroadcastModifierData[] {
  if (!modifiers || modifiers.length === 0) return [];

  return modifiers.map((mod) => ({
    modifier_group_id: mod.modifier_group_id ?? null,
    modifier_item_id: mod.modifier_item_id ?? null,
    modifier_group_name: mod.modifier_group_name,
    modifier_name: mod.modifier_name,
    price_modifier: mod.price_modifier,
    quantity: mod.quantity ?? 1,
  }));
}

/**
 * Normalize fetched order items (with nested modifiers) to broadcast format.
 *
 * @param items - Array of items from Supabase fetch (with order_item_modifiers)
 * @returns Array of BroadcastOrderItemData for transformer
 */
function normalizeFetchedItems(
  items: FetchedOrderItem[] | undefined,
): BroadcastOrderItemData[] {
  if (!items || items.length === 0) return [];

  return items.map((item) => ({
    id: item.id,
    menu_item_id: item.menu_item_id ?? null,
    item_name: item.item_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    cash_price: item.cash_price ?? item.unit_price,
    subtotal: item.subtotal ?? item.unit_price * item.quantity,
    cash_subtotal: item.cash_subtotal ?? item.subtotal ?? 0,
    tax_amount: item.tax_amount ?? 0,
    cash_tax_amount: item.cash_tax_amount ?? 0,
    discount_amount: item.discount_amount ?? 0,
    item_status: item.item_status ?? "pending",
    kitchen_status: item.kitchen_status ?? null,
    paid_quantity: item.paid_quantity ?? 0,
    refunded_quantity: item.refunded_quantity ?? 0,
    refunded_amount: item.refunded_amount ?? 0,
    course_number: item.course_number ?? null,
    is_voided: item.is_voided ?? false,
    is_open_item: item.is_open_item ?? false,
    open_item_name: item.open_item_name ?? null,
    open_item_price: item.open_item_price ?? null,
    special_instructions: item.special_instructions ?? null,
    category_name: item.category_name ?? null,
    // Normalize nested modifiers
    modifiers: normalizeFetchedModifiers(item.order_item_modifiers),
    base_card_price: item.base_card_price,
    base_cash_price: item.base_cash_price,
  }));
}

/**
 * Normalize a single fetched payment to broadcast format.
 *
 * @param payment - Payment data from Supabase fetch
 * @returns BroadcastOrderPaymentData for transformer
 */
function normalizeFetchedPayment(
  payment: FetchedOrderPayment,
): BroadcastOrderPaymentData {
  // Simplify payment_method to 'cash' | 'card'
  const normalizedMethod: "cash" | "card" =
    payment.payment_method === "cash" ? "cash" : "card";

  // Normalize status to simplified enum
  const normalizedStatus = ((): BroadcastOrderPaymentData["status"] => {
    switch (payment.status) {
      case "captured":
        return "captured";
      case "void":
        return "voided";
      case "refunded":
      case "partially_refunded":
        return "refunded";
      case "failed":
      case "declined":
        return "failed";
      default:
        return "pending";
    }
  })();

  return {
    id: payment.id,
    order_id: payment.order_id,
    payment_method: normalizedMethod,
    amount: payment.amount,
    tip_amount: payment.tip_amount ?? 0,
    total_amount: payment.total_amount,
    status: normalizedStatus,
    subtotal_portion: payment.subtotal_portion ?? 0,
    tax_portion: payment.tax_portion ?? 0,
    amount_tendered: payment.amount_tendered,
    change_given: payment.change_given ?? 0,
    is_cash_priced: payment.is_cash_priced ?? false,
    original_amount: payment.original_amount,
    split_portion_index: payment.split_portion_index,
    split_count: payment.split_count,
    covers_items: payment.covers_items ?? [],
    card_type: payment.card_type,
    card_last_four: payment.card_last_four,
    transaction_id: payment.transaction_id,
    terminal_type: payment.terminal_type,
    is_voided: payment.is_voided ?? false,
    void_reason: payment.void_reason,
    refunded_amount: payment.refunded_amount ?? 0,
    refunded_at: payment.refunded_at,
    captured_at: payment.captured_at,
    created_at: payment.created_at,
    reference_id: payment.reference_number ?? null,
    authorization_code: payment.authorization_code ?? null,
    auth_code: payment.auth_code ?? null,
    rrn: payment.rrn ?? (payment.processor_response as any)?.dejavoo_transaction?.rrn ?? null,
    batch_number: payment.batch_number ?? null,
    dejavoo_batch_number: payment.dejavoo_batch_number ?? null,
    dejavoo_invoice_number: payment.dejavoo_invoice_number ?? null,
    entry_mode: (payment.processor_response as any)?.dejavoo_transaction?.entryMode ?? null,
    result_code: payment.result_code ?? null,
    // Return/refund tracking fields
    is_returned: payment.is_returned ?? false,
    returned_at: payment.returned_at,
    returned_by: payment.returned_by,
    return_amount: payment.return_amount ?? 0,
    return_rrn: payment.return_rrn,
    return_auth_code: payment.return_auth_code,
    return_reference_id: payment.return_reference_id,
    return_number: payment.return_number,
    return_reason: payment.return_reason,
  };
}

/**
 * Normalize array of fetched payments to broadcast format.
 *
 * @param payments - Array of payments from Supabase fetch
 * @returns Array of BroadcastOrderPaymentData for transformer
 */
function normalizeFetchedPayments(
  payments: FetchedOrderPayment[] | undefined,
): BroadcastOrderPaymentData[] {
  if (!payments || payments.length === 0) return [];
  return payments.map(normalizeFetchedPayment);
}

/**
 * Normalize Supabase fetched order to BroadcastOrderData format.
 *
 * This allows reusing transformBroadcastToRemoteOrder and transformBroadcastItems
 * for both broadcast payloads and direct Supabase fetches.
 *
 * @param fetchedOrder - Order data from Supabase query (with nested relations)
 * @returns BroadcastOrderData that can be passed to existing transformers
 */
export function normalizeFetchedOrder(
  fetchedOrder: FetchedOrderData,
): BroadcastOrderData {
  return {
    // Identifiers
    id: fetchedOrder.id,
    order_number: fetchedOrder.order_number,
    display_number: fetchedOrder.display_number,
    external_id: fetchedOrder.external_id ?? null,
    // Relationships
    merchant_id: fetchedOrder.merchant_id,
    location_id: fetchedOrder.location_id,
    customer_id: fetchedOrder.customer_id ?? null,
    created_by_staff_id: fetchedOrder.created_by_staff_id ?? null,
    created_by_user_id: fetchedOrder.created_by_user_id ?? null,
    assigned_server_id: fetchedOrder.assigned_server_id ?? null,

    // Station tracking
    station_id: fetchedOrder.station_id ?? null,

    // Order info
    order_type: fetchedOrder.order_type as BroadcastOrderData["order_type"],
    status: fetchedOrder.status as BroadcastOrderData["status"],
    table_number: fetchedOrder.table_number ?? null,
    seat_number: fetchedOrder.seat_number ?? null,

    // Financial - map all pricing fields with defaults
    subtotal: fetchedOrder.subtotal ?? 0,
    tax_amount: fetchedOrder.tax_amount ?? 0,
    tip_amount: fetchedOrder.tip_amount ?? 0,
    discount_amount: fetchedOrder.discount_amount ?? 0,
    service_charge: fetchedOrder.service_charge ?? 0,
    total_amount: fetchedOrder.total_amount ?? 0,
    card_subtotal: fetchedOrder.card_subtotal ?? 0,
    card_tax_amount: fetchedOrder.card_tax_amount ?? 0,
    card_total: fetchedOrder.card_total ?? 0,
    cash_subtotal: fetchedOrder.cash_subtotal ?? 0,
    cash_tax_amount: fetchedOrder.cash_tax_amount ?? 0,
    cash_total: fetchedOrder.cash_total ?? 0,
    cash_discount_applied: fetchedOrder.cash_discount_applied ?? false,
    cash_discount_amount: fetchedOrder.cash_discount_amount ?? 0,
    effective_subtotal: fetchedOrder.effective_subtotal ?? 0,
    effective_tax_amount: fetchedOrder.effective_tax_amount ?? 0,
    effective_total: fetchedOrder.effective_total ?? 0,
    payment_pricing_mode:
      (fetchedOrder.payment_pricing_mode as BroadcastOrderData["payment_pricing_mode"]) ??
      null,
    payment_status:
      (fetchedOrder.payment_status as BroadcastOrderData["payment_status"]) ??
      "pending",
    amount_paid: fetchedOrder.amount_paid ?? 0,
    amount_due: fetchedOrder.amount_due ?? 0,
    cash_amount_due: fetchedOrder.cash_amount_due ?? 0,

    // Timestamps
    created_at: fetchedOrder.created_at,
    updated_at: fetchedOrder.updated_at,
    sent_to_kitchen_at: fetchedOrder.sent_to_kitchen_at ?? null,
    started_preparing_at: fetchedOrder.started_preparing_at ?? null,
    ready_at: fetchedOrder.ready_at ?? null,
    completed_at: fetchedOrder.completed_at ?? null,
    cancelled_at: fetchedOrder.cancelled_at ?? null,
    voided_at: fetchedOrder.voided_at ?? null,

    // Void info
    voided_by: fetchedOrder.voided_by ?? null,
    void_reason: fetchedOrder.void_reason ?? null,
    cancellation_reason: fetchedOrder.cancellation_reason ?? null,

    // Sync
    sync_version: fetchedOrder.sync_version ?? 1,
    is_offline: fetchedOrder.is_offline ?? false,

    // Normalize nested order_items
    order_items: normalizeFetchedItems(fetchedOrder.order_items),

    // Normalize nested order_payments
    order_payments: normalizeFetchedPayments(fetchedOrder.order_payments),

    session_id: fetchedOrder.session_id ?? null,
    station_name:
      fetchedOrder.stations?.station_name ?? fetchedOrder.station_name ?? null,
    check_status:
      (fetchedOrder.check_status as "Opened" | "Closed" | null) ?? "Opened",
    server_name: fetchedOrder.created_by_staff
      ? `${fetchedOrder.created_by_staff.first_name || ""} ${
          fetchedOrder.created_by_staff.last_name || ""
        }`.trim()
      : null,
  };
}
