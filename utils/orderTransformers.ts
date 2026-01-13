/**
 * Order Transformers for Station-Based Order Management
 *
 * Phase 5: Transforms backend order data to local OrderProfile format.
 * Simplified - no ownership flags, uses db_order_id directly as local ID.
 */

import type { CartItem, OrderProfile } from "@/lib/types";
import type {
  BroadcastModifierData,
  BroadcastOrderData,
  BroadcastOrderItemData,
} from "@/hooks/realtime/useOrdersRealtime";

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
  modifiers: BroadcastModifierData[] | undefined
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
  items: BroadcastOrderItemData[] | undefined
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

    // Discount distribution
    discount_amount: item.discount_amount || 0,
    discount_cash_amount: item.discount_amount || 0,

    // Status tracking
    item_status: item.item_status as CartItem["item_status"],
    kitchen_status: (item.kitchen_status as CartItem["kitchen_status"]) || undefined,
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
 * Map backend payment_status to local paid_status format.
 *
 * @param paymentStatus - Backend payment status string
 * @returns Local paid_status string
 */
export function mapPaymentStatus(
  paymentStatus: string | null | undefined
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
  orderType: string | null | undefined
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
  sourceStationName?: string | null
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
    check_status: backendOrder.amount_due <= 0.01 ? "Closed" : "Opened",
    paid_status: mapPaymentStatus(backendOrder.payment_status),
    service_location_id: backendOrder.table_number,
    customer_name: "",

    // Financial - use card pricing as default
    total_amount: backendOrder.card_total || backendOrder.total_amount,
    total_tax: backendOrder.card_tax_amount || backendOrder.tax_amount,
    total_discount: backendOrder.discount_amount,
    amount_paid: backendOrder.amount_paid,
    amount_due: backendOrder.amount_due,
    cash_amount_due: backendOrder.cash_amount_due,

    // Items
    items: transformBroadcastItems(backendOrder.order_items),

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
  stations?: { name: string } | null;
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
  course_number?: number | null;
  is_voided?: boolean | null;
  is_open_item?: boolean | null;
  open_item_name?: string | null;
  open_item_price?: number | null;
  special_instructions?: string | null;
  category_name?: string | null;
  // Nested modifiers from Supabase
  order_item_modifiers?: FetchedOrderItemModifier[];
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
 * Normalize fetched modifiers to broadcast format.
 *
 * @param modifiers - Array of modifiers from Supabase fetch
 * @returns Array of BroadcastModifierData for transformer
 */
function normalizeFetchedModifiers(
  modifiers: FetchedOrderItemModifier[] | undefined
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
  items: FetchedOrderItem[] | undefined
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
    course_number: item.course_number ?? null,
    is_voided: item.is_voided ?? false,
    is_open_item: item.is_open_item ?? false,
    open_item_name: item.open_item_name ?? null,
    open_item_price: item.open_item_price ?? null,
    special_instructions: item.special_instructions ?? null,
    category_name: item.category_name ?? null,
    // Normalize nested modifiers
    modifiers: normalizeFetchedModifiers(item.order_item_modifiers),
  }));
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
  fetchedOrder: FetchedOrderData
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
  };
}
