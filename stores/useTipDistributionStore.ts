/**
 * Tip Distribution Store
 *
 * Manages tip configuration, distribution sessions, and approval workflow.
 * Supports both individual tips (with tip-outs) AND tip pooling.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

// ============================================================================
// TYPES
// ============================================================================

export interface TipOutRule {
  id: string;
  fromRoleCode: string;
  toRoleCode: string;
  tipOutType: "percentage_of_tips" | "percentage_of_sales" | "flat_amount";
  tipOutValue: number;
  isActive: boolean;
  effectiveDate: string;
  endDate?: string | null;
}

export interface TipPoolConfig {
  id: string;
  name: string;
  description?: string;
  distributionMethod: "percentage" | "hours_weighted" | "equal_split" | "points";
  tipSource: "charged_tips" | "all_tips" | "cash_only";
  sourcePercentage: number;
  contributingRoleCodes: string[];
  isActive: boolean;
  effectiveDate: string;
  endDate?: string | null;
}

export interface TipPoolRoleShare {
  id: string;
  tipPoolConfigId: string;
  roleCode: string;
  sharePercentage: number;
  pointsPerHour?: number;
  isEligible: boolean;
}

export interface TipDistributionDetail {
  id: string;
  sessionId: string;
  staffProfileId: string;
  staffName?: string;
  roleCode: string;
  grossSales: number;
  cashTips: number;
  chargedTips: number;
  individualTipsEarned: number;
  tipOutGiven: number;
  tipOutReceived: number;
  tipPoolContributed: number;
  tipPoolReceived: number;
  manualAdjustment: number;
  netTips: number;
  hoursWorked: number;
}

export interface TipDistributionSession {
  id: string;
  locationId: string;
  sessionDate: string;
  shiftPeriod?: "full_day" | "lunch" | "dinner" | "custom";
  status: "draft" | "calculated" | "approved" | "exported" | "voided";
  totalTipsCollected: number;
  totalTipsPooled: number;
  totalTipOuts: number;
  totalDistributed: number;
  roundingAdjustment: number;
  calculatedAt?: string;
  calculatedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvalNotes?: string;
  details: TipDistributionDetail[];
}

export type TipWizardStep = "declare" | "calculate" | "review" | "approve";

// ============================================================================
// STATE
// ============================================================================

interface TipDistributionState {
  // Config (fetched from backend)
  tipOutRules: TipOutRule[];
  tipPoolConfigs: TipPoolConfig[];
  tipPoolRoleShares: TipPoolRoleShare[];

  // Current distribution session
  currentSession: TipDistributionSession | null;
  wizardStep: TipWizardStep;

  // Cash tip declarations (staff_id -> declared amount)
  cashTipDeclarations: Record<string, number>;

  // Loading
  isLoading: boolean;
  isCalculating: boolean;

  // Actions
  setTipOutRules: (rules: TipOutRule[]) => void;
  setTipPoolConfigs: (configs: TipPoolConfig[]) => void;
  setTipPoolRoleShares: (shares: TipPoolRoleShare[]) => void;
  setCurrentSession: (session: TipDistributionSession | null) => void;
  setWizardStep: (step: TipWizardStep) => void;
  declareCashTips: (staffId: string, amount: number) => void;
  clearDeclarations: () => void;
  updateDetailAdjustment: (detailId: string, adjustment: number) => void;
  reset: () => void;

  // Fetching
  fetchTipConfig: (supabase: any, locationId: string) => Promise<void>;
  calculateDistribution: (
    supabase: any,
    locationId: string,
    merchantId: string,
    sessionDate: string,
    calculatedBy: string,
    shiftPeriod?: string
  ) => Promise<void>;
  approveDistribution: (
    supabase: any,
    sessionId: string,
    approvedBy: string,
    notes?: string
  ) => Promise<void>;
}

// ============================================================================
// STORE
// ============================================================================

export const useTipDistributionStore = create<TipDistributionState>()(
  immer((set, get) => ({
    tipOutRules: [],
    tipPoolConfigs: [],
    tipPoolRoleShares: [],
    currentSession: null,
    wizardStep: "declare" as TipWizardStep,
    cashTipDeclarations: {},
    isLoading: false,
    isCalculating: false,

    setTipOutRules: (rules) => set({ tipOutRules: rules }),
    setTipPoolConfigs: (configs) => set({ tipPoolConfigs: configs }),
    setTipPoolRoleShares: (shares) => set({ tipPoolRoleShares: shares }),
    setCurrentSession: (session) => set({ currentSession: session }),
    setWizardStep: (step) => set({ wizardStep: step }),

    declareCashTips: (staffId, amount) => {
      set((state) => {
        state.cashTipDeclarations[staffId] = amount;
      });
    },

    clearDeclarations: () => set({ cashTipDeclarations: {} }),

    updateDetailAdjustment: (detailId, adjustment) => {
      set((state) => {
        if (!state.currentSession) return;
        const detail = state.currentSession.details.find(
          (d) => d.id === detailId
        );
        if (detail) {
          detail.manualAdjustment = adjustment;
          detail.netTips =
            detail.individualTipsEarned -
            detail.tipOutGiven +
            detail.tipOutReceived -
            detail.tipPoolContributed +
            detail.tipPoolReceived +
            adjustment;
        }
      });
    },

    reset: () =>
      set({
        currentSession: null,
        wizardStep: "declare",
        cashTipDeclarations: {},
        isCalculating: false,
      }),

    fetchTipConfig: async (supabase, locationId) => {
      set({ isLoading: true });

      try {
        const [rulesRes, poolsRes, sharesRes] = await Promise.all([
          supabase
            .from("tip_out_rules")
            .select("*")
            .eq("location_id", locationId)
            .eq("is_active", true),
          supabase
            .from("tip_pool_configs")
            .select("*")
            .eq("location_id", locationId)
            .eq("is_active", true),
          supabase
            .from("tip_pool_role_shares")
            .select("*, tip_pool_configs!inner(location_id)")
            .eq("tip_pool_configs.location_id", locationId)
            .eq("is_eligible", true),
        ]);

        set({
          tipOutRules: (rulesRes.data || []).map((r: any) => ({
            id: r.id,
            fromRoleCode: r.from_role_code,
            toRoleCode: r.to_role_code,
            tipOutType: r.tip_out_type,
            tipOutValue: Number(r.tip_out_value),
            isActive: r.is_active,
            effectiveDate: r.effective_date,
            endDate: r.end_date,
          })),
          tipPoolConfigs: (poolsRes.data || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            distributionMethod: c.distribution_method,
            tipSource: c.tip_source,
            sourcePercentage: Number(c.source_percentage),
            contributingRoleCodes: c.contributing_role_codes || [],
            isActive: c.is_active,
            effectiveDate: c.effective_date,
            endDate: c.end_date,
          })),
          tipPoolRoleShares: (sharesRes.data || []).map((s: any) => ({
            id: s.id,
            tipPoolConfigId: s.tip_pool_config_id,
            roleCode: s.role_code,
            sharePercentage: Number(s.share_percentage),
            pointsPerHour: s.points_per_hour
              ? Number(s.points_per_hour)
              : undefined,
            isEligible: s.is_eligible,
          })),
          isLoading: false,
        });
      } catch (error) {
        console.error("[TipDist] Failed to fetch config:", error);
        set({ isLoading: false });
      }
    },

    calculateDistribution: async (
      supabase,
      locationId,
      merchantId,
      sessionDate,
      calculatedBy,
      shiftPeriod
    ) => {
      set({ isCalculating: true });

      try {
        const { data, error } = await supabase.rpc(
          "calculate_tip_distribution_v2",
          {
            p_location_id: locationId,
            p_merchant_id: merchantId,
            p_session_date: sessionDate,
            p_shift_period: shiftPeriod || null,
            p_calculated_by: calculatedBy,
          }
        );

        if (error) throw error;

        const result = data as any;

        // Map response to session
        const session: TipDistributionSession = {
          id: result.session_id,
          locationId,
          sessionDate,
          shiftPeriod: shiftPeriod as TipDistributionSession["shiftPeriod"],
          status: "calculated",
          totalTipsCollected: Number(result.total_tips_collected || 0),
          totalTipsPooled: Number(result.total_tips_pooled || 0),
          totalTipOuts: Number(result.total_tip_outs || 0),
          totalDistributed: Number(result.total_distributed || 0),
          roundingAdjustment: Number(result.rounding_adjustment || 0),
          calculatedAt: new Date().toISOString(),
          calculatedBy,
          details: (result.details || []).map((d: any) => ({
            id: d.id,
            sessionId: result.session_id,
            staffProfileId: d.staff_profile_id,
            staffName: d.staff_name,
            roleCode: d.role_code,
            grossSales: Number(d.gross_sales || 0),
            cashTips: Number(d.cash_tips || 0),
            chargedTips: Number(d.charged_tips || 0),
            individualTipsEarned: Number(d.individual_tips_earned || 0),
            tipOutGiven: Number(d.tip_out_given || 0),
            tipOutReceived: Number(d.tip_out_received || 0),
            tipPoolContributed: Number(d.tip_pool_contributed || 0),
            tipPoolReceived: Number(d.tip_pool_received || 0),
            manualAdjustment: Number(d.manual_adjustment || 0),
            netTips: Number(d.net_tips || 0),
            hoursWorked: Number(d.hours_worked || 0),
          })),
        };

        set({
          currentSession: session,
          wizardStep: "review",
          isCalculating: false,
        });
      } catch (error) {
        console.error("[TipDist] Calculate failed:", error);
        set({ isCalculating: false });
      }
    },

    approveDistribution: async (supabase, sessionId, approvedBy, notes) => {
      try {
        const { data, error } = await supabase.rpc(
          "approve_tip_distribution",
          {
            p_session_id: sessionId,
            p_approved_by: approvedBy,
          }
        );

        if (error) throw error;

        set((state) => {
          if (state.currentSession) {
            state.currentSession.status = "approved";
            state.currentSession.approvedAt = new Date().toISOString();
            state.currentSession.approvedBy = approvedBy;
            state.currentSession.approvalNotes = notes;
          }
          state.wizardStep = "approve";
        });
      } catch (error) {
        console.error("[TipDist] Approve failed:", error);
      }
    },
  }))
);
