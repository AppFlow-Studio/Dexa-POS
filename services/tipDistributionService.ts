/**
 * Tip Distribution Service
 *
 * Wraps Supabase operations for tip configuration management.
 * CRUD operations for tip-out rules and tip pool configs.
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// TIP-OUT RULES
// ============================================================================

export async function createTipOutRule(
  supabase: SupabaseClient,
  params: {
    locationId: string;
    merchantId: string;
    fromRoleCode: string;
    toRoleCode: string;
    tipOutType: "percentage_of_tips" | "percentage_of_sales" | "flat_amount";
    tipOutValue: number;
    effectiveDate: string;
    endDate?: string;
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from("tip_out_rules")
    .insert({
      location_id: params.locationId,
      merchant_id: params.merchantId,
      from_role_code: params.fromRoleCode,
      to_role_code: params.toRoleCode,
      tip_out_type: params.tipOutType,
      tip_out_value: params.tipOutValue,
      effective_date: params.effectiveDate,
      end_date: params.endDate || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateTipOutRule(
  supabase: SupabaseClient,
  ruleId: string,
  updates: {
    tipOutType?: "percentage_of_tips" | "percentage_of_sales" | "flat_amount";
    tipOutValue?: number;
    isActive?: boolean;
    endDate?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const updateData: Record<string, any> = {};
  if (updates.tipOutType !== undefined) updateData.tip_out_type = updates.tipOutType;
  if (updates.tipOutValue !== undefined) updateData.tip_out_value = updates.tipOutValue;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
  if (updates.endDate !== undefined) updateData.end_date = updates.endDate;
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("tip_out_rules")
    .update(updateData)
    .eq("id", ruleId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteTipOutRule(
  supabase: SupabaseClient,
  ruleId: string
): Promise<{ success: boolean; error?: string }> {
  // Soft delete by deactivating
  const { error } = await supabase
    .from("tip_out_rules")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", ruleId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ============================================================================
// TIP POOL CONFIGS
// ============================================================================

export async function createTipPoolConfig(
  supabase: SupabaseClient,
  params: {
    locationId: string;
    merchantId: string;
    name: string;
    description?: string;
    distributionMethod: "percentage" | "hours_weighted" | "equal_split" | "points";
    tipSource: "charged_tips" | "all_tips" | "cash_only";
    sourcePercentage: number;
    contributingRoleCodes: string[];
    effectiveDate: string;
    createdBy: string;
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from("tip_pool_configs")
    .insert({
      location_id: params.locationId,
      merchant_id: params.merchantId,
      name: params.name,
      description: params.description || null,
      distribution_method: params.distributionMethod,
      tip_source: params.tipSource,
      source_percentage: params.sourcePercentage,
      contributing_role_codes: params.contributingRoleCodes,
      effective_date: params.effectiveDate,
      created_by: params.createdBy,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateTipPoolConfig(
  supabase: SupabaseClient,
  configId: string,
  updates: {
    name?: string;
    distributionMethod?: "percentage" | "hours_weighted" | "equal_split" | "points";
    tipSource?: "charged_tips" | "all_tips" | "cash_only";
    sourcePercentage?: number;
    contributingRoleCodes?: string[];
    isActive?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const updateData: Record<string, any> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.distributionMethod !== undefined)
    updateData.distribution_method = updates.distributionMethod;
  if (updates.tipSource !== undefined) updateData.tip_source = updates.tipSource;
  if (updates.sourcePercentage !== undefined)
    updateData.source_percentage = updates.sourcePercentage;
  if (updates.contributingRoleCodes !== undefined)
    updateData.contributing_role_codes = updates.contributingRoleCodes;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("tip_pool_configs")
    .update(updateData)
    .eq("id", configId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ============================================================================
// TIP POOL ROLE SHARES
// ============================================================================

export async function setRoleShare(
  supabase: SupabaseClient,
  params: {
    tipPoolConfigId: string;
    roleCode: string;
    sharePercentage: number;
    pointsPerHour?: number;
    isEligible: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("tip_pool_role_shares").upsert(
    {
      tip_pool_config_id: params.tipPoolConfigId,
      role_code: params.roleCode,
      share_percentage: params.sharePercentage,
      points_per_hour: params.pointsPerHour || null,
      is_eligible: params.isEligible,
    },
    { onConflict: "tip_pool_config_id,role_code" }
  );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ============================================================================
// DAILY TIPS QUERY
// ============================================================================

export async function fetchDailyTips(
  supabase: SupabaseClient,
  locationId: string,
  date: string
): Promise<any[]> {
  const { data, error } = await supabase
    .from("employee_daily_tips")
    .select("*")
    .eq("location_id", locationId)
    .eq("business_date", date);

  if (error) {
    console.error("[TipDist] Failed to fetch daily tips:", error);
    return [];
  }

  return data || [];
}
