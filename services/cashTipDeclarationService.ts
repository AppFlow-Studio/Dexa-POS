/**
 * Cash Tip Declaration Service
 *
 * Wraps the `declare_cash_tips_for_shift` RPC and provides queries
 * for shift summary data (charged tips, gross sales) and declaration status.
 */

import { getBusinessDayBounds, BusinessDayConfig } from "@/lib/businessDay";
import { SupabaseClient } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeclareCashTipsResult {
  success: boolean;
  shift_id: string;
  declared_amount: number;
}

export interface ShiftTipSummary {
  cardTips: number;       // Tips on card payments (server doesn't have these yet)
  cashPaymentTips: number; // Tips on cash payments already tracked in POS
  grossSales: number;
}

export interface ShiftDeclarationRow {
  id: string;
  staffProfileId: string;
  staffName: string;
  status: string; // 'active' | 'on_break' | 'completed'
  clockInTime: string;
  clockOutTime: string | null;
  declaredCashTips: number;
  tipsDeclaredAt: string | null;
}

// ── RPC Wrappers ────────────────────────────────────────────────────────────

/**
 * Declare cash tips for a specific shift.
 * The RPC validates ownership/admin, updates staff_shifts,
 * and cascades via `rebuild_employee_daily_tips`.
 */
export async function declareCashTips(
  supabase: SupabaseClient,
  shiftId: string,
  amount: number,
): Promise<DeclareCashTipsResult> {
  const { data, error } = await supabase.rpc("declare_cash_tips_for_shift", {
    p_shift_id: shiftId,
    p_amount: amount,
  });

  if (error) throw error;
  return data as DeclareCashTipsResult;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetch charged tips and gross sales for a staff member today.
 * Used in the clock-out summary screen.
 */
export async function fetchShiftTipSummary(
  supabase: SupabaseClient,
  staffProfileId: string,
  locationId: string,
  date: string, // YYYY-MM-DD
  businessDayConfig?: BusinessDayConfig,
): Promise<ShiftTipSummary> {
  let startOfDay: string;
  let endOfDay: string;
  if (businessDayConfig) {
    const bounds = getBusinessDayBounds(date, businessDayConfig);
    startOfDay = bounds.startUtc;
    endOfDay = bounds.endUtc;
  } else {
    startOfDay = `${date}T00:00:00`;
    endOfDay = `${date}T23:59:59.999`;
  }

  // Step 1: Get this server's order IDs for today
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("id, subtotal")
    .eq("location_id", locationId)
    .or(
      `assigned_server_id.eq.${staffProfileId},created_by_staff_id.eq.${staffProfileId}`,
    )
    .gte("created_at", startOfDay)
    .lte("created_at", endOfDay)
    .not("status", "in", '("cancelled","void","refunded")');

  if (orderError) throw orderError;

  const orderIds = (orderData || []).map((o: any) => o.id).filter(Boolean);
  const grossSales = (orderData || []).reduce(
    (sum, o: any) => sum + (Number(o.subtotal) || 0),
    0,
  );

  // Step 2: Get tips from those orders only
  let cardTips = 0;
  let cashPaymentTips = 0;

  if (orderIds.length > 0) {
    const { data: tipData, error: tipError } = await supabase
      .from("order_payments")
      .select("tip_amount, payment_method")
      .in("order_id", orderIds)
      .eq("status", "captured");

    if (tipError) throw tipError;

    (tipData || []).forEach((p: any) => {
      const tip = Number(p.tip_amount) || 0;
      if (tip <= 0) return;
      if (p.payment_method === "cash") {
        cashPaymentTips += tip;
      } else {
        cardTips += tip;
      }
    });
  }

  return { cardTips, cashPaymentTips, grossSales };
}

/**
 * Fetch all shifts for a location on a given date with their declaration status.
 * Used by the EOD shift review component.
 */
export async function fetchShiftDeclarationStatus(
  supabase: SupabaseClient,
  locationId: string,
  date: string, // YYYY-MM-DD
  businessDayConfig?: BusinessDayConfig,
  afterCutoff?: string | null, // If provided, only show shifts started after cutoff OR still active
): Promise<ShiftDeclarationRow[]> {
  let startOfDay: string;
  let endOfDay: string;
  if (businessDayConfig) {
    const bounds = getBusinessDayBounds(date, businessDayConfig);
    startOfDay = bounds.startUtc;
    endOfDay = bounds.endUtc;
  } else {
    startOfDay = `${date}T00:00:00`;
    endOfDay = `${date}T23:59:59.999`;
  }

  let query = supabase
    .from("staff_shifts")
    .select(
      "id, staff_profile_id, status, clock_in_time, clock_out_time, declared_cash_tips, tips_declared_at, staff_profiles!inner(display_name)",
    )
    .eq("location_id", locationId)
    .gte("clock_in_time", startOfDay)
    .lte("clock_in_time", endOfDay)
    .order("clock_in_time", { ascending: true });

  // Multi-session: filter to shifts in current window or still active
  if (afterCutoff) {
    query = query.or(`clock_in_time.gte.${afterCutoff},clock_out_time.is.null,clock_out_time.gt.${afterCutoff}`);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((s: any) => ({
    id: s.id,
    staffProfileId: s.staff_profile_id,
    staffName: s.staff_profiles?.display_name || "Unknown",
    status: s.status,
    clockInTime: s.clock_in_time,
    clockOutTime: s.clock_out_time,
    declaredCashTips: Number(s.declared_cash_tips) || 0,
    tipsDeclaredAt: s.tips_declared_at,
  }));
}
