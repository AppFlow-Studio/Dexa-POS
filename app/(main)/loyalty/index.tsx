import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import type { Database } from '@/database.types'
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Gift,
  Plus,
  RefreshCw,
  Search,
  Star,
  Tag,
  TrendingUp,
  Users,
  X,
  Zap,
  Check,
  AlertCircle,
} from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useToast } from '@/contexts/ToastContext'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'programs' | 'customers' | 'redeem'

type LoyaltyProgram = Database['public']['Tables']['loyalty_programs']['Row']

type LoyaltyEnrollment = Database['public']['Tables']['loyalty_enrollments']['Row'] & {
  customer?: {
    id: string
    name: string | null
    phone: string | null
    last_visit: string | null
    lifetime_spend: number | null
    visits: number | null
  } | null
  program?: Pick<LoyaltyProgram, 'name' | 'program_type' | 'visits_required' | 'punches_required' | 'points_redemption_threshold' | 'reward_description' | 'display_color' | 'display_icon'> | null
}

type LoyaltyReward = Database['public']['Tables']['loyalty_rewards']['Row']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTierFromPoints(pts: number): string {
  if (pts >= 2000) return 'Platinum'
  if (pts >= 1000) return 'Gold'
  if (pts >= 500)  return 'Silver'
  return 'Bronze'
}

const TIER_CONFIG: Record<string, { color: string; bg: string }> = {
  Bronze:   { color: '#CD7F32', bg: '#CD7F3220' },
  Silver:   { color: '#A0AEC0', bg: '#A0AEC020' },
  Gold:     { color: '#FBBF24', bg: '#FBBF2420' },
  Platinum: { color: colors.teal, bg: colors.teal + '20' },
}

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  points: 'Points',
  visits: 'Visits',
  punch:  'Punch Card',
}

function relativeDate(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function progressForEnrollment(e: LoyaltyEnrollment): { current: number; target: number; label: string } | null {
  const prog = e.program
  if (!prog) return null
  if (prog.program_type === 'visits' && prog.visits_required) {
    return { current: e.current_visits, target: prog.visits_required, label: 'visits' }
  }
  if (prog.program_type === 'punch' && prog.punches_required) {
    return { current: e.current_punches, target: prog.punches_required, label: 'punches' }
  }
  if (prog.program_type === 'points' && prog.points_redemption_threshold) {
    return { current: e.current_points, target: prog.points_redemption_threshold, label: 'points' }
  }
  return null
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({ icon, label, value, sub }) => (
  <View style={{
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 12, borderTopWidth: 2, borderTopColor: colors.teal,
  }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '600', color: colors.label, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{label}</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.heading, lineHeight: 24 }} numberOfLines={1}>{value}</Text>
        {sub ? <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.teal + '15', alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
        {icon}
      </View>
    </View>
  </View>
)

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; action?: React.ReactNode }> = ({ icon, title, action }) => (
  <View style={{
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border,
  }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: colors.teal + '18', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>{title}</Text>
    </View>
    {action}
  </View>
)

const SectionCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ icon, title, children, action }) => (
  <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
    <SectionHeader icon={icon} title={title} action={action} />
    <View style={{ padding: 12 }}>{children}</View>
  </View>
)

const StatusBadge: React.FC<{ active: boolean }> = ({ active }) => (
  <View style={{
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    backgroundColor: active ? colors.success + '20' : colors.muted + '20',
    borderWidth: 1, borderColor: active ? colors.success + '50' : colors.muted + '40',
  }}>
    <Text style={{ fontSize: 11, fontWeight: '600', color: active ? colors.success : colors.muted }}>
      {active ? 'Active' : 'Inactive'}
    </Text>
  </View>
)

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => {
  const cfg = TIER_CONFIG[tier] ?? { color: colors.muted, bg: colors.muted + '15' }
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: cfg.bg }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: cfg.color }}>{tier}</Text>
    </View>
  )
}

const TypeBadge: React.FC<{ type: string }> = ({ type }) => (
  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: colors.info + '15', borderWidth: 1, borderColor: colors.info + '30' }}>
    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.info }}>{PROGRAM_TYPE_LABELS[type] ?? type}</Text>
  </View>
)

const ProgramIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 13 }) => {
  if (type === 'points') return <Star size={size} color={colors.teal} />
  if (type === 'punch')  return <Zap size={size} color={colors.teal} />
  return <TrendingUp size={size} color={colors.teal} />
}

const Divider = () => <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />

const EmptyState: React.FC<{ icon: React.ReactNode; text: string; action?: React.ReactNode }> = ({ icon, text, action }) => (
  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 10 }}>
    {icon}
    <Text style={{ fontSize: 13, color: colors.muted }}>{text}</Text>
    {action}
  </View>
)

const Loader = () => (
  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
    <ActivityIndicator color={colors.teal} size="small" />
  </View>
)

const ProgressBar: React.FC<{ current: number; target: number; color?: string }> = ({ current, target, color = colors.teal }) => {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  return (
    <View style={{ height: 5, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ height: '100%', borderRadius: 4, backgroundColor: color, width: `${pct}%` }} />
    </View>
  )
}

const TealButton: React.FC<{ label: string; icon?: React.ReactNode; onPress: () => void; small?: boolean }> = ({ label, icon, onPress, small }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: small ? 10 : 12, paddingVertical: small ? 5 : 7,
      backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', borderRadius: 8,
    }}
  >
    {icon}
    <Text style={{ fontSize: small ? 11 : 12, fontWeight: '600', color: colors.teal }}>{label}</Text>
  </TouchableOpacity>
)

// ─── Tab: Overview ────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ programs: LoyaltyProgram[]; enrollments: LoyaltyEnrollment[]; loading: boolean }> = ({ programs, enrollments, loading }) => {
  if (loading) return <Loader />

  const totalEnrolled    = enrollments.length
  const totalRedeemed    = enrollments.reduce((s, e) => s + (e.total_rewards_redeemed ?? 0), 0)
  const totalEarned      = enrollments.reduce((s, e) => s + (e.total_rewards_earned ?? 0), 0)
  const redemptionRate   = totalEarned > 0 ? Math.round((totalRedeemed / totalEarned) * 100) : 0
  const activePrograms   = programs.filter(p => p.is_active).length

  const topMembers = [...enrollments]
    .sort((a, b) => (b.lifetime_points + b.lifetime_visits + b.lifetime_punches) - (a.lifetime_points + a.lifetime_visits + a.lifetime_punches))
    .slice(0, 6)

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatCard icon={<Users size={14} color={colors.teal} />}      label="Total Enrolled"   value={totalEnrolled.toLocaleString()} />
        <StatCard icon={<Award size={14} color={colors.teal} />}      label="Active Programs"  value={activePrograms.toString()} />
        <StatCard icon={<Gift size={14} color={colors.teal} />}       label="Rewards Redeemed" value={totalRedeemed.toString()} />
        <StatCard icon={<TrendingUp size={14} color={colors.teal} />} label="Redemption Rate"  value={`${redemptionRate}%`} />
      </View>

      {programs.length > 0 && (
        <SectionCard title="Program Performance" icon={<Award size={13} color={colors.teal} />}>
          {programs.map((prog, idx) => {
            const progEnrollments = enrollments.filter(e => e.program_id === prog.id)
            const progRedeemed    = progEnrollments.reduce((s, e) => s + (e.total_rewards_redeemed ?? 0), 0)
            const progEarned      = progEnrollments.reduce((s, e) => s + (e.total_rewards_earned ?? 0), 0)
            const rate            = progEarned > 0 ? Math.round((progRedeemed / progEarned) * 100) : 0
            return (
              <View key={prog.id}>
                {idx > 0 && <Divider />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: (prog.display_color ?? colors.teal) + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <ProgramIcon type={prog.program_type} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{prog.name}</Text>
                      <TypeBadge type={prog.program_type} />
                      {!prog.is_active && <StatusBadge active={false} />}
                    </View>
                    <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>{prog.reward_description}</Text>
                    <ProgressBar current={progRedeemed} target={Math.max(progEarned, 1)} color={prog.display_color ?? colors.teal} />
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>{progEnrollments.length}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>enrolled</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: prog.display_color ?? colors.teal }}>{rate}%</Text>
                  </View>
                </View>
              </View>
            )
          })}
        </SectionCard>
      )}

      {topMembers.length > 0 && (
        <SectionCard title="Top Members" icon={<Star size={13} color={colors.teal} />}>
          {topMembers.map((e, idx) => {
            const cust = e.customer
            const prog = e.program
            const tier = getTierFromPoints(e.lifetime_points)
            const progress = progressForEnrollment(e)
            return (
              <View key={e.id}>
                {idx > 0 && <Divider />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>{(cust?.name ?? '?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{cust?.name ?? 'Unknown'}</Text>
                      {e.program?.program_type === 'points' && <TierBadge tier={tier} />}
                    </View>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{prog?.name ?? '—'} · {relativeDate(e.last_earn_at)}</Text>
                    {progress && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <ProgressBar current={progress.current} target={progress.target} />
                        <Text style={{ fontSize: 10, color: colors.muted, minWidth: 60 }}>{progress.current}/{progress.target} {progress.label}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {e.current_points > 0  && <Text style={{ fontSize: 12, fontWeight: '700', color: colors.heading }}>{e.current_points.toLocaleString()} pts</Text>}
                    {e.current_visits > 0  && <Text style={{ fontSize: 12, fontWeight: '700', color: colors.heading }}>{e.current_visits} visits</Text>}
                    {e.current_punches > 0 && <Text style={{ fontSize: 12, fontWeight: '700', color: colors.heading }}>{e.current_punches} punches</Text>}
                  </View>
                </View>
              </View>
            )
          })}
        </SectionCard>
      )}

      {programs.length === 0 && enrollments.length === 0 && (
        <EmptyState icon={<Award size={28} color={colors.muted} />} text="No loyalty data yet" />
      )}
    </ScrollView>
  )
}

// ─── Tab: Programs ────────────────────────────────────────────────────────────

const ProgramsTab: React.FC<{
  programs: LoyaltyProgram[]
  enrollments: LoyaltyEnrollment[]
  loading: boolean
  onAdd: () => void
  onEdit: (prog: LoyaltyProgram) => void
}> = ({ programs, enrollments, loading, onAdd, onEdit }) => {
  if (loading) return <Loader />

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <TealButton label="New Program" icon={<Plus size={13} color={colors.teal} />} onPress={onAdd} />
      </View>

      {programs.length === 0 && (
        <EmptyState
          icon={<Star size={28} color={colors.muted} />}
          text="No loyalty programs yet"
          action={<TealButton label="Create First Program" onPress={onAdd} />}
        />
      )}

      {programs.map((prog) => {
        const progEnrollments = enrollments.filter(e => e.program_id === prog.id)
        const progRedeemed    = progEnrollments.reduce((s, e) => s + (e.total_rewards_redeemed ?? 0), 0)
        const progEarned      = progEnrollments.reduce((s, e) => s + (e.total_rewards_earned ?? 0), 0)
        const rate            = progEarned > 0 ? Math.round((progRedeemed / progEarned) * 100) : 0
        const accent          = prog.display_color ?? colors.teal

        return (
          <View key={prog.id} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' }}>
            {/* Color accent top bar */}
            <View style={{ height: 3, backgroundColor: accent }} />

            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 14, paddingVertical: 10,
              backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <ProgramIcon type={prog.program_type} />
                </View>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>{prog.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <TypeBadge type={prog.program_type} />
                    <StatusBadge active={!!prog.is_active} />
                  </View>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => onEdit(prog)}
                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '30' }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 14, gap: 12 }}>
              {prog.description ? (
                <Text style={{ fontSize: 12, color: colors.muted }}>{prog.description}</Text>
              ) : null}

              {/* Reward description */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: accent + '10', borderWidth: 1, borderColor: accent + '30', borderRadius: 10, padding: 10 }}>
                <Gift size={14} color={accent} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: accent, flex: 1 }}>{prog.reward_description}</Text>
                {prog.reward_value != null && (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>
                    {prog.reward_type === 'discount_percent' ? `${prog.reward_value}% off` :
                     prog.reward_type === 'discount_fixed'   ? `$${prog.reward_value} off`  : prog.reward_type}
                  </Text>
                )}
              </View>

              {/* Program rules */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {prog.program_type === 'points' && prog.points_per_dollar != null && (
                  <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 11, color: colors.label }}><Text style={{ fontWeight: '700', color: colors.heading }}>{prog.points_per_dollar}</Text> pts / $1</Text>
                  </View>
                )}
                {prog.program_type === 'points' && prog.points_redemption_threshold != null && (
                  <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 11, color: colors.label }}>Redeem at <Text style={{ fontWeight: '700', color: colors.heading }}>{prog.points_redemption_threshold}</Text> pts</Text>
                  </View>
                )}
                {prog.program_type === 'visits' && prog.visits_required != null && (
                  <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 11, color: colors.label }}>Every <Text style={{ fontWeight: '700', color: colors.heading }}>{prog.visits_required}</Text> visits</Text>
                  </View>
                )}
                {prog.program_type === 'punch' && prog.punches_required != null && (
                  <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 11, color: colors.label }}><Text style={{ fontWeight: '700', color: colors.heading }}>{prog.punches_required}</Text> punches to reward</Text>
                  </View>
                )}
                {prog.min_order_amount != null && (
                  <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 11, color: colors.label }}>Min order <Text style={{ fontWeight: '700', color: colors.heading }}>${prog.min_order_amount}</Text></Text>
                  </View>
                )}
                {prog.reward_expiry_days != null && (
                  <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 11, color: colors.label }}>Expires in <Text style={{ fontWeight: '700', color: colors.heading }}>{prog.reward_expiry_days}d</Text></Text>
                  </View>
                )}
                {prog.auto_enroll && (
                  <View style={{ backgroundColor: colors.success + '15', borderWidth: 1, borderColor: colors.success + '30', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 11, color: colors.success, fontWeight: '600' }}>Auto-enroll</Text>
                  </View>
                )}
              </View>

              {/* Stats row */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { label: 'Enrolled', value: progEnrollments.length.toString() },
                  { label: 'Earned',   value: progEarned.toString() },
                  { label: 'Redeemed', value: progRedeemed.toString() },
                  { label: 'Rate',     value: `${rate}%`, accent: true },
                ].map(s => (
                  <View key={s.label} style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{s.label}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: s.accent ? accent : colors.heading }}>{s.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

// ─── Tab: Customers ───────────────────────────────────────────────────────────

const CustomersTab: React.FC<{
  enrollments: LoyaltyEnrollment[]
  programs: LoyaltyProgram[]
  loading: boolean
  onEnroll: () => void
}> = ({ enrollments, programs, loading, onEnroll }) => {
  const [search, setSearch]       = useState('')
  const [progFilter, setProgFilter] = useState<string | null>(null)

  const filtered = enrollments.filter(e => {
    const name   = e.customer?.name ?? ''
    const phone  = e.customer?.phone ?? ''
    const matchS = !search || name.toLowerCase().includes(search.toLowerCase()) || phone.includes(search)
    const matchP = !progFilter || e.program_id === progFilter
    return matchS && matchP
  })

  if (loading) return <Loader />

  return (
    <View style={{ flex: 1, gap: 10 }}>
      {/* Search */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 }}>
        <Search size={14} color={colors.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search name or phone…" placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 13, color: colors.heading }} />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><X size={14} color={colors.muted} /></TouchableOpacity> : null}
      </View>

      {/* Program filter pills */}
      {programs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
          {[{ id: null, name: 'All' }, ...programs.map(p => ({ id: p.id, name: p.name }))].map(p => {
            const active = progFilter === p.id
            return (
              <TouchableOpacity key={p.id ?? 'all'} onPress={() => setProgFilter(p.id)}
                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: active ? colors.teal : colors.screen, borderWidth: 1, borderColor: active ? colors.teal : colors.border }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? colors.onSolid : colors.label }}>{p.name}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20, gap: 8 }}>
        <TouchableOpacity onPress={onEnroll} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.teal + '10', borderWidth: 1, borderColor: colors.teal + '30', borderRadius: 12, marginBottom: 4 }}>
          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={14} color={colors.teal} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>Enroll New Customer</Text>
        </TouchableOpacity>

        {filtered.map((e) => {
          const cust     = e.customer
          const prog     = e.program
          const tier     = getTierFromPoints(e.lifetime_points)
          const progress = progressForEnrollment(e)
          return (
            <View key={e.id} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}>{(cust?.name ?? '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{cust?.name ?? 'Unknown'}</Text>
                    {e.program?.program_type === 'points' && <TierBadge tier={tier} />}
                  </View>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{cust?.phone ?? '—'} · {prog?.name ?? '—'} · {relativeDate(e.last_earn_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {e.current_points > 0  && <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>{e.current_points.toLocaleString()} pts</Text>}
                  {e.current_visits > 0  && <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>{e.current_visits} visits</Text>}
                  {e.current_punches > 0 && <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>{e.current_punches} punches</Text>}
                  <Text style={{ fontSize: 10, color: colors.muted }}>${(cust?.lifetime_spend ?? 0).toFixed(0)} spent</Text>
                </View>
              </View>
              {progress && (
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={{ fontSize: 10, color: colors.muted }}>{progress.current} / {progress.target} {progress.label}</Text>
                    <Text style={{ fontSize: 10, color: colors.teal, fontWeight: '600' }}>
                      {progress.current >= progress.target ? '🎉 Reward ready!' : `${progress.target - progress.current} more to reward`}
                    </Text>
                  </View>
                  <ProgressBar current={progress.current} target={progress.target} />
                </View>
              )}
            </View>
          )
        })}

        {filtered.length === 0 && (
          <EmptyState icon={<Users size={28} color={colors.muted} />} text="No enrolled customers found" />
        )}
      </ScrollView>
    </View>
  )
}

// ─── Tab: Redeem ──────────────────────────────────────────────────────────────

const RedeemTab: React.FC<{ merchantId: string }> = ({ merchantId }) => {
  const supabase    = useSupabaseClient()
  const { show }    = useToast()
  const [phone, setPhone]             = useState('')
  const [searching, setSearching]     = useState(false)
  const [searched, setSearched]       = useState(false)
  const [enrollments, setEnrollments] = useState<LoyaltyEnrollment[]>([])
  const [rewards, setRewards]         = useState<LoyaltyReward[]>([])
  const [redeeming, setRedeeming]     = useState<string | null>(null)
  const [redeemed, setRedeemed]       = useState<LoyaltyReward | null>(null)
  const [customer, setCustomer]       = useState<LoyaltyEnrollment['customer'] | null>(null)

  const handleLookup = async () => {
    const raw = phone.trim()
    if (!raw) return
    setSearching(true)
    setSearched(false)
    setEnrollments([])
    setRewards([])
    setCustomer(null)
    setRedeemed(null)

    try {
      const digits = raw.replace(/\D/g, '').slice(-10)
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, phone, last_visit, lifetime_spend, visits')
        .eq('merchant_id', merchantId)
        .or(`phone.ilike.%${digits}%,phone.ilike.%${raw}%`)
        .limit(1)

      const cust = customers?.[0] ?? null
      setCustomer(cust)
      if (!cust) { setSearched(true); setSearching(false); return }

      const [{ data: enrolData }, { data: rewardData }] = await Promise.all([
        supabase
          .from('loyalty_enrollments')
          .select('*, program:loyalty_programs(name, program_type, visits_required, punches_required, points_redemption_threshold, reward_description, display_color, display_icon)')
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

      setEnrollments((enrolData ?? []) as LoyaltyEnrollment[])
      setRewards((rewardData ?? []) as LoyaltyReward[])
    } finally {
      setSearched(true)
      setSearching(false)
    }
  }

  const handleRedeem = async (reward: LoyaltyReward) => {
    setRedeeming(reward.id)
    try {
      const { error } = await supabase
        .from('loyalty_rewards')
        .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
        .eq('id', reward.id)

      if (error) {
        show({ title: 'Error', message: 'Failed to redeem reward', type: 'error' })
        return
      }
      setRedeemed(reward)
      setRewards(prev => prev.filter(r => r.id !== reward.id))
    } finally {
      setRedeeming(null)
    }
  }

  const handleReset = () => {
    setPhone(''); setSearched(false); setEnrollments([])
    setRewards([]); setCustomer(null); setRedeemed(null)
  }

  const totalPoints  = enrollments.reduce((s, e) => s + (e.current_points ?? 0), 0)
  const totalVisits  = enrollments.reduce((s, e) => s + (e.current_visits ?? 0), 0)
  const totalPunches = enrollments.reduce((s, e) => s + (e.current_punches ?? 0), 0)

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20, gap: 12 }}>

      {/* Lookup */}
      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' }}>
        <SectionHeader icon={<Search size={13} color={colors.teal} />} title="Customer Lookup" />
        <View style={{ padding: 14, gap: 10 }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>Enter phone number to find a loyalty account</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9 }}>
              <Search size={14} color={colors.muted} />
              <TextInput
                value={phone} onChangeText={setPhone}
                placeholder="(555) 000-0000" placeholderTextColor={colors.muted}
                keyboardType="phone-pad" style={{ flex: 1, fontSize: 14, color: colors.heading }}
                onSubmitEditing={handleLookup}
              />
              {phone ? <TouchableOpacity onPress={handleReset}><X size={14} color={colors.muted} /></TouchableOpacity> : null}
            </View>
            <TouchableOpacity
              onPress={handleLookup} disabled={searching || !phone.trim()}
              style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', borderRadius: 9, alignItems: 'center', justifyContent: 'center', minWidth: 84 }}
            >
              {searching ? <ActivityIndicator color={colors.teal} size="small" /> : <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>Look Up</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* No account */}
      {searched && !customer && (
        <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 20, alignItems: 'center', gap: 10 }}>
          <AlertCircle size={24} color={colors.muted} />
          <Text style={{ fontSize: 13, color: colors.muted }}>No loyalty account found for that number</Text>
        </View>
      )}

      {/* Success */}
      {redeemed && (
        <View style={{ backgroundColor: colors.success + '10', borderWidth: 1, borderColor: colors.success + '40', borderRadius: 14, padding: 20, alignItems: 'center', gap: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={20} color={colors.success} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.success }}>Reward Redeemed!</Text>
          <Text style={{ fontSize: 13, color: colors.label, textAlign: 'center' }}>
            <Text style={{ fontWeight: '600', color: colors.heading }}>{redeemed.reward_description}</Text>
            {' '}applied for{' '}
            <Text style={{ fontWeight: '600', color: colors.heading }}>{customer?.name}</Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity onPress={handleReset} style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.success + '20', borderWidth: 1, borderColor: colors.success + '40', borderRadius: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.success }}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setRedeemed(null)}
              style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '30', borderRadius: 8 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>Redeem Another</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Customer profile */}
      {customer && !redeemed && (
        <>
          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.teal }}>{(customer.name ?? '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading, marginBottom: 2 }}>{customer.name ?? 'Unknown'}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{customer.phone} · {customer.visits ?? 0} visits · ${(customer.lifetime_spend ?? 0).toFixed(0)} lifetime</Text>
              </View>
              <TouchableOpacity onPress={handleReset} style={{ padding: 6 }}>
                <X size={14} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {/* Balances */}
            {(totalPoints > 0 || totalVisits > 0 || totalPunches > 0) && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {totalPoints  > 0 && <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Points</Text><Text style={{ fontSize: 18, fontWeight: '700', color: colors.teal }}>{totalPoints.toLocaleString()}</Text></View>}
                {totalVisits  > 0 && <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Visits</Text><Text style={{ fontSize: 18, fontWeight: '700', color: colors.teal }}>{totalVisits}</Text></View>}
                {totalPunches > 0 && <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Punches</Text><Text style={{ fontSize: 18, fontWeight: '700', color: colors.teal }}>{totalPunches}</Text></View>}
              </View>
            )}

            {/* Progress per enrollment */}
            {enrollments.map(e => {
              const progress = progressForEnrollment(e)
              if (!progress) return null
              const accent = (e.program as any)?.display_color ?? colors.teal
              return (
                <View key={e.id} style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.heading }}>{(e.program as any)?.name ?? 'Program'}</Text>
                    <Text style={{ fontSize: 11, color: progress.current >= progress.target ? colors.success : colors.muted }}>
                      {progress.current >= progress.target ? '🎉 Reward ready!' : `${progress.current}/${progress.target} ${progress.label}`}
                    </Text>
                  </View>
                  <ProgressBar current={progress.current} target={progress.target} color={accent} />
                </View>
              )
            })}
          </View>

          {/* Available rewards */}
          <SectionCard title="Available Rewards" icon={<Gift size={13} color={colors.teal} />}>
            {rewards.length === 0 ? (
              <EmptyState icon={<Gift size={22} color={colors.muted} />} text="No pending rewards to redeem" />
            ) : (
              <View style={{ gap: 8 }}>
                {rewards.map((reward) => {
                  const valueLabel =
                    reward.reward_type === 'discount_percent' ? `${reward.reward_value}% off` :
                    reward.reward_type === 'discount_fixed'   ? `$${reward.reward_value} off`  :
                    reward.reward_type
                  return (
                    <View key={reward.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.teal + '30', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.teal + '15', alignItems: 'center', justifyContent: 'center' }}>
                          <Tag size={14} color={colors.teal} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{reward.reward_description}</Text>
                          <Text style={{ fontSize: 11, color: colors.muted }}>
                            {valueLabel}
                            {reward.reward_max_value != null ? ` (max $${reward.reward_max_value})` : ''}
                            {reward.expires_at ? ` · exp. ${relativeDate(reward.expires_at)}` : ''}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRedeem(reward)}
                        disabled={redeeming === reward.id}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', marginLeft: 8 }}
                      >
                        {redeeming === reward.id
                          ? <ActivityIndicator color={colors.teal} size="small" />
                          : <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>Redeem</Text>}
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>
            )}
          </SectionCard>
        </>
      )}
    </ScrollView>
  )
}

// ─── Tabs config ──────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'programs',  label: 'Programs'  },
  { id: 'customers', label: 'Customers' },
  { id: 'redeem',    label: 'Redeem'    },
]

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LoyaltyScreen() {
  const router        = useRouter()
  const supabase      = useSupabaseClient()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const merchantId    = selectedStore?.merchant_id ?? ''

  const [activeTab,    setActiveTab]    = useState<TabId>('overview')
  const [programs,     setPrograms]     = useState<LoyaltyProgram[]>([])
  const [enrollments,  setEnrollments]  = useState<LoyaltyEnrollment[]>([])
  const [loading,      setLoading]      = useState(true)

  const loadData = useCallback(async () => {
    if (!merchantId) return
    setLoading(true)
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
      setPrograms((progsData ?? []) as LoyaltyProgram[])
      setEnrollments((enrolData ?? []) as LoyaltyEnrollment[])
    } finally {
      setLoading(false)
    }
  }, [merchantId, supabase])

  useEffect(() => { loadData() }, [loadData])

  const goToAddProgram = () => router.push('/loyalty/program-form' as any)
  const goToEditProgram = (prog: LoyaltyProgram) => router.push({ pathname: '/loyalty/program-form' as any, params: { id: prog.id } })
  const goToEnroll = () => router.push('/loyalty/enroll-customer' as any)

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 7, backgroundColor: colors.teal + '10', borderRadius: 10 }}>
          <ChevronLeft size={16} color={colors.teal} />
        </TouchableOpacity>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.teal + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Award size={14} color={colors.teal} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.heading, flex: 1 }}>Loyalty</Text>
        <TouchableOpacity onPress={loadData} style={{ padding: 7, backgroundColor: colors.teal + '10', borderRadius: 10 }}>
          <RefreshCw size={14} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 14 }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <TouchableOpacity key={tab.id} onPress={() => setActiveTab(tab.id)}
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: active ? colors.teal : 'transparent', marginRight: 4 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.teal : colors.label }}>{tab.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 12 }}>
        {activeTab === 'overview'  && <OverviewTab  programs={programs} enrollments={enrollments} loading={loading} />}
        {activeTab === 'programs'  && <ProgramsTab  programs={programs} enrollments={enrollments} loading={loading} onAdd={goToAddProgram} onEdit={goToEditProgram} />}
        {activeTab === 'customers' && <CustomersTab enrollments={enrollments} programs={programs} loading={loading} onEnroll={goToEnroll} />}
        {activeTab === 'redeem'    && <RedeemTab    merchantId={merchantId} />}
      </View>
    </View>
  )
}
