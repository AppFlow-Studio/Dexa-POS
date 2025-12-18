import {
  AddOrderItemParams,
  CalculateOrderTaxResult,
  CalculateSplitPaymentResult,
  CreateOrderParams,
  Order,
  OrderItem,
  OrderStatus,
  ProcessPaymentParams,
  ProcessPaymentResult,
} from "@/types/db-order-management-types";
import { SupabaseClient } from "@supabase/supabase-js";

export class OrderService {
  /**
   * Create a new order
   */
  static async createOrder(
    client: SupabaseClient,
    params: CreateOrderParams
  ): Promise<{ data: Order | null; error: any }> {
    const { data, error } = await client.rpc("create_order", params);
    return { data, error };
  }

  /**
   * Add an item to an order
   */
  static async addOrderItem(
    client: SupabaseClient,
    params: AddOrderItemParams
  ): Promise<{ data: OrderItem | null; error: any }> {
    const { data, error } = await client.rpc("add_order_item", params);
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
   * Calculate tax for an order
   */
  static async calculateOrderTax(
    client: SupabaseClient,
    orderId: string,
    taxRate: number
  ): Promise<{ data: CalculateOrderTaxResult | null; error: any }> {
    const { data, error } = await client.rpc("calculate_order_tax", {
      p_order_id: orderId,
      p_tax_rate: taxRate,
    });
    return { data, error };
  }

  /**
   * Process a payment for an order
   */
  static async processPayment(
    client: SupabaseClient,
    params: ProcessPaymentParams
  ): Promise<{ data: ProcessPaymentResult | null; error: any }> {
    const { data, error } = await client.rpc("process_payment", params);
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
}
