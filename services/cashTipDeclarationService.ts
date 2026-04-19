/**
 * Cash Tip Declaration Service
 *
 * Wraps the `declare_cash_tips_for_shift` RPC and provides queries
 * for shift summary data (charged tips, gross sales) and declaration status.
 */

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
): Promise<ShiftTipSummary> {
  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59.999`;

  // All tips from this server's orders today (split by payment method)
  const { data: tipData, error: tipError } = await supabase
    .from("order_payments")
    .select("tip_amount, payment_method, orders!inner(assigned_server_id, created_by_staff_id)")
    .eq("orders.location_id", locationId)
    .eq("status", "captured")
    .gte("initiated_at", startOfDay)
    .lte("initiated_at", endOfDay)
    .or(
      `assigned_server_id.eq.${staffProfileId},created_by_staff_id.eq.${staffProfileId}`,
      { referencedTable: "orders" },
    );

  if (tipError) throw tipError;

  let cardTips = 0;
  let cashPaymentTips = 0;
  (tipData || []).forEach((p: any) => {
    const tip = Number(p.tip_amount) || 0;
    if (tip <= 0) return;
    if (p.payment_method === "cash") {
      cashPaymentTips += tip;
    } else {
      cardTips += tip;
    }
  });

  // Gross sales: sum of subtotal from this server's orders today
  const { data: salesData, error: salesError } = await supabase
    .from("orders")
    .select("subtotal")
    .eq("location_id", locationId)
    .or(
      `assigned_server_id.eq.${staffProfileId},created_by_staff_id.eq.${staffProfileId}`,
    )
    .gte("created_at", startOfDay)
    .lte("created_at", endOfDay)
    .not("status", "in", '("cancelled","void","refunded")');

  if (salesError) throw salesError;

  const grossSales = (salesData || []).reduce(
    (sum, o: any) => sum + (Number(o.subtotal) || 0),
    0,
  );

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
): Promise<ShiftDeclarationRow[]> {
  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59.999`;

  const { data, error } = await supabase
    .from("staff_shifts")
    .select(
      "id, staff_profile_id, status, clock_in_time, clock_out_time, declared_cash_tips, tips_declared_at, staff_profiles!inner(display_name)",
    )
    .eq("location_id", locationId)
    .gte("clock_in_time", startOfDay)
    .lte("clock_in_time", endOfDay)
    .order("clock_in_time", { ascending: true });

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
