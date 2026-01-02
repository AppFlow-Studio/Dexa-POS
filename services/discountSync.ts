import { storage } from "@/lib/storage";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DISCOUNT_STORAGE_KEYS = {
    DISCOUNTS: "pos_discounts",
    MENU_ITEM_DISCOUNTS: "pos_menu_item_discounts",
    DISCOUNTS_LAST_SYNC: "pos_discounts_last_sync",
} as const;

export interface DiscountRecord {
    id: string;
    merchant_id: string;
    name: string;
    description: string | null;
    discount_type: "percentage" | "fixed";
    discount_value: number;
    min_purchase_amount: number | null;
    max_discount_amount: number | null;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    scope: "dine_in" | "takeout" | "both";
    requires_manager_approval: boolean;
    max_uses_per_day: number | null;
    max_uses_per_order: number;
    applicable_days: number[]; // 0=Sunday
    applicable_hours_start: string | null;
    applicable_hours_end: string | null;
    exclude_alcohol: boolean;
    exclude_categories: string[] | null;
    applies_to_categories: string[] | null;
    stackable: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
}

export interface MenuItemDiscountRecord {
    id?: string;
    menu_item_id: string;
    discount_id: string;
    merchant_id: string;
}

export async function syncDiscounts(
    supabase: SupabaseClient,
    merchantId: string
): Promise<{ success: boolean; count: number; error?: string }> {
    try {
        const { data: discounts, error: discountsError } = await supabase
            .from("discounts")
            .select("*")
            .eq("merchant_id", merchantId)
            .eq("is_active", true)
            .order("display_order", { ascending: true });

        if (discountsError) throw discountsError;

        const { data: menuItemDiscounts, error: itemsError } = await supabase
            .from("menu_item_discounts")
            .select("discount_id, menu_item_id, merchant_id")
            .eq("merchant_id", merchantId);

        if (itemsError) throw itemsError;

        storage.set(
            DISCOUNT_STORAGE_KEYS.DISCOUNTS,
            JSON.stringify(discounts || [])
        );
        storage.set(
            DISCOUNT_STORAGE_KEYS.MENU_ITEM_DISCOUNTS,
            JSON.stringify(menuItemDiscounts || [])
        );
        storage.set(
            DISCOUNT_STORAGE_KEYS.DISCOUNTS_LAST_SYNC,
            new Date().toISOString()
        );

        return { success: true, count: discounts?.length || 0 };
    } catch (error: any) {
        console.error("[DiscountSync] Error:", error?.message || error);
        return { success: false, count: 0, error: error?.message || "Sync failed" };
    }
}

export function getLocalDiscounts(): DiscountRecord[] {
    const raw = storage.getString(DISCOUNT_STORAGE_KEYS.DISCOUNTS);
    return raw ? (JSON.parse(raw) as DiscountRecord[]) : [];
}

export function getLocalMenuItemDiscounts(): MenuItemDiscountRecord[] {
    const raw = storage.getString(DISCOUNT_STORAGE_KEYS.MENU_ITEM_DISCOUNTS);
    return raw ? (JSON.parse(raw) as MenuItemDiscountRecord[]) : [];
}

export function getDiscountsLastSync(): string | null {
    return storage.getString(DISCOUNT_STORAGE_KEYS.DISCOUNTS_LAST_SYNC) ?? null;
}

