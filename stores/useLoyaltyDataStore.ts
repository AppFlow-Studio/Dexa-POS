import { getOrderStoreSupabaseClient } from '@/stores/useOrderStore'
import type { Database } from '@/database.types'
import { create } from 'zustand'

// ─── Types ────────────────────────────────────────────────────────────────────

type LoyaltyProgram = Database['public']['Tables']['loyalty_programs']['Row']
type LoyaltyProgramInsert = Database['public']['Tables']['loyalty_programs']['Insert']
type LoyaltyProgramUpdate = Database['public']['Tables']['loyalty_programs']['Update']
type LoyaltyEnrollmentRow = Database['public']['Tables']['loyalty_enrollments']['Row']
type LoyaltyReward = Database['public']['Tables']['loyalty_rewards']['Row']

export type LoyaltyEnrollment = LoyaltyEnrollmentRow & {
  customer?: {
    id: string
    name: string | null
    phone: string | null
    last_visit: string | null
    lifetime_spend: number | null
    visits: number | null
  } | null
  program?: {
    name: string
    program_type: string
    visits_required: number | null
    punches_required: number | null
    points_redemption_threshold: number | null
    reward_description: string | null
    display_color: string | null
    display_icon: string | null
  } | null
}

export type CustomerResult = {
  id: string
  name: string | null
  phone: string | null
  lifetime_spend: number | null
  visits: number | null
}

export type { LoyaltyProgram, LoyaltyReward }

// ─── State ────────────────────────────────────────────────────────────────────

interface LoyaltyDataState {
  // Main data
  programs:    LoyaltyProgram[]
  enrollments: LoyaltyEnrollment[]
  loading:     boolean

  // Redeem tab state
  redeemPhone:       string
  redeemSearching:   boolean
  redeemSearched:    boolean
  redeemCustomer:    CustomerResult | null
  redeemEnrollments: LoyaltyEnrollment[]
  redeemRewards:     LoyaltyReward[]
  redeemRedeeming:   string | null
  redeemLastRedeemed: LoyaltyReward | null

  // Actions — main
  fetchData:   (merchantId: string) => Promise<void>

  // Actions — programs
  saveProgram: (
    payload: LoyaltyProgramInsert | LoyaltyProgramUpdate,
    opts: { isEdit: boolean; editId?: string; isActive: boolean; merchantId: string; locationId: string | null }
  ) => Promise<{ success: boolean; error?: string }>
  deleteProgram: (id: string) => Promise<{ success: boolean; error?: string }>

  // Actions — enrollment
  searchCustomers: (query: string, merchantId: string) => Promise<CustomerResult[]>
  fetchActivePrograms: (merchantId: string) => Promise<LoyaltyProgram[]>
  fetchEnrollmentsForCustomer: (customerId: string, merchantId: string) => Promise<string[]>
  enrollCustomer: (customerId: string, programId: string, merchantId: string) => Promise<{ success: boolean; error?: string }>

  // Actions — redeem
  setRedeemPhone:    (phone: string) => void
  lookupCustomer:    (phone: string, merchantId: string) => Promise<void>
  redeemReward:      (rewardId: string, merchantId: string) => Promise<{ success: boolean; error?: string }>
  clearRedeemState:  () => void
  clearLastRedeemed: () => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useLoyaltyDataStore = create<LoyaltyDataState>()((set, get) => ({
  programs:    [],
  enrollments: [],
  loading:     false,

  redeemPhone:        '',
  redeemSearching:    false,
  redeemSearched:     false,
  redeemCustomer:     null,
  redeemEnrollments:  [],
  redeemRewards:      [],
  redeemRedeeming:    null,
  redeemLastRedeemed: null,

  // ── fetch programs + enrollments ──────────────────────────────────────────

  fetchData: async (merchantId) => {
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase || !merchantId) return
    set({ loading: true })
    try {
      const [{ data: progsData }, { data: enrolData }] = await Promise.all([
        supabase
          .from('loyalty_programs')
          .select('*')
          .eq('merchant_id', merchantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('loyalty_enrollments')
          .select('*, customer:customers(id,name,phone,last_visit,lifetime_spend,visits), program:loyalty_programs(name,program_type,visits_required,punches_required,points_redemption_threshold,reward_description,display_color,display_icon)')
          .eq('merchant_id', merchantId)
          .order('last_earn_at', { ascending: false, nullsFirst: false })
          .limit(300),
      ])
      set({
        programs:    (progsData  ?? []) as LoyaltyProgram[],
        enrollments: (enrolData  ?? []) as LoyaltyEnrollment[],
      })
    } finally {
      set({ loading: false })
    }
  },

  // ── save / delete program ─────────────────────────────────────────────────

  saveProgram: async (payload, { isEdit, editId, isActive, merchantId, locationId }) => {
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase) return { success: false, error: 'No Supabase client' }

    try {
      // Deactivate other programs for this merchant first
      if (isActive) {
        let deactivateQuery = supabase
          .from('loyalty_programs')
          .update({ is_active: false })
          .eq('merchant_id', merchantId)
          .eq('is_active', true)
        if (locationId) {
          deactivateQuery = (deactivateQuery as any).contains('location_ids', [locationId])
        }
        if (isEdit && editId) {
          deactivateQuery = (deactivateQuery as any).neq('id', editId)
        }
        await deactivateQuery
      }

      let error: any
      if (isEdit && editId) {
        ;({ error } = await supabase.from('loyalty_programs').update(payload as LoyaltyProgramUpdate).eq('id', editId))
      } else {
        ;({ error } = await supabase.from('loyalty_programs').insert(payload as LoyaltyProgramInsert))
      }
      if (error) return { success: false, error: error.message }

      // Refresh programs list
      const { data } = await supabase
        .from('loyalty_programs')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('created_at', { ascending: false })
      set({ programs: (data ?? []) as LoyaltyProgram[] })

      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Unknown error' }
    }
  },

  deleteProgram: async (id) => {
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase) return { success: false, error: 'No Supabase client' }
    try {
      const { error } = await supabase.from('loyalty_programs').delete().eq('id', id)
      if (error) return { success: false, error: error.message }
      set(s => ({ programs: s.programs.filter(p => p.id !== id) }))
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Unknown error' }
    }
  },

  // ── enrollment helpers ────────────────────────────────────────────────────

  searchCustomers: async (query, merchantId) => {
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase || !query.trim()) return []
    const trimmed = query.trim()
    const digits  = trimmed.replace(/\D/g, '').slice(-10)
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone, lifetime_spend, visits')
      .eq('merchant_id', merchantId)
      .or(digits.length >= 7 ? `phone.ilike.%${digits}%,name.ilike.%${trimmed}%` : `name.ilike.%${trimmed}%`)
      .limit(10)
    return (data ?? []) as CustomerResult[]
  },

  fetchActivePrograms: async (merchantId) => {
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase) return []
    const { data } = await supabase
      .from('loyalty_programs')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('is_active', true)
      .order('name')
    return (data ?? []) as LoyaltyProgram[]
  },

  fetchEnrollmentsForCustomer: async (customerId, merchantId) => {
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase) return []
    const { data } = await supabase
      .from('loyalty_enrollments')
      .select('program_id')
      .eq('customer_id', customerId)
      .eq('merchant_id', merchantId)
    return (data ?? []).map((e: any) => e.program_id as string)
  },

  enrollCustomer: async (customerId, programId, merchantId) => {
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase) return { success: false, error: 'No Supabase client' }
    try {
      const { error } = await supabase.from('loyalty_enrollments').insert({
        customer_id: customerId,
        program_id:  programId,
        merchant_id: merchantId,
        is_active:   true,
        enrolled_at: new Date().toISOString(),
      })
      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Unknown error' }
    }
  },

  // ── redeem ────────────────────────────────────────────────────────────────

  setRedeemPhone: (phone) => set({ redeemPhone: phone }),

  lookupCustomer: async (phone, merchantId) => {
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase) return
    const trimmed = phone.trim()
    if (trimmed.length < 4) {
      set({ redeemSearched: false, redeemCustomer: null, redeemEnrollments: [], redeemRewards: [], redeemLastRedeemed: null })
      return
    }
    set({ redeemSearching: true })
    try {
      const digits = trimmed.replace(/\D/g, '').slice(-10)
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, phone, lifetime_spend, visits')
        .eq('merchant_id', merchantId)
        .or(`phone.ilike.%${digits}%,phone.ilike.%${trimmed}%`)
        .limit(1)

      const cust = (customers?.[0] ?? null) as CustomerResult | null
      set({ redeemCustomer: cust, redeemLastRedeemed: null })

      if (!cust) { set({ redeemSearched: true }); return }

      const [{ data: enrolData }, { data: rewardData }] = await Promise.all([
        supabase
          .from('loyalty_enrollments')
          .select('*, program:loyalty_programs(name,program_type,visits_required,punches_required,points_redemption_threshold,reward_description,display_color,display_icon)')
          .eq('customer_id', cust.id)
          .eq('merchant_id', merchantId)
          .eq('is_active', true),
        supabase
          .from('loyalty_rewards')
          .select('*')
          .eq('customer_id', cust.id)
          .eq('merchant_id', merchantId)
          .is('redeemed_at', null)
          .is('voided_at', null),
      ])
      set({
        redeemEnrollments: (enrolData  ?? []) as LoyaltyEnrollment[],
        redeemRewards:     (rewardData ?? []) as LoyaltyReward[],
      })
    } finally {
      set({ redeemSearched: true, redeemSearching: false })
    }
  },

  redeemReward: async (rewardId) => {
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase) return { success: false, error: 'No Supabase client' }
    set({ redeemRedeeming: rewardId })
    try {
      const { error } = await supabase
        .from('loyalty_rewards')
        .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
        .eq('id', rewardId)
      if (error) return { success: false, error: error.message }

      const redeemed = get().redeemRewards.find(r => r.id === rewardId) ?? null
      set(s => ({
        redeemRewards:      s.redeemRewards.filter(r => r.id !== rewardId),
        redeemLastRedeemed: redeemed,
      }))
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Unknown error' }
    } finally {
      set({ redeemRedeeming: null })
    }
  },

  clearRedeemState: () => set({
    redeemPhone: '', redeemSearched: false, redeemCustomer: null,
    redeemEnrollments: [], redeemRewards: [], redeemLastRedeemed: null,
  }),

  clearLastRedeemed: () => set({ redeemLastRedeemed: null }),
}))
