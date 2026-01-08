import {
  AddOrderItemParams,
  AddOrderItemResult,
  CalculateOrderTaxResult,
  CalculateSplitPaymentResult,
  CreateOrderParams,
  DuplicateOrderItemResult,
  GetOrderItemResult,
  Order,
  OrderItemModifier,
  OrderStatus,
  ProcessPaymentResult,
  ProcessPaymentV2Params,
  ReplaceOrderItemModifiersResult,
  UpdateOrderItemParams,
  UpdateOrderItemQuantityResult,
  UpdateOrderItemResult
} from "@/types/db-order-management-types";
import { SupabaseClient } from "@supabase/supabase-js";

export type AddOpenItemParams = {
  p_order_id: string;
  p_item_name: string;
  p_unit_price: number;
  p_quantity?: number;
  p_special_instructions?: string | null;
  p_is_tax_exempt?: boolean | null;
};

export type AddOpenItemResult = {
  success: boolean;
  order_item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  cash_price: number;
  subtotal: number;
  cash_subtotal: number;
  tax_rate: number;
  tax_amount: number;
  cash_tax_amount: number;
};

export type UpdateOpenItemParams = {
  p_order_item_id: string;
  p_quantity?: number | null;
  p_unit_price?: number | null;
  p_special_instructions?: string | null;
};

export type UpdateOpenItemResult = {
  success: boolean;
  order_item_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export class OrderService {
  /**
   * Create a new order
   */
  static async createOrder(
    client: SupabaseClient,
    params: CreateOrderParams
  ): Promise<{ data: Order | null; error: any }> {
    console.log(`[OrderService:createOrder] ====== CREATING ORDER ======`);
    console.log(`[OrderService:createOrder] Params:`, JSON.stringify(params, null, 2));

    const { data, error } = await client.rpc("create_order", params);

    if (error) {
      console.error(`[OrderService:createOrder] FAILED:`, error);
    } else {
      const orderData = Array.isArray(data) ? data[0] : data;
      console.log(`[OrderService:createOrder] SUCCESS!`);
      console.log(`[OrderService:createOrder] Order ID: ${orderData?.order_id || orderData?.id}`);
      console.log(`[OrderService:createOrder] Order Number: ${orderData?.order_number || orderData?.display_number}`);
    }

    return { data, error };
  }

  /**
   * Add an open item to an order via RPC add_open_item_v2
   */
  static async addOpenItem(
    client: SupabaseClient,
    params: AddOpenItemParams
  ): Promise<{ data: AddOpenItemResult | null; error: any }> {
    console.log(`[OrderService:addOpenItem] ====== ADDING OPEN ITEM ======`, params);
    const { data, error } = await client.rpc("add_open_item_v2", params);
    if (error || !data) {
      console.error(`[OrderService:addOpenItem] FAILED:`, error);
      return { data: data as any, error };
    }
    console.log(`[OrderService:addOpenItem] SUCCESS! order_item_id: ${data.order_item_id}`);
    return { data: data as AddOpenItemResult, error };
  }

  /**
   * Update an open item (price/qty/instructions) via RPC update_order_item_v2
   */
  static async updateOpenItem(
    client: SupabaseClient,
    params: UpdateOpenItemParams
  ): Promise<{ data: UpdateOpenItemResult | null; error: any }> {
    
    const { data, error } = await client.rpc("update_order_item_v2", params);
    if (error) {
      console.error(`[OrderService:updateOpenItem] FAILED:`, error);
    }
    return { data: data as UpdateOpenItemResult, error };
  }

  /**
   * Add an order-level discount (order_discounts insert)
   */
  static async addOrderDiscount(
    client: SupabaseClient,
    params: {
      order_id: string;
      discount_id: string | null;
      discount_type: "percentage" | "fixed";
      discount_value: number;
      source: "preset" | "custom" | "promo_code";
      calculated_amount: number;
      pre_discount_subtotal: number;
      applied_by_staff_profiles_id: string | null;
      approved_by_staff_profiles_id?: string | null;
      applied_at: string;
      applied_to_item_ids?: string[] | null;
    }
  ): Promise<{ data: any; error: any }> {
    console.log(`[OrderService:addOrderDiscount] order_id:`, params.order_id);
    console.log(client)
    console.log(`[OrderService:addOrderDiscount] ====== ADDING ORDER DISCOUNT `,params);
   
    const { data, error } = await client
      .from("order_discounts")
      .insert({
        order_id: params.order_id,
        discount_id: params.discount_id,
        discount_type: params.discount_type,
        discount_value: params.discount_value,
        source: params.source,
        calculated_amount: params.calculated_amount,
        pre_discount_subtotal: params.pre_discount_subtotal,
        applied_by_staff_profiles_id: params.applied_by_staff_profiles_id,
        approved_by_staff_profiles_id: params.approved_by_staff_profiles_id ?? null,
        applied_at: params.applied_at,
        applied_to_item_ids: params.applied_to_item_ids ?? null,
      })
      .select()
      .single();
    return { data, error };
  }

  /**
   * Add an item to an order
   */
  static async addOrderItem(
    client: SupabaseClient,
    params: AddOrderItemParams
  ): Promise<{ data: AddOrderItemResult | null; error: any }> {
    console.log(`[OrderService:addOrderItem] ====== ADDING ITEM ======`);
    // console.log(`[OrderService:addOrderItem] Order: ${params.p_order_id}`);
    // console.log(`[OrderService:addOrderItem] Item: ${params.p_item_name}`);
    // console.log(`[OrderService:addOrderItem] Qty: ${params.p_quantity}, Price: ${params.p_unit_price}`);
    // console.log(`[OrderService:addOrderItem] ADD_ORDER_ITEM_V2:`, params);
    const { data, error } = await client.rpc("add_order_item_v2", params);

    if (error || !data) {
      console.error(`[OrderService:addOrderItem] FAILED:`, error);
      return { data, error };
    }

    // console.log(`[OrderService:addOrderItem] SUCCESS!`);
    // console.log(`[OrderService:addOrderItem] Item ID: ${data.order_item_id}`);

    return { data, error };
  }

  /**
   * Update the status of an order
   */
  static async updateOrderStatus(
    client: SupabaseClient,
    orderId: string,
    newStatus: OrderStatus,
    reason?: string
  ): Promise<{ data: Order | null; error: any }> {
    const { data, error } = await client.rpc("update_order_status", {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_reason: reason,
    });
    return { data, error };
  }

  /**
   * Calculate tax for an order
   */
  static async calculateOrderTax(
    client: SupabaseClient,
    orderId: string
  ): Promise<{ data: CalculateOrderTaxResult | null; error: any }> {
    const { data, error } = await client.rpc("calculate_order_tax", {
      p_order_id: orderId,
    });
    return { data, error };
  }

  /**
   * Process a payment for an order using process_payment_v2
   * Handles: Full card, Full cash, Split, Per-item payments
   */
  static async processPayment(
    client: SupabaseClient,
    params: ProcessPaymentV2Params
  ): Promise<{ data: ProcessPaymentResult | null; error: any }> {
    console.log(`[OrderService:processPayment] ====== CALLING process_payment_v2 ======`);
    console.log(`[OrderService:processPayment] Order: ${params.p_order_id}`);
    console.log(`[OrderService:processPayment] Method: ${params.p_payment_method}, Amount: ${params.p_amount}`);

    const { data, error } = await client.rpc("process_payment_v5", params);

    if (error) {
      console.error(`[OrderService:processPayment] FAILED:`, error);
    } else {
      console.log(`[OrderService:processPayment] SUCCESS:`, JSON.stringify(data, null, 2));
    }

    return { data, error };
  }

  /**
   * Void an item in an order
   */
  static async voidOrderItem(
    client: SupabaseClient,
    orderItemId: string,
    reason: string
  ): Promise<{ data: boolean | null; error: any }> {
    const { data, error } = await client.rpc("void_order_item", {
      p_order_item_id: orderItemId,
      p_void_reason: reason,
    });
    return { data, error };
  }

  /**
   * Void a payment (for split payment adjustments or cancellations)
   */
  static async voidPayment(
    client: SupabaseClient,
    paymentId: string,
    reason: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc("void_payment", {
      p_payment_id: paymentId,
      p_void_reason: reason,
    });
    return { data, error };
  }

  /**
   * Void an entire order (soft delete - keeps audit trail)
   */
  static async voidOrder(
    client: SupabaseClient,
    orderId: string,
    voidReason?: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc("void_order", {
      p_order_id: orderId,
      p_void_reason: voidReason || "Order cancelled",
    });
    return { data, error };
  }

  /**
   * Calculate suggested split amounts for an order
   */
  static async calculateSplitPayment(
    client: SupabaseClient,
    orderId: string,
    splitCount: number
  ): Promise<{ data: CalculateSplitPaymentResult | null; error: any }> {
    const { data, error } = await client.rpc("calculate_split_payment", {
      p_order_id: orderId,
      p_split_count: splitCount,
    });
    return { data, error };
  }

  /**
   * Get orders for a location
   */
  static async getOrders(
    client: SupabaseClient,
    locationId: string,
    statuses?: OrderStatus[]
  ): Promise<{ data: Order[] | null; error: any }> {
    let query = client
      .from("orders")
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        )
      `
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });

    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses);
    }

    const { data, error } = await query;
    return { data: data as Order[], error };
  }

  /**
   * Fetch a single order by ID with all relations
   */
  static async fetchOrderById(
    client: SupabaseClient,
    orderId: string
  ): Promise<{ data: Order | null; error: any }> {
    const { data, error } = await client
      .from("orders")
      .select(
        `
        *,
        order_items (
          *,
          order_item_modifiers (*)
        )
      `
      )
      .eq("id", orderId)
      .single();

    return { data: data as Order, error };
  }

  // --- Order Item CRUD Methods ---

  /**
   * Update quantity of an order item (auto-recalculates subtotal)
   */
  static async updateOrderItemQuantity(
    client: SupabaseClient,
    orderItemId: string,
    quantity: number
  ): Promise<{ data: UpdateOrderItemQuantityResult | null; error: any }> {
    const { data, error } = await client.rpc("update_order_item_quantity", {
      p_order_item_id: orderItemId,
      p_quantity: quantity,
    });
    return { data, error };
  }

  /**
   * Update order item fields (instructions, station, price override, etc.)
   */
  static async updateOrderItem(
    client: SupabaseClient,
    params: UpdateOrderItemParams
  ): Promise<{ data: UpdateOrderItemResult | null; error: any }> {
    const { data, error } = await client.rpc("update_order_item_v2", params);
    return { data, error };
  }

  /**
   * Atomically replace all modifiers on an order item
   */
  static async replaceOrderItemModifiers(
    client: SupabaseClient,
    orderItemId: string,
    modifiers: OrderItemModifier[]
  ): Promise<{ data: ReplaceOrderItemModifiersResult | null; error: any }> {
    const { data, error } = await client.rpc("replace_order_item_modifiers", {
      p_order_item_id: orderItemId,
      p_modifiers: modifiers,
    });
    return { data, error };
  }

  /**
   * Add a single modifier to an order item
   */
  static async addOrderItemModifier(
    client: SupabaseClient,
    orderItemId: string,
    modifier: Omit<OrderItemModifier, "id" | "order_item_id" | "total_price">
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc("add_order_item_modifier", {
      p_order_item_id: orderItemId,
      p_modifier_group_id: modifier.modifier_group_id,
      p_modifier_item_id: modifier.modifier_item_id,
      p_modifier_group_name: modifier.modifier_group_name,
      p_modifier_name: modifier.modifier_name,
      p_price_modifier: modifier.price_modifier,
      p_quantity: modifier.quantity,
    });
    return { data, error };
  }

  /**
   * Remove a single modifier from an order item
   */
  static async removeOrderItemModifier(
    client: SupabaseClient,
    modifierId: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc("remove_order_item_modifier", {
      p_modifier_id: modifierId,
    });
    return { data, error };
  }

  /**
   * Get order item with full details and modifiers
   */
  static async getOrderItem(
    client: SupabaseClient,
    orderItemId: string
  ): Promise<{ data: GetOrderItemResult | null; error: any }> {
    const { data, error } = await client.rpc("get_order_item", {
      p_order_item_id: orderItemId,
    });
    return { data, error };
  }

  /**
   * Duplicate an order item (copies modifiers too)
   */
  static async duplicateOrderItem(
    client: SupabaseClient,
    orderItemId: string,
    quantity?: number
  ): Promise<{ data: DuplicateOrderItemResult | null; error: any }> {
    const { data, error } = await client.rpc("duplicate_order_item", {
      p_order_item_id: orderItemId,
      p_quantity: quantity,
    });
    return { data, error };
  }

  // --- Remove & Void Operations ---

  /**
   * Remove an order item (hard delete - for draft/pending orders only)
   */
  static async removeOrderItem(
    client: SupabaseClient,
    orderItemId: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc("remove_order_item", {
      p_order_item_id: orderItemId,
    });
    return { data, error };
  }

  /**
   * Remove multiple order items in batch (hard delete - for draft/pending orders only)
   */
  static async removeOrderItemsBatch(
    client: SupabaseClient,
    orderItemIds: string[]
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc("remove_order_items_batch", {
      p_order_item_ids: orderItemIds,
    });
    return { data, error };
  }

  /**
   * Clear all items from an order (hard delete - for draft/pending orders only)
   */
  static async clearOrderItems(
    client: SupabaseClient,
    orderId: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc("clear_order_items", {
      p_order_id: orderId,
    });
    return { data, error };
  }

  /**
   * Cancel an order (hard delete for draft/pending, void for confirmed)
   */
  static async cancelOrder(
    client: SupabaseClient,
    orderId: string,
    cancelReason?: string
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client.rpc("cancel_order", {
      p_order_id: orderId,
      p_cancel_reason: cancelReason || "Customer cancelled",
    });
    return { data, error };
  }

  // --- Kitchen Status Operations ---

  /**
   * Bulk update order item statuses (for Send to Kitchen / Fire Course)
   * Automatically handles sent_to_kitchen_at and updated_at timestamps
   */
  static async bulkUpdateOrderItemStatus(
    client: SupabaseClient,
    orderItemIds: string[],
    status: "sent" | "preparing" | "ready" | "served"
  ): Promise<{ data: any; error: any }> {
    if (orderItemIds.length === 0) {
      return { data: null, error: null };
    }
    const { data, error } = await client.rpc("bulk_update_order_item_status", {
      p_order_item_ids: orderItemIds,
      p_status: status,
    });
    return { data, error };
  }
}
