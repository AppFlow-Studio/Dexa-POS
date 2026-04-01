// services/loyalty/loyaltyService.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface LoyaltyEarnResult {
  program_name: string;
  program_type: string; // 'points' | 'visits' | 'punch_card'
  earned: number;
  new_balance: number;
  reward_unlocked: boolean;
}

/**
 * Check if a merchant has any active loyalty programs.
 * Used to gate the loyalty prompt after payment.
 */
export async function checkMerchantHasLoyalty(
  merchantId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { count, error } = await supabase
    .from("loyalty_programs")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .eq("is_active", true);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Look up a customer by phone number; create a new record if not found.
 * Phone is normalized to digits-only before lookup.
 */
export async function findOrCreateCustomerByPhone(
  rawPhone: string,
  merchantId: string,
  supabase: SupabaseClient
): Promise<{ id: string; name: string | null; isNew: boolean }> {
  const phone = rawPhone.replace(/\D/g, "");

  const { data: existing, error: findError } = await supabase
    .from("customers")
    .select("id, name")
    .eq("merchant_id", merchantId)
    .eq("phone", phone)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    return { id: existing.id, name: existing.name ?? null, isNew: false };
  }

  const { data: created, error: createError } = await supabase
    .from("customers")
    .insert({
      merchant_id: merchantId,
      phone,
      visits: 0,
      lifetime_spend: 0,
      total_orders: 0,
    })
    .select("id, name")
    .single();

  if (createError) throw createError;
  return { id: created.id, name: created.name ?? null, isNew: true };
}

/**
 * Call loyalty_earn_on_order RPC to process loyalty for the given order.
 * Requires: order.status = 'completed' AND order.customer_id IS NOT NULL.
 */
export async function earnLoyaltyForOrder(
  dbOrderId: string,
  supabase: SupabaseClient
): Promise<LoyaltyEarnResult[]> {
  const { data, error } = await supabase.rpc("loyalty_earn_on_order", {
    p_order_id: dbOrderId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) {
    console.warn("[Loyalty] loyalty_earn_on_order returned non-array:", data);
    return [];
  }
  return (data as LoyaltyEarnResult[]) ?? [];
}
