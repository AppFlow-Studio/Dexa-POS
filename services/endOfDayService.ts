/**
 * End-of-Day Service
 *
 * Fetches aggregated daily data for EOD reporting.
 * Runs checklist validations against live data.
 */

import { DailySummary, useEndOfDayStore } from "@/stores/useEndOfDayStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { useCashDrawerStore } from "@/stores/useCashDrawerStore";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Run all checklist validations and update the store.
 */
export async function runChecklistValidations(
  supabase: SupabaseClient,
  locationId: string
): Promise<void> {
  const eod = useEndOfDayStore.getState();

  // 1. Check tables clear
  const sessions = useTableSessionStore.getState().sessions;
  const activeTables = Object.values(sessions).filter(
    (s) => s && s.status !== "available" && s.status !== "cleaning"
  );
  if (activeTables.length === 0) {
    eod.updateChecklistItem("tables_clear", "passed");
  } else {
    eod.updateChecklistItem(
      "tables_clear",
      "failed",
      `${activeTables.length} table(s) still active`
    );
  }

  // 2. Check orders closed
  const { data: unpaidOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("location_id", locationId)
    .eq("paid_status", "Unpaid")
    .not("order_status", "in", '("voided","cancelled")')
    .limit(10);

  if (!unpaidOrders?.length) {
    eod.updateChecklistItem("orders_closed", "passed");
  } else {
    eod.updateChecklistItem(
      "orders_closed",
      "failed",
      `${unpaidOrders.length} unpaid order(s) remain`
    );
  }

  // 3. Check cash drawer
  const drawerSession = useCashDrawerStore.getState().activeSession;
  if (!drawerSession || drawerSession.status === "closed") {
    eod.updateChecklistItem("cash_drawer_closed", "passed");
  } else {
    eod.updateChecklistItem("cash_drawer_closed", "failed", "Drawer still open");
  }

  // 4. Check tips (just mark pending — user triggers manually)
  // Tip distribution is manual, so we check if a session exists for today
  const today = new Date().toISOString().split("T")[0];
  const { data: tipSession } = await supabase
    .from("tip_distribution_sessions")
    .select("status")
    .eq("location_id", locationId)
    .eq("session_date", today)
    .limit(1)
    .maybeSingle();

  if (tipSession?.status === "approved" || tipSession?.status === "exported") {
    eod.updateChecklistItem("tips_distributed", "passed");
  } else if (tipSession) {
    eod.updateChecklistItem(
      "tips_distributed",
      "failed",
      `Status: ${tipSession.status}`
    );
  } else {
    eod.updateChecklistItem("tips_distributed", "pending", "Not started");
  }

  // 5. Check shifts
  const activeShifts = Object.values(useTimeclockStore.getState().sessions);
  if (activeShifts.length === 0) {
    eod.updateChecklistItem("shifts_reviewed", "passed");
  } else {
    eod.updateChecklistItem(
      "shifts_reviewed",
      "failed",
      `${activeShifts.length} staff still clocked in`
    );
  }

  // 6. Report is always pending until user generates it
  eod.updateChecklistItem("report_generated", "pending");
}

/**
 * Fetch aggregated daily summary data.
 */
export async function fetchDailySummary(
  supabase: SupabaseClient,
  locationId: string,
  date?: string
): Promise<DailySummary | null> {
  const targetDate = date || new Date().toISOString().split("T")[0];
  const startOfDay = `${targetDate}T00:00:00.000Z`;
  const endOfDay = `${targetDate}T23:59:59.999Z`;

  try {
    // Fetch orders for the day
    const { data: orders } = await supabase
      .from("orders")
      .select("id, grand_total, cash_grand_total, paid_status, order_status")
      .eq("location_id", locationId)
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .not("order_status", "in", '("voided","cancelled")');

    // Fetch payments for the day
    const { data: payments } = await supabase
      .from("order_payments")
      .select(
        "id, payment_method, amount_charged, tip_amount, change_given, refunded_amount"
      )
      .eq("location_id", locationId)
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay);

    // Fetch shifts for the day
    const { data: shifts } = await supabase
      .from("staff_shifts")
      .select("id, clock_in_time, clock_out_time, hourly_rate_snapshot, break_logs")
      .eq("location_id", locationId)
      .gte("clock_in_time", startOfDay)
      .lte("clock_in_time", endOfDay);

    // Fetch cash drawer summary view
    const { data: drawerSummary } = await supabase
      .from("v_cash_drawer_summary")
      .select("*")
      .eq("location_id", locationId)
      .eq("business_date", targetDate)
      .maybeSingle();

    // Calculate totals
    const orderList = orders || [];
    const paymentList = payments || [];
    const shiftList = shifts || [];

    const totalSales = orderList.reduce(
      (sum, o) => sum + Number(o.grand_total || 0),
      0
    );

    const cardPayments = paymentList.filter((p) => p.payment_method === "card");
    const cashPayments = paymentList.filter((p) => p.payment_method === "cash");

    const cardTotal = cardPayments.reduce(
      (sum, p) => sum + Number(p.amount_charged || 0),
      0
    );
    const cashTotal = cashPayments.reduce(
      (sum, p) => sum + Number(p.amount_charged || 0),
      0
    );
    const totalTips = paymentList.reduce(
      (sum, p) => sum + Number(p.tip_amount || 0),
      0
    );
    const totalRefunds = paymentList.reduce(
      (sum, p) => sum + Number(p.refunded_amount || 0),
      0
    );

    // Labor calculation
    let totalLaborHours = 0;
    let totalLaborCost = 0;
    for (const shift of shiftList) {
      const clockIn = new Date(shift.clock_in_time);
      const clockOut = shift.clock_out_time
        ? new Date(shift.clock_out_time)
        : new Date();
      let durationMs = clockOut.getTime() - clockIn.getTime();

      // Subtract breaks
      if (shift.break_logs && Array.isArray(shift.break_logs)) {
        for (const brk of shift.break_logs as any[]) {
          if (brk.start && brk.end) {
            durationMs -= new Date(brk.end).getTime() - new Date(brk.start).getTime();
          }
        }
      }

      const hours = durationMs / (1000 * 60 * 60);
      totalLaborHours += hours;
      totalLaborCost += hours * Number(shift.hourly_rate_snapshot || 0);
    }

    // Cash drawer
    const drawerStore = useCashDrawerStore.getState();

    const summary: DailySummary = {
      date: targetDate,
      totalSales,
      totalOrders: orderList.length,
      averageOrderValue: orderList.length > 0 ? totalSales / orderList.length : 0,
      cardTotal,
      cashTotal,
      otherTotal: 0,
      totalTips,
      totalLaborHours,
      totalLaborCost,
      staffCount: shiftList.length,
      drawerOpening: drawerStore.activeSession?.openingAmount || 0,
      drawerClosing: drawerStore.getRunningBalance(),
      drawerVariance: 0,
      totalVoids: 0, // Would need separate void tracking
      totalDiscounts: 0,
      totalRefunds,
    };

    return summary;
  } catch (error) {
    console.error("[EOD] Failed to fetch daily summary:", error);
    return null;
  }
}
