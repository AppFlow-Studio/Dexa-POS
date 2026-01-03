// services/orderDiscountService.ts

import { SupabaseClient } from '@supabase/supabase-js';

export type DiscountType = 'percentage' | 'fixed';
export type DiscountSource = 'preset' | 'custom' | 'promo_code';

interface ApplyDiscountParams {
    order_id: string;
    staff_id: string;
    discount_id?: string | null;
    discount_name: string;
    discount_type: DiscountType;
    discount_value: number;
    source?: DiscountSource;
    reason?: string | null;
    applied_to_item_ids?: string[] | null;
    approved_by_staff_id?: string | null;
}

interface VoidDiscountParams {
    order_id: string;
    staff_id: string;
    order_discount_id: string;
    void_reason?: string | null;
}

export interface OrderDiscountRecord {
    id: string;
    discount_id: string | null;
    discount_name: string;
    discount_type: DiscountType;
    discount_value: number;
    source: DiscountSource;
    calculated_amount: number;
    applied_to_item_ids: string[] | null;
    applied_at: string;
    applied_by: string;
    approved_by: string | null;
    reason: string | null;
}

export interface OrderState {
    id: string;
    card_subtotal: number;
    cash_subtotal: number;
    discount_amount: number;
    effective_subtotal: number;
    effective_tax_amount: number;
    effective_total: number;
    card_tax_amount: number;
    cash_tax_amount: number;
    card_total: number;
    cash_total: number;
    amount_due: number;
    cash_amount_due: number;
    amount_paid: number;
}

export interface AffectedItem {
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    cash_price: number;
    discount_amount: number;
    subtotal: number;
    cash_subtotal: number;
    tax_amount: number;
    cash_tax_amount: number;
}

export interface DiscountResult {
    success: boolean;
    error?: string;
    requires_approval?: boolean;
    action?: string;
    order_discount_id?: string;
    calculated_amount?: number;
    discount?: {
        id: string;
        discount_id: string | null;
        discount_name: string;
        discount_type: DiscountType;
        discount_value: number;
        source: DiscountSource;
        calculated_amount: number;
        applied_to_item_ids: string[] | null;
    };
    order?: OrderState;
    affected_items?: AffectedItem[];
    active_discounts?: OrderDiscountRecord[];
}

export class OrderDiscountService {
    /**
     * Apply a discount to an order via the manage_order_discount RPC
     */
    static async applyDiscount(
        client: SupabaseClient,
        params: ApplyDiscountParams
    ): Promise<DiscountResult> {
        console.log('[OrderDiscountService:applyDiscount]', params);

        const { data, error } = await client.rpc('manage_order_discount', {
            p_action: 'apply',
            p_order_id: params.order_id,
            p_staff_id: params.staff_id,
            p_discount_id: params.discount_id ?? null,
            p_discount_name: params.discount_name,
            p_discount_type: params.discount_type,
            p_discount_value: params.discount_value,
            p_source: params.source ?? 'preset',
            p_reason: params.reason ?? null,
            p_applied_to_item_ids: params.applied_to_item_ids ?? null,
            p_approved_by_staff_id: params.approved_by_staff_id ?? null,
        });

        if (error) {
            console.error('[OrderDiscountService:applyDiscount] RPC error:', error);
            return { success: false, error: error.message };
        }

        return data as DiscountResult;
    }

    /**
     * Apply a preset discount (from discounts table)
     */
    static async applyPresetDiscount(
        client: SupabaseClient,
        params: {
            order_id: string;
            staff_id: string;
            discount_id: string;
            discount_name: string;
            discount_type: DiscountType;
            discount_value: number;
            reason?: string;
            applied_to_item_ids?: string[];
            approved_by_staff_id?: string;
        }
    ): Promise<DiscountResult> {
        return this.applyDiscount(client, {
            ...params,
            source: 'preset',
        });
    }

    /**
     * Apply a custom discount (manual entry) - requires manager approval
     */
    static async applyCustomDiscount(
        client: SupabaseClient,
        params: {
            order_id: string;
            staff_id: string;
            discount_name: string;
            discount_type: DiscountType;
            discount_value: number;
            reason?: string;
            applied_to_item_ids?: string[];
            approved_by_staff_id: string; // Required for custom discounts
        }
    ): Promise<DiscountResult> {
        return this.applyDiscount(client, {
            ...params,
            discount_id: null,
            source: 'custom',
        });
    }

    /**
     * Void/remove a discount from an order
     */
    static async voidDiscount(
        client: SupabaseClient,
        params: VoidDiscountParams
    ): Promise<DiscountResult> {
        console.log('[OrderDiscountService:voidDiscount]', params);

        const { data, error } = await client.rpc('manage_order_discount', {
            p_action: 'void',
            p_order_id: params.order_id,
            p_staff_id: params.staff_id,
            p_order_discount_id: params.order_discount_id,
            p_void_reason: params.void_reason ?? null,
        });

        if (error) {
            console.error('[OrderDiscountService:voidDiscount] RPC error:', error);
            return { success: false, error: error.message };
        }

        return data as DiscountResult;
    }

    /**
     * Get all active (non-voided) discounts for an order
     */
    static async getOrderDiscounts(
        client: SupabaseClient,
        orderId: string
    ): Promise<{ data: OrderDiscountRecord[] | null; error: Error | null }> {
        const { data, error } = await client
            .from('order_discounts')
            .select(
                `
        id,
        discount_id,
        discount_name,
        discount_type,
        discount_value,
        source,
        calculated_amount,
        applied_to_item_ids,
        applied_at,
        applied_by_staff_profiles_id,
        approved_by_staff_profiles_id,
        reason
      `
            )
            .eq('order_id', orderId)
            .is('voided_at', null)
            .order('applied_at', { ascending: true });

        if (error) {
            return { data: null, error };
        }

        const formattedData: OrderDiscountRecord[] =
            data?.map((d) => ({
                id: d.id,
                discount_id: d.discount_id,
                discount_name: d.discount_name,
                discount_type: d.discount_type as DiscountType,
                discount_value: d.discount_value,
                source: d.source as DiscountSource,
                calculated_amount: d.calculated_amount,
                applied_to_item_ids: d.applied_to_item_ids,
                applied_at: d.applied_at,
                applied_by: d.applied_by_staff_profiles_id,
                approved_by: d.approved_by_staff_profiles_id,
                reason: d.reason,
            })) ?? [];

        return { data: formattedData, error: null };
    }
}

