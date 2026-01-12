/**
 * Order Transformers for Station-Based Order Management
 *
 * Phase 2: Transforms backend order data to local OrderProfile format
 * for remote orders received via broadcast.
 *
 * Phase 2.5: Added modifier transformation for complete item sync.
 */

import type { CartItem, OrderProfile } from "@/lib/types";
import type {
  BroadcastModifierData,
  BroadcastOrderData,
  BroadcastOrderItemData,
} from "@/hooks/realtime/useOrdersRealtime";
import { generateRemoteOrderId } from "./orderIdHelpers";

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
function mapPaymentStatus(
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
function mapOrderType(
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
 * Transform backend broadcast order to local OrderProfile for remote orders.
 *
 * Remote orders are "guests" in the local store - they're visible but not modifiable
 * unless explicitly adopted (taken over from another station).
 *
 * @param backendOrder - Order data from broadcast payload
 * @param sourceStationName - Optional display name of the source station
 * @returns OrderProfile object with remote order flags set
 */
export function transformBroadcastToRemoteOrder(
  backendOrder: BroadcastOrderData,
  sourceStationName?: string | null
): OrderProfile {
  const remoteId = generateRemoteOrderId(backendOrder.id);

  return {
    // Core identifiers
    id: remoteId,
    db_order_id: backendOrder.id,
    order_number: backendOrder.order_number,
    display_number: backendOrder.display_number,

    // Station tracking (Phase 2)
    station_id: backendOrder.station_id,

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

    // === REMOTE ORDER FLAGS (CRITICAL) ===
    _isRemoteOrder: true,
    _isAdopted: false,
    _isTransferred: false,
    _sourceStationId: backendOrder.station_id,
    _sourceStationName: sourceStationName || null,
    _receivedAt: new Date().toISOString(),
    _canModify: false, // Remote orders cannot be modified
  };
}
