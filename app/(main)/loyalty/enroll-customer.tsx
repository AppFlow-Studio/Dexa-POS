/**
 * Enroll a customer into a loyalty program
 * - Search customer by phone or name
 * - Select program
 * - Create enrollment
 */
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useToast } from '@/contexts/ToastContext'
import { useLoyaltyDataStore } from '@/stores/useLoyaltyDataStore'
import type { LoyaltyProgram, CustomerResult } from '@/stores/useLoyaltyDataStore'
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
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'

const PROGRAM_TYPE_LABELS: Record<string, string> = { points: 'Points', visits: 'Visits', punch: 'Punch Card' }

const ProgramIcon: React.FC<{ type: string; size?: number; color?: string }> = ({ type, size = 14, color = colors.teal }) => {
  if (type === 'points') return <Star size={size} color={color} />
  if (type === 'punch')  return <Zap size={size} color={color} />
  return <TrendingUp size={size} color={color} />
}

export default function EnrollCustomerScreen() {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const router        = useRouter()
  const { show }      = useToast()
  const selectedStore = useStoreSettingsStore(storeState => storeState.selectedStore)
  const merchantId    = selectedStore?.merchant_id ?? ''

  const { searchCustomers, fetchActivePrograms, fetchEnrollmentsForCustomer, enrollCustomer } = useLoyaltyDataStore()

  // Step: 'search' | 'select-program' | 'done'
  const [step, setStep] = useState<'search' | 'select-program' | 'done'>('search')

  // Search
  const [query,          setQuery]          = useState('')
  const [searching,      setSearching]      = useState(false)
  const [searchResults,  setSearchResults]  = useState<CustomerResult[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    fetchActivePrograms(merchantId).then(data => {
      setPrograms(data)
      setLoadingPrograms(false)
    })
  }, [merchantId])

  const runSearch = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setSearchResults([]); return }
    setSearching(true)
    try {
      const results = await searchCustomers(trimmed, merchantId)
      setSearchResults(results)
    } finally {
      setSearching(false)
    }
  }

  const handleQueryChange = (text: string) => {
    setQuery(text)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(text), 400)
  }

  const handleSelectCustomer = async (cust: CustomerResult) => {
    setSelectedCustomer(cust)
    const enrolled = await fetchEnrollmentsForCustomer(cust.id, merchantId)
    setAlreadyEnrolled(enrolled)
    setStep('select-program')
  }

  const handleEnroll = async () => {
    if (!selectedCustomer || !selectedProgram) return
    setEnrolling(true)
    try {
      const result = await enrollCustomer(selectedCustomer.id, selectedProgram.id, merchantId)
      if (!result.success) {
        show({ title: 'Error', message: result.error ?? 'Failed to enroll customer', type: 'error' })
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10), paddingHorizontal: s(14), paddingVertical: s(8), backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: s(7), backgroundColor: colors.teal + '10', borderRadius: s(10) }}>
          <ChevronLeft size={s(16)} color={colors.teal} />
        </TouchableOpacity>
        <View style={{ width: s(28), height: s(28), borderRadius: s(8), backgroundColor: colors.teal + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={s(14)} color={colors.teal} />
        </View>
        <Text style={{ fontSize: s(16), fontWeight: '700', color: colors.heading, flex: 1 }}>Enroll Customer</Text>
      </View>

      {/* Step indicator */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: s(14), paddingVertical: s(10), gap: s(8), alignItems: 'center' }}>
        {(['search', 'select-program', 'done'] as const).map((stepName, idx) => {
          const labels = ['Find Customer', 'Choose Program', 'Enrolled']
          const isActive = step === stepName
          const isDone   = ['search', 'select-program', 'done'].indexOf(step) > idx
          return (
            <React.Fragment key={stepName}>
              {idx > 0 && <View style={{ flex: 1, height: 1, backgroundColor: isDone ? colors.teal : colors.border }} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(5) }}>
                <View style={{ width: s(20), height: s(20), borderRadius: s(10), backgroundColor: isActive || isDone ? colors.teal : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  {isDone
                    ? <Check size={s(11)} color={colors.onSolid} />
                    : <Text style={{ fontSize: s(10), fontWeight: '700', color: isActive ? colors.onSolid : colors.muted }}>{idx + 1}</Text>
                  }
                </View>
                <Text style={{ fontSize: s(11), fontWeight: '600', color: isActive ? colors.teal : isDone ? colors.label : colors.muted }}>{labels[idx]}</Text>
              </View>
            </React.Fragment>
          )
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: s(14), gap: s(12) }} showsVerticalScrollIndicator={false}>

        {/* ── Step 1: Search ── */}
        {step === 'search' && (
          <>
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: s(14), overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: s(14), paddingVertical: s(9), backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: s(11), fontWeight: '700', color: colors.label, textTransform: 'uppercase', letterSpacing: 0.8 }}>Search Customer</Text>
              </View>
              <View style={{ padding: s(14), gap: s(10) }}>
                <Text style={{ fontSize: s(12), color: colors.muted }}>Search by name or phone number</Text>
                <View style={{ flexDirection: 'row', gap: s(8) }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: s(8), backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: s(9), paddingHorizontal: s(10), paddingVertical: s(9) }}>
                    <Search size={s(14)} color={colors.muted} />
                    <TextInput
                      value={query}
                      onChangeText={handleQueryChange}
                      placeholder="Name or phone…"
                      placeholderTextColor={colors.muted}
                      style={{ flex: 1, fontSize: s(13), color: colors.heading }}
                      onSubmitEditing={() => runSearch(query)}
                      returnKeyType="search"
                      autoFocus
                    />
                    {query ? <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); if (searchTimer.current) clearTimeout(searchTimer.current) }}><X size={s(14)} color={colors.muted} /></TouchableOpacity> : null}
                    {searching && <ActivityIndicator color={colors.teal} size="small" />}
                  </View>
                </View>
              </View>
            </View>

            {searchResults.length > 0 && (
              <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: s(12), overflow: 'hidden' }}>
                {searchResults.map((cust, idx) => (
                  <TouchableOpacity
                    key={cust.id}
                    onPress={() => handleSelectCustomer(cust)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: s(12),
                      paddingHorizontal: s(14), paddingVertical: s(12),
                      borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border,
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: s(36), height: s(36), borderRadius: s(18), backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.teal }}>{(cust.name ?? '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: s(13), fontWeight: '600', color: colors.heading }}>{cust.name ?? 'Unknown'}</Text>
                      <Text style={{ fontSize: s(11), color: colors.muted }}>{cust.phone ?? '—'} · {cust.visits ?? 0} visits · ${(cust.lifetime_spend ?? 0).toFixed(0)} spent</Text>
                    </View>
                    <ChevronLeft size={s(14)} color={colors.muted} style={{ transform: [{ rotate: '180deg' }] }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!searching && query.trim() && searchResults.length === 0 && (
              <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: s(12), padding: s(20), alignItems: 'center', gap: s(8) }}>
                <Users size={s(24)} color={colors.muted} />
                <Text style={{ fontSize: s(13), color: colors.muted }}>No customers found</Text>
              </View>
            )}
          </>
        )}

        {/* ── Step 2: Select Program ── */}
        {step === 'select-program' && selectedCustomer && (
          <>
            {/* Customer summary */}
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: s(12), padding: s(12), flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
              <View style={{ width: s(36), height: s(36), borderRadius: s(18), backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.teal }}>{(selectedCustomer.name ?? '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: s(13), fontWeight: '600', color: colors.heading }}>{selectedCustomer.name ?? 'Unknown'}</Text>
                <Text style={{ fontSize: s(11), color: colors.muted }}>{selectedCustomer.phone ?? '—'}</Text>
              </View>
              <TouchableOpacity onPress={handleReset} style={{ padding: s(6) }}>
                <X size={s(14)} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {/* Program list */}
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: s(14), overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: s(14), paddingVertical: s(9), backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: s(11), fontWeight: '700', color: colors.label, textTransform: 'uppercase', letterSpacing: 0.8 }}>Select Program</Text>
              </View>

              {loadingPrograms ? (
                <View style={{ padding: s(20), alignItems: 'center' }}><ActivityIndicator color={colors.teal} size="small" /></View>
              ) : programs.length === 0 ? (
                <View style={{ padding: s(20), alignItems: 'center', gap: s(8) }}>
                  <Award size={s(24)} color={colors.muted} />
                  <Text style={{ fontSize: s(13), color: colors.muted }}>No active programs</Text>
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
                        flexDirection: 'row', alignItems: 'center', gap: s(12),
                        paddingHorizontal: s(14), paddingVertical: s(12),
                        borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.border,
                        backgroundColor: selected ? accent + '10' : 'transparent',
                        opacity: enrolled ? 0.5 : 1,
                      }}
                    >
                      <View style={{ width: s(34), height: s(34), borderRadius: s(9), backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <ProgramIcon type={prog.program_type} size={s(15)} color={accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), marginBottom: s(2) }}>
                          <Text style={{ fontSize: s(13), fontWeight: '600', color: colors.heading }}>{prog.name}</Text>
                          <View style={{ paddingHorizontal: s(7), paddingVertical: s(2), borderRadius: 999, backgroundColor: colors.info + '15' }}>
                            <Text style={{ fontSize: s(10), fontWeight: '600', color: colors.info }}>{PROGRAM_TYPE_LABELS[prog.program_type] ?? prog.program_type}</Text>
                          </View>
                          {enrolled && (
                            <View style={{ paddingHorizontal: s(7), paddingVertical: s(2), borderRadius: 999, backgroundColor: colors.success + '15' }}>
                              <Text style={{ fontSize: s(10), fontWeight: '600', color: colors.success }}>Enrolled</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: s(11), color: colors.muted }}>{prog.reward_description}</Text>
                        {prog.program_type === 'points' && prog.points_per_dollar != null && (
                          <Text style={{ fontSize: s(10), color: colors.label, marginTop: s(2) }}>{prog.points_per_dollar} pts / $1 spent</Text>
                        )}
                        {prog.program_type === 'visits' && prog.visits_required != null && (
                          <Text style={{ fontSize: s(10), color: colors.label, marginTop: s(2) }}>Reward every {prog.visits_required} visits</Text>
                        )}
                        {prog.program_type === 'punch' && prog.punches_required != null && (
                          <Text style={{ fontSize: s(10), color: colors.label, marginTop: s(2) }}>{prog.punches_required} punches to reward</Text>
                        )}
                      </View>
                      <View style={{ width: s(22), height: s(22), borderRadius: s(11), borderWidth: 2, borderColor: selected ? accent : colors.border, backgroundColor: selected ? accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {selected && <Check size={s(12)} color={colors.onSolid} />}
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
                paddingVertical: s(13), borderRadius: s(10), alignItems: 'center',
                backgroundColor: selectedProgram && !enrolling ? colors.teal : colors.teal + '40',
                marginTop: s(4),
              }}
            >
              {enrolling
                ? <ActivityIndicator color={colors.onSolid} size="small" />
                : <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.onSolid }}>Enroll in Program</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 3: Done ── */}
        {step === 'done' && selectedCustomer && selectedProgram && (
          <View style={{ backgroundColor: colors.success + '10', borderWidth: 1, borderColor: colors.success + '40', borderRadius: s(14), padding: s(28), alignItems: 'center', gap: s(12) }}>
            <View style={{ width: s(52), height: s(52), borderRadius: s(26), backgroundColor: colors.success + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={s(24)} color={colors.success} />
            </View>
            <Text style={{ fontSize: s(16), fontWeight: '700', color: colors.success }}>Enrolled!</Text>
            <Text style={{ fontSize: s(13), color: colors.label, textAlign: 'center', lineHeight: s(20) }}>
              <Text style={{ fontWeight: '600', color: colors.heading }}>{selectedCustomer.name}</Text>
              {' '}has been enrolled in{' '}
              <Text style={{ fontWeight: '600', color: colors.heading }}>{selectedProgram.name}</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: s(8), marginTop: s(4) }}>
              <TouchableOpacity
                onPress={handleReset}
                style={{ paddingHorizontal: s(14), paddingVertical: s(8), backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '40', borderRadius: s(8) }}
              >
                <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.teal }}>Enroll Another</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ paddingHorizontal: s(14), paddingVertical: s(8), backgroundColor: colors.success + '20', borderWidth: 1, borderColor: colors.success + '40', borderRadius: s(8) }}
              >
                <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.success }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  )
}
