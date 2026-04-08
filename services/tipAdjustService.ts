import { SupabaseClient } from "@supabase/supabase-js";

export interface TipAdjustment {
  payment_id: string; // DB UUID of order_payments row
  new_tip_amount: number;
}

export interface AdjustTipsResult {
  success: boolean;
  order_id: string;
  adjusted_count: number;
  new_order_tip_total: number;
  sync_version?: number;
  error?: string;
}

export async function adjustTips(
  supabase: SupabaseClient,
  orderId: string,
  adjustments: TipAdjustment[],
  staffId?: string,
): Promise<AdjustTipsResult> {
  const { data, error } = await supabase.rpc("adjust_tips", {
    p_order_id: orderId,
    p_adjustments: adjustments,
    p_staff_id: staffId || null,
  });

  if (error) throw error;
  const result = data as AdjustTipsResult;
  if (!result.success) {
    throw new Error(result.error || "Tip adjustment failed in database");
  }
  return result;
}
