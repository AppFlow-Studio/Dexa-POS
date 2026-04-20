// services/loyalty/loyaltyService.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LoyaltyEarnResult {
  program_name: string
  program_type: string // 'points' | 'visits' | 'punch_card'
  earned: number
  new_balance: number
  reward_unlocked: boolean
  progress_percent?: number | null
  remaining_to_reward?: number | null
  reward_threshold?: number | null
  reward_label?: string | null
  can_redeem_now?: boolean | null
}

function mapToLoyaltyEarnResult (raw: any): LoyaltyEarnResult {
  return {
    program_name: raw?.program_name ?? raw?.programName ?? raw?.name ?? '',
    program_type: raw?.program_type ?? raw?.programType ?? raw?.type ?? '',
    earned: Number(raw?.earned ?? 0),
    new_balance: Number(raw?.new_balance ?? raw?.newBalance ?? 0),
    reward_unlocked: Boolean(raw?.reward_unlocked ?? raw?.rewardUnlocked),
    progress_percent:
      raw?.progress_percent ?? raw?.progressPercent ?? raw?.progress ?? null,
    remaining_to_reward:
      raw?.remaining_to_reward ?? raw?.remainingToReward ?? null,
    reward_threshold: raw?.reward_threshold ?? raw?.rewardThreshold ?? null,
    reward_label: raw?.reward_label ?? raw?.rewardLabel ?? null,
    can_redeem_now: raw?.can_redeem_now ?? raw?.canRedeemNow ?? null
  }
}

function normalizeEarnPayload (data: unknown): LoyaltyEarnResult[] {
  if (!data) return []

  let payload: any = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      return []
    }
  }

  if (Array.isArray(payload)) {
    return payload.map(mapToLoyaltyEarnResult)
  }

  if (payload && typeof payload === 'object') {
    const candidates = [
      payload.results,
      payload.data,
      payload.programs,
      payload.earnings
    ]
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.map(mapToLoyaltyEarnResult)
      }
    }
  }

  return []
}

/**
 * Check if a merchant has any active loyalty programs.
 * Used to gate the loyalty prompt after payment.
 */
export async function checkMerchantHasLoyalty (
  merchantId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { count, error } = await supabase
    .from('loyalty_programs')
    .select('id', { count: 'exact', head: true })
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
  if (error) throw error
  return (count ?? 0) > 0
}

/**
 * Look up a customer by phone number; create a new record if not found.
 * Phone is normalized to digits-only before lookup.
 */
export async function findOrCreateCustomerByPhone (
  rawPhone: string,
  merchantId: string,
  supabase: SupabaseClient
): Promise<{ id: string; name: string | null; isNew: boolean }> {
  const phone = rawPhone.replace(/\D/g, '')

  const { data: existing, error: findError } = await supabase
    .from('customers')
    .select('id, name')
    .eq('merchant_id', merchantId)
    .eq('phone', phone)
    .maybeSingle()

  if (findError) throw findError

  if (existing) {
    return { id: existing.id, name: existing.name ?? null, isNew: false }
  }

  const { data: created, error: createError } = await supabase
    .from('customers')
    .insert({
      merchant_id: merchantId,
      phone,
      visits: 0,
      lifetime_spend: 0,
      total_orders: 0
    })
    .select('id, name')
    .single()

  if (createError) throw createError
  return { id: created.id, name: created.name ?? null, isNew: true }
}

/**
 * Call loyalty_earn_on_order RPC to process loyalty for the given order.
 * Requires: order.status = 'completed' AND order.customer_id IS NOT NULL.
 */
export async function earnLoyaltyForOrder (
  dbOrderId: string,
  supabase: SupabaseClient
): Promise<LoyaltyEarnResult[]> {
  const { data, error } = await supabase.rpc('loyalty_earn_on_order', {
    p_order_id: dbOrderId
  })
  if (error) throw error
  const normalized = normalizeEarnPayload(data)
  if (normalized.length === 0 && data) {
    console.warn(
      '[Loyalty] loyalty_earn_on_order returned unrecognized payload:',
      data
    )
  }
  return normalized
}
