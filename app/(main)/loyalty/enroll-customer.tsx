/**
 * Enroll a customer into a loyalty program
 * - Search customer by phone or name
 * - Select program
 * - Create enrollment
 */
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useToast } from '@/contexts/ToastContext'
import type { Database } from '@/database.types'
import {
  Award,
  Check,
  ChevronLeft,
  Search,
  Star,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'

type LoyaltyProgram   = Database['public']['Tables']['loyalty_programs']['Row']
type Customer = { id: string; name: string | null; phone: string | null; lifetime_spend: number | null; visits: number | null }

const PROGRAM_TYPE_LABELS: Record<string, string> = { points: 'Points', visits: 'Visits', punch: 'Punch Card' }

const ProgramIcon: React.FC<{ type: string; size?: number; color?: string }> = ({ type, size = 14, color = colors.teal }) => {
  if (type === 'points') return <Star size={size} color={color} />
  if (type === 'punch')  return <Zap size={size} color={color} />
  return <TrendingUp size={size} color={color} />
}

export default function EnrollCustomerScreen() {
  const router        = useRouter()
  const supabase      = useSupabaseClient()
  const { show }      = useToast()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const merchantId    = selectedStore?.merchant_id ?? ''

  // Step: 'search' | 'select-program' | 'done'
  const [step, setStep] = useState<'search' | 'select-program' | 'done'>('search')

  // Search
  const [query,          setQuery]          = useState('')
  const [searching,      setSearching]      = useState(false)
  const [searchResults,  setSearchResults]  = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // Programs
  const [programs,         setPrograms]         = useState<LoyaltyProgram[]>([])
  const [loadingPrograms,  setLoadingPrograms]   = useState(false)
  const [selectedProgram,  setSelectedProgram]   = useState<LoyaltyProgram | null>(null)
  const [alreadyEnrolled,  setAlreadyEnrolled]   = useState<string[]>([])

  // Enrollment
  const [enrolling, setEnrolling] = useState(false)

  // Load programs on mount
  useEffect(() => {
    if (!merchantId) return
    setLoadingPrograms(true)
    supabase
      .from('loyalty_programs')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setPrograms((data ?? []) as LoyaltyProgram[])
        setLoadingPrograms(false)
      })
  }, [merchantId, supabase])

  const handleSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    try {
      const digits = q.replace(/\D/g, '').slice(-10)
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, lifetime_spend, visits')
        .eq('merchant_id', merchantId)
        .or(
          digits.length >= 7
            ? `phone.ilike.%${digits}%,name.ilike.%${q}%`
            : `name.ilike.%${q}%`
        )
        .limit(10)
      setSearchResults((data ?? []) as Customer[])
    } finally {
      setSearching(false)
    }
  }

  const handleSelectCustomer = async (cust: Customer) => {
    setSelectedCustomer(cust)
    // Find which programs this customer is already enrolled in
    const { data } = await supabase
      .from('loyalty_enrollments')
      .select('program_id')
      .eq('customer_id', cust.id)
      .eq('merchant_id', merchantId)
    setAlreadyEnrolled((data ?? []).map(e => e.program_id))
    setStep('select-program')
  }

  const handleEnroll = async () => {
    if (!selectedCustomer || !selectedProgram) return
    setEnrolling(true)
    try {
      const { error } = await supabase
        .from('loyalty_enrollments')
        .insert({
          customer_id:   selectedCustomer.id,
          program_id:    selectedProgram.id,
          merchant_id:   merchantId,
          is_active:     true,
          enrolled_at:   new Date().toISOString(),
        })

      if (error) {
        show({ title: 'Error', message: error.message ?? 'Failed to enroll customer', type: 'error' })
        return
      }

      setStep('done')
    } finally {
      setEnrolling(false)
    }
  }

  const handleReset = () => {
    setStep('search')
    setQuery('')
    setSearchResults([])
    setSelectedCustomer(null)
    setSelectedProgram(null)
    setAlreadyEnrolled([])
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 7, backgroundColor: colors.teal + '10', borderRadius: 10 }}>
          <ChevronLeft size={16} color={colors.teal} />
        </TouchableOpacity>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.teal + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={14} color={colors.teal} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.heading, flex: 1 }}>Enroll Customer</Text>
      </View>

      {/* Step indicator */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, gap: 8, alignItems: 'center' }}>
        {(['search', 'select-program', 'done'] as const).map((s, idx) => {
          const labels = ['Find Customer', 'Choose Program', 'Enrolled']
          const isActive = step === s
          const isDone   = ['search', 'select-program', 'done'].indexOf(step) > idx
          return (
            <React.Fragment key={s}>
              {idx > 0 && <View style={{ flex: 1, height: 1, backgroundColor: isDone ? colors.teal : colors.border }} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: isActive || isDone ? colors.teal : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  {isDone
                    ? <Check size={11} color={colors.onSolid} />
                    : <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? colors.onSolid : colors.muted }}>{idx + 1}</Text>
                  }
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: isActive ? colors.teal : isDone ? colors.label : colors.muted }}>{labels[idx]}</Text>
              </View>
            </React.Fragment>
          )
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} showsVerticalScrollIndicator={false}>

        {/* ── Step 1: Search ── */}
        {step === 'search' && (
          <>
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.label, textTransform: 'uppercase', letterSpacing: 0.8 }}>Search Customer</Text>
              </View>
              <View style={{ padding: 14, gap: 10 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>Search by name or phone number</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9 }}>
                    <Search size={14} color={colors.muted} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Name or phone…"
                      placeholderTextColor={colors.muted}
                      style={{ flex: 1, fontSize: 13, color: colors.heading }}
                      onSubmitEditing={handleSearch}
                      returnKeyType="search"
                    />
                    {query ? <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]) }}><X size={14} color={colors.muted} /></TouchableOpacity> : null}
                  </View>
                  <TouchableOpacity
                    onPress={handleSearch}
                    disabled={searching || !query.trim()}
                    style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', borderRadius: 9, alignItems: 'center', justifyContent: 'center', minWidth: 80 }}
                  >
                    {searching ? <ActivityIndicator color={colors.teal} size="small" /> : <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>Search</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {searchResults.length > 0 && (
              <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' }}>
                {searchResults.map((cust, idx) => (
                  <TouchableOpacity
                    key={cust.id}
                    onPress={() => handleSelectCustomer(cust)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingHorizontal: 14, paddingVertical: 12,
                      borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border,
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}>{(cust.name ?? '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{cust.name ?? 'Unknown'}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>{cust.phone ?? '—'} · {cust.visits ?? 0} visits · ${(cust.lifetime_spend ?? 0).toFixed(0)} spent</Text>
                    </View>
                    <ChevronLeft size={14} color={colors.muted} style={{ transform: [{ rotate: '180deg' }] }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!searching && query.trim() && searchResults.length === 0 && (
              <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 20, alignItems: 'center', gap: 8 }}>
                <Users size={24} color={colors.muted} />
                <Text style={{ fontSize: 13, color: colors.muted }}>No customers found</Text>
              </View>
            )}
          </>
        )}

        {/* ── Step 2: Select Program ── */}
        {step === 'select-program' && selectedCustomer && (
          <>
            {/* Customer summary */}
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}>{(selectedCustomer.name ?? '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{selectedCustomer.name ?? 'Unknown'}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{selectedCustomer.phone ?? '—'}</Text>
              </View>
              <TouchableOpacity onPress={handleReset} style={{ padding: 6 }}>
                <X size={14} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {/* Program list */}
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.label, textTransform: 'uppercase', letterSpacing: 0.8 }}>Select Program</Text>
              </View>

              {loadingPrograms ? (
                <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator color={colors.teal} size="small" /></View>
              ) : programs.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center', gap: 8 }}>
                  <Award size={24} color={colors.muted} />
                  <Text style={{ fontSize: 13, color: colors.muted }}>No active programs</Text>
                </View>
              ) : (
                programs.map((prog, idx) => {
                  const enrolled = alreadyEnrolled.includes(prog.id)
                  const selected = selectedProgram?.id === prog.id
                  const accent   = prog.display_color ?? colors.teal
                  return (
                    <TouchableOpacity
                      key={prog.id}
                      onPress={() => !enrolled && setSelectedProgram(selected ? null : prog)}
                      disabled={enrolled}
                      activeOpacity={enrolled ? 1 : 0.7}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingHorizontal: 14, paddingVertical: 12,
                        borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border,
                        backgroundColor: selected ? accent + '10' : 'transparent',
                        opacity: enrolled ? 0.5 : 1,
                      }}
                    >
                      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <ProgramIcon type={prog.program_type} size={15} color={accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{prog.name}</Text>
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: colors.info + '15' }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.info }}>{PROGRAM_TYPE_LABELS[prog.program_type] ?? prog.program_type}</Text>
                          </View>
                          {enrolled && (
                            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: colors.success + '15' }}>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: colors.success }}>Enrolled</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{prog.reward_description}</Text>
                        {prog.program_type === 'points' && prog.points_per_dollar != null && (
                          <Text style={{ fontSize: 10, color: colors.label, marginTop: 2 }}>{prog.points_per_dollar} pts / $1 spent</Text>
                        )}
                        {prog.program_type === 'visits' && prog.visits_required != null && (
                          <Text style={{ fontSize: 10, color: colors.label, marginTop: 2 }}>Reward every {prog.visits_required} visits</Text>
                        )}
                        {prog.program_type === 'punch' && prog.punches_required != null && (
                          <Text style={{ fontSize: 10, color: colors.label, marginTop: 2 }}>{prog.punches_required} punches to reward</Text>
                        )}
                      </View>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? accent : colors.border, backgroundColor: selected ? accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {selected && <Check size={12} color={colors.onSolid} />}
                      </View>
                    </TouchableOpacity>
                  )
                })
              )}
            </View>

            <TouchableOpacity
              onPress={handleEnroll}
              disabled={!selectedProgram || enrolling}
              style={{
                paddingVertical: 13, borderRadius: 10, alignItems: 'center',
                backgroundColor: selectedProgram && !enrolling ? colors.teal : colors.teal + '40',
                marginTop: 4,
              }}
            >
              {enrolling
                ? <ActivityIndicator color={colors.onSolid} size="small" />
                : <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onSolid }}>Enroll in Program</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 3: Done ── */}
        {step === 'done' && selectedCustomer && selectedProgram && (
          <View style={{ backgroundColor: colors.success + '10', borderWidth: 1, borderColor: colors.success + '40', borderRadius: 14, padding: 28, alignItems: 'center', gap: 12 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.success + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={24} color={colors.success} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.success }}>Enrolled!</Text>
            <Text style={{ fontSize: 13, color: colors.label, textAlign: 'center', lineHeight: 20 }}>
              <Text style={{ fontWeight: '600', color: colors.heading }}>{selectedCustomer.name}</Text>
              {' '}has been enrolled in{' '}
              <Text style={{ fontWeight: '600', color: colors.heading }}>{selectedProgram.name}</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                onPress={handleReset}
                style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '40', borderRadius: 8 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>Enroll Another</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.success + '20', borderWidth: 1, borderColor: colors.success + '40', borderRadius: 8 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.success }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  )
}
