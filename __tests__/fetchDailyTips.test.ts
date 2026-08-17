/**
 * fetchDailyTips — per-employee daily tip rows.
 *
 * Pins the bug fix: the column is `shift_date`, NOT `business_date` (which does
 * not exist on employee_daily_tips and returned a 400 that was swallowed to []).
 * Also pins the row mapping and null-preservation for undeclared cash tips.
 */

import { fetchDailyTips } from "@/services/tipDistributionService";

function makeSupabase(result: { data?: any[]; error?: any }) {
  const calls: { table?: string; select?: string; eq: Record<string, any> } = {
    eq: {},
  };
  const chain: any = {
    select: jest.fn((cols: string) => {
      calls.select = cols;
      return chain;
    }),
    eq: jest.fn((col: string, val: any) => {
      calls.eq[col] = val;
      return chain;
    }),
    then: (onF: any, onR: any) =>
      Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      }).then(onF, onR),
  };
  const supabase: any = {
    from: jest.fn((t: string) => {
      calls.table = t;
      return chain;
    }),
  };
  return { supabase, calls };
}

describe("fetchDailyTips", () => {
  it("queries employee_daily_tips by shift_date (not business_date) and maps rows", async () => {
    const { supabase, calls } = makeSupabase({
      data: [
        {
          id: "d1",
          staff_profile_id: "sp1",
          shift_date: "2026-08-17",
          hours_worked: "6.5",
          cash_payment_tips: "10",
          cash_tips_declared: "12",
          charged_tips: "40",
          charged_tips_processor_fee: "1.2",
          tip_out_given: "5",
          tip_out_received: "0",
          tip_pool_contributed: "0",
          tip_pool_received: "3",
          total_tips: "50",
          is_verified: true,
        },
      ],
    });

    const rows = await fetchDailyTips(supabase, "loc-1", "2026-08-17");

    expect(calls.table).toBe("employee_daily_tips");
    expect(calls.eq.location_id).toBe("loc-1");
    expect(calls.eq.shift_date).toBe("2026-08-17");
    expect(calls.eq).not.toHaveProperty("business_date");
    expect(calls.select).not.toContain("business_date");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "d1",
      staffProfileId: "sp1",
      shiftDate: "2026-08-17",
      hoursWorked: 6.5,
      cashPaymentTips: 10,
      cashTipsDeclared: 12,
      chargedTips: 40,
      chargedTipsProcessorFee: 1.2,
      tipOutGiven: 5,
      tipOutReceived: 0,
      tipPoolContributed: 0,
      tipPoolReceived: 3,
      totalTips: 50,
      isVerified: true,
    });
  });

  it("returns [] on query error", async () => {
    const { supabase } = makeSupabase({ error: { message: "boom" } });
    const rows = await fetchDailyTips(supabase, "loc-1", "2026-08-17");
    expect(rows).toEqual([]);
  });

  it("preserves null cashTipsDeclared for undeclared shifts", async () => {
    const { supabase } = makeSupabase({
      data: [
        {
          id: "d2",
          staff_profile_id: "sp2",
          shift_date: "2026-08-17",
          cash_tips_declared: null,
          total_tips: "0",
        },
      ],
    });
    const rows = await fetchDailyTips(supabase, "loc-1", "2026-08-17");
    expect(rows[0].cashTipsDeclared).toBeNull();
    expect(rows[0].totalTips).toBe(0);
  });
});
