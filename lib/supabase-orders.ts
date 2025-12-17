// lib/supabase-orders.ts
import { useSupabaseClient } from '@/hooks/useSupabaseClient';
import type {
    AddOrderItemParams,
    CreateOrderParams,
    Order,
    ProcessPaymentParams,
    OrderStatus
} from '@/types/db-order-management-types';

export const OrdersAPI = {
    // Create new order
    createOrder: async (params: CreateOrderParams) => {
        const supabase = useSupabaseClient();
        const { data, error } = await supabase.rpc('create_order', params);
        if (error) throw error;
        return data;
    },

    // Add item to order
    addItem: async (params: AddOrderItemParams) => {
        const supabase = useSupabaseClient();

        const { data, error } = await supabase.rpc('add_order_item', params);
        if (error) throw error;
        return data;
    },

    // Update order status
    updateStatus: async (orderId: string, status: OrderStatus, reason?: string) => {
        const supabase = useSupabaseClient();

        const { data, error } = await supabase.rpc('update_order_status', {
            p_order_id: orderId,
            p_new_status: status,
            p_reason: reason
        });
        if (error) throw error;
        return data;
    },

    // Calculate tax
    calculateTax: async (orderId: string, taxRate: number = 0.0825) => {
        const supabase = useSupabaseClient();

        const { data, error } = await supabase.rpc('calculate_order_tax', {
            p_order_id: orderId,
            p_tax_rate: taxRate
        });
        if (error) throw error;
        return data;
    },

    // Process payment
    processPayment: async (params: ProcessPaymentParams) => {
        const supabase = useSupabaseClient();

        const { data, error } = await supabase.rpc('process_payment', params);
        if (error) throw error;
        return data;
    },

    // Get order details
    getOrderDetails: async (orderId: string) => {
        const supabase = useSupabaseClient();

        const { data, error } = await supabase.rpc('get_order_details', {
            p_order_id: orderId
        });
        if (error) throw error;
        return data;
    },

    // Get orders for location
    getLocationOrders: async (locationId: string, statuses?: OrderStatus[]) => {
        const supabase = useSupabaseClient();

        let query = supabase
            .from('orders')
            .select(`
        *,
        order_items (
          *,
          order_item_modifiers (*)
        ),
        order_payments (*)
      `)
            .eq('location_id', locationId)
            .order('created_at', { ascending: false });

        if (statuses && statuses.length > 0) {
            query = query.in('status', statuses);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as Order[];
    },

    // Void order item
    voidItem: async (orderItemId: string, reason: string) => {
        const supabase = useSupabaseClient();

        const { data, error } = await supabase.rpc('void_order_item', {
            p_order_item_id: orderItemId,
            p_void_reason: reason
        });
        if (error) throw error;
        return data;
    }
};