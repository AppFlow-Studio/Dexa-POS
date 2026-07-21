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
  // adjust_tips_v2: recomputes tip_fee from tip_surcharge_percentage_snapshot
  // and preserves original_tip_fee on first adjustment. Pre-v10 rows have
  // snapshot=0 so the recompute is a no-op for historical data.
  const { data, error } = await supabase.rpc("adjust_tips_v2", {
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
