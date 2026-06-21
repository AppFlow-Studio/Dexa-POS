import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import {
  useLoyaltyDataStore,
  type LoyaltyEnrollment,
  type LoyaltyProgram,
  type LoyaltyReward
} from '@/stores/useLoyaltyDataStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useRouter } from 'expo-router'
import {
  AlertCircle,
  Award,
  Check,
  Clock,
  DollarSign,
  Gift,
  Plus,
  RefreshCw,
  Search,
  Star,
  Tag,
  TrendingUp,
  Users,
  X,
  Zap
} from 'lucide-react-native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'programs' | 'customers' | 'redeem'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  points: 'Points',
  visits: 'Visits',
  punch: 'Punch Card'
}

function relativeDate (iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function progressForEnrollment (
  e: LoyaltyEnrollment
): { current: number; target: number; label: string } | null {
  const prog = e.program
  if (!prog) return null
  if (prog.program_type === 'visits' && prog.visits_required)
    return {
      current: e.current_visits,
      target: prog.visits_required,
      label: 'visits'
    }
  if (prog.program_type === 'punch' && prog.punches_required)
    return {
      current: e.current_punches,
      target: prog.punches_required,
      label: 'punches'
    }
  if (prog.program_type === 'points' && prog.points_redemption_threshold)
    return {
      current: e.current_points,
      target: prog.points_redemption_threshold,
      label: 'points'
    }
  return null
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}> = ({ icon, label, value, sub }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View
    style={{
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: s(12),
      padding: s(12),
      borderTopWidth: 2,
      borderTopColor: colors.teal
    }}
  >
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between'
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: s(10),
            fontWeight: '600',
            color: colors.label,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: s(5)
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: s(20),
            fontWeight: '700',
            color: colors.heading,
            lineHeight: s(24)
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
        {sub ? (
          <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(2) }}>
            {sub}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: s(30),
          height: s(30),
          borderRadius: s(8),
          backgroundColor: colors.teal + '15',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: s(8)
        }}
      >
        {icon}
      </View>
    </View>
  </View>
  )
}

const SectionHeader: React.FC<{
  icon: React.ReactNode
  title: string
  action?: React.ReactNode
}> = ({ icon, title, action }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: s(14),
      paddingVertical: s(10),
      backgroundColor: colors.panel,
      borderBottomWidth: 1,
      borderBottomColor: colors.border
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
      <View
        style={{
          width: s(26),
          height: s(26),
          borderRadius: s(7),
          backgroundColor: colors.teal + '18',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {icon}
      </View>
      <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}>
        {title}
      </Text>
    </View>
    {action}
  </View>
  )
}

const SectionCard: React.FC<{
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}> = ({ icon, title, children, action }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View
    style={{
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: s(14),
      overflow: 'hidden',
      marginBottom: s(12)
    }}
  >
    <SectionHeader icon={icon} title={title} action={action} />
    <View style={{ padding: s(12) }}>{children}</View>
  </View>
  )
}

// Fix #5 — TypeBadge is teal
const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View
    style={{
      paddingHorizontal: s(8),
      paddingVertical: s(3),
      borderRadius: 999,
      backgroundColor: colors.teal + '15',
      borderWidth: 1,
      borderColor: colors.teal + '30'
    }}
  >
    <Text style={{ fontSize: s(11), fontWeight: '600', color: colors.teal }}>
      {PROGRAM_TYPE_LABELS[type] ?? type}
    </Text>
  </View>
  )
}

const StatusBadge: React.FC<{ active: boolean }> = ({ active }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View
    style={{
      paddingHorizontal: s(8),
      paddingVertical: s(3),
      borderRadius: 999,
      backgroundColor: active ? colors.teal + '20' : colors.muted + '20',
      borderWidth: 1,
      borderColor: active ? colors.teal + '50' : colors.muted + '40'
    }}
  >
    <Text
      style={{
        fontSize: s(11),
        fontWeight: '600',
        color: active ? colors.teal : colors.muted
      }}
    >
      {active ? 'Active' : 'Inactive'}
    </Text>
  </View>
  )
}

const ProgramIcon: React.FC<{
  type: string
  size?: number
  color?: string
}> = ({ type, size = 13, color = colors.teal }) => {
  if (type === 'points') return <Star size={size} color={color} />
  if (type === 'punch') return <Zap size={size} color={color} />
  return <TrendingUp size={size} color={color} />
}

const EmptyState: React.FC<{
  icon: React.ReactNode
  text: string
  action?: React.ReactNode
}> = ({ icon, text, action }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View style={{ alignItems: 'center', paddingVertical: s(32), gap: s(10) }}>
    {icon}
    <Text style={{ fontSize: s(13), color: colors.muted }}>{text}</Text>
    {action}
  </View>
  )
}

const Loader = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View style={{ alignItems: 'center', paddingVertical: s(40) }}>
    <ActivityIndicator color={colors.teal} size='small' />
  </View>
  )
}

const ProgressBar: React.FC<{
  current: number
  target: number
  color?: string
}> = ({ current, target, color = colors.teal }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  return (
    <View
      style={{
        height: s(5),
        backgroundColor: colors.border,
        borderRadius: s(4),
        overflow: 'hidden'
      }}
    >
      <View
        style={{
          height: '100%',
          borderRadius: s(4),
          backgroundColor: color,
          width: `${pct}%`
        }}
      />
    </View>
  )
}

const TealButton: React.FC<{
  label: string
  icon?: React.ReactNode
  onPress: () => void
}> = ({ label, icon, onPress }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(6),
      paddingHorizontal: s(12),
      paddingVertical: s(7),
      backgroundColor: colors.teal + '20',
      borderWidth: 1,
      borderColor: colors.teal + '50',
      borderRadius: s(8)
    }}
  >
    {icon}
    <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.teal }}>
      {label}
    </Text>
  </TouchableOpacity>
  )
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{
  programs: LoyaltyProgram[]
  enrollments: LoyaltyEnrollment[]
  loading: boolean
}> = ({ programs, enrollments, loading }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  if (loading) return <Loader />

  const totalEnrolled = enrollments.length
  // Fix #1 — only 1 active program, show its name in stat
  const activeProgram = programs.find(p => p.is_active) ?? null
  // Fix #3 — rewards redeemed comes from loyalty_rewards not enrollments counters (which stay 0)
  // Use total_reward_value as a proxy for engagement instead, or show avg spend
  const avgSpend =
    enrollments.length > 0
      ? enrollments.reduce((s, e) => s + (e.customer?.lifetime_spend ?? 0), 0) /
        enrollments.length
      : 0

  // Fix #4 — top members: score by total activity (lifetime_points + lifetime_visits*10 + lifetime_punches*10)
  const topMembers = [...enrollments]
    .sort((a, b) => {
      const scoreB =
        b.lifetime_points +
        b.lifetime_visits * 10 +
        b.lifetime_punches * 10 +
        (b.customer?.lifetime_spend ?? 0)
      const scoreA =
        a.lifetime_points +
        a.lifetime_visits * 10 +
        a.lifetime_punches * 10 +
        (a.customer?.lifetime_spend ?? 0)
      return scoreB - scoreA
    })
    .slice(0, 6)

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 20, gap: 12 }}
    >
      {/* Fix #2 — removed "Active Programs" card, replaced with Avg Spend */}
      <View style={{ flexDirection: 'row', gap: s(10) }}>
        <StatCard
          icon={<Users size={s(14)} color={colors.teal} />}
          label='Total Enrolled'
          value={totalEnrolled.toLocaleString()}
          sub={activeProgram ? activeProgram.name : undefined}
        />
        <StatCard
          icon={<DollarSign size={s(14)} color={colors.teal} />}
          label='Avg Lifetime Spend'
          value={`$${avgSpend.toFixed(0)}`}
          sub='per member'
        />
        <StatCard
          icon={<Clock size={s(14)} color={colors.teal} />}
          label='Active Since'
          value={activeProgram ? relativeDate(activeProgram.created_at) : '—'}
          sub={
            activeProgram?.program_type
              ? PROGRAM_TYPE_LABELS[activeProgram.program_type]
              : undefined
          }
        />
        <StatCard
          icon={<Gift size={s(14)} color={colors.teal} />}
          label='Total Rewards'
          value={enrollments
            .reduce((s, e) => s + (e.total_rewards_earned ?? 0), 0)
            .toString()}
          sub='lifetime earned'
        />
      </View>

      {topMembers.length > 0 && (
        <View style={{ gap: s(6), marginBottom: s(12) }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(8),
              marginBottom: s(2)
            }}
          >
            <View
              style={{
                width: s(26),
                height: s(26),
                borderRadius: s(7),
                backgroundColor: colors.teal + '18',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Star size={s(13)} color={colors.teal} />
            </View>
            <Text
              style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}
            >
              Top Members
            </Text>
          </View>

          {topMembers.map((e, idx) => {
            const cust = e.customer
            const prog = e.program
            const accent = colors.teal
            const progress = progressForEnrollment(e)
            const pct = progress
              ? Math.min(
                  Math.round((progress.current / progress.target) * 100),
                  100
                )
              : null
            const rewardReady = pct === 100

            const stats: string[] = []
            if (e.lifetime_visits >= 1)
              stats.push(`${e.lifetime_visits} visits`)
            if (e.lifetime_points >= 1)
              stats.push(`${e.lifetime_points.toLocaleString()} pts`)
            if (e.lifetime_punches >= 1)
              stats.push(`${e.lifetime_punches} punches`)
            if ((cust?.lifetime_spend ?? 0) >= 1)
              stats.push(`$${(cust?.lifetime_spend ?? 0).toFixed(0)} spent`)

            return (
              <View
                key={e.id}
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(10),
                  paddingHorizontal: s(12),
                  paddingVertical: s(9),
                  gap: s(6)
                }}
              >
                {/* Main row */}
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}
                >
                  {/* Rank */}
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: '700',
                      color: colors.muted,
                      width: s(22),
                      textAlign: 'center'
                    }}
                  >
                    #{idx + 1}
                  </Text>

                  {/* Avatar */}
                  <View
                    style={{
                      width: s(28),
                      height: s(28),
                      borderRadius: s(14),
                      backgroundColor: colors.teal + '18',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(11),
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      {(cust?.name ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>

                  {/* Name + meta */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: s(13),
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      {cust?.name ?? 'Unknown'}
                    </Text>
                    <Text style={{ fontSize: s(10), color: colors.muted }}>
                      {stats.join(' · ')}
                    </Text>
                  </View>

                  {/* Balance */}
                  <View style={{ alignItems: 'flex-end' }}>
                    {e.current_points > 0 && (
                      <Text
                        style={{
                          fontSize: s(12),
                          fontWeight: '700',
                          color: colors.heading
                        }}
                      >
                        {e.current_points.toLocaleString()} pts
                      </Text>
                    )}
                    {e.current_visits > 0 && (
                      <Text
                        style={{
                          fontSize: s(12),
                          fontWeight: '700',
                          color: colors.heading
                        }}
                      >
                        {e.current_visits} visits
                      </Text>
                    )}
                    {e.current_punches > 0 && (
                      <Text
                        style={{
                          fontSize: s(12),
                          fontWeight: '700',
                          color: colors.heading
                        }}
                      >
                        {e.current_punches} punches
                      </Text>
                    )}
                    {rewardReady && (
                      <Text
                        style={{
                          fontSize: s(10),
                          fontWeight: '600',
                          color: colors.success
                        }}
                      >
                        🎉 Ready
                      </Text>
                    )}
                  </View>
                </View>

                {/* Progress bar — only if meaningful */}
                {progress && (
                  <View style={{ gap: s(3), paddingLeft: s(30) }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between'
                      }}
                    >
                      <Text style={{ fontSize: s(10), color: colors.muted }}>
                        {progress.current}/{progress.target} {progress.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: s(10),
                          fontWeight: '600',
                          color: rewardReady ? colors.success : accent
                        }}
                      >
                        {rewardReady ? 'Complete!' : `${pct}%`}
                      </Text>
                    </View>
                    <ProgressBar
                      current={progress.current}
                      target={progress.target}
                      color={rewardReady ? colors.success : accent}
                    />
                  </View>
                )}
              </View>
            )
          })}
        </View>
      )}

      {programs.length === 0 && enrollments.length === 0 && (
        <EmptyState
          icon={<Award size={s(28)} color={colors.muted} />}
          text='No loyalty data yet'
        />
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
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  if (loading) return <Loader />

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 20, gap: 12 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <TealButton
          label='New Program'
          icon={<Plus size={s(13)} color={colors.teal} />}
          onPress={onAdd}
        />
      </View>

      {programs.length === 0 && (
        <EmptyState
          icon={<Star size={s(28)} color={colors.muted} />}
          text='No loyalty programs yet'
          action={<TealButton label='Create First Program' onPress={onAdd} />}
        />
      )}

      {programs.map(prog => {
        const progEnrollments = enrollments.filter(
          e => e.program_id === prog.id
        )
        const progEarned = progEnrollments.reduce(
          (s, e) => s + (e.total_rewards_earned ?? 0),
          0
        )
        const accent = prog.display_color ?? colors.teal

        return (
          <View
            key={prog.id}
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(14),
              overflow: 'hidden'
            }}
          >
            <View style={{ height: s(3), backgroundColor: accent }} />

            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: s(14),
                paddingVertical: s(10),
                backgroundColor: colors.panel,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}
              >
                <View
                  style={{
                    width: s(32),
                    height: s(32),
                    borderRadius: s(9),
                    backgroundColor: accent + '20',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ProgramIcon
                    type={prog.program_type}
                    size={s(15)}
                    color={accent}
                  />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: '700',
                      color: colors.heading
                    }}
                  >
                    {prog.name}
                  </Text>
                  {/* Fix #5 — teal type badge + teal status badges */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: s(6),
                      marginTop: s(3)
                    }}
                  >
                    <TypeBadge type={prog.program_type} />
                    <StatusBadge active={!!prog.is_active} />
                  </View>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => onEdit(prog)}
                style={{
                  paddingHorizontal: s(12),
                  paddingVertical: s(6),
                  borderRadius: s(8),
                  backgroundColor: colors.teal + '15',
                  borderWidth: 1,
                  borderColor: colors.teal + '30'
                }}
              >
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: '600',
                    color: colors.teal
                  }}
                >
                  Edit
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: s(14), gap: s(12) }}>
              {prog.description ? (
                <Text style={{ fontSize: s(12), color: colors.muted }}>
                  {prog.description}
                </Text>
              ) : null}

              {/* Reward */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(8),
                  backgroundColor: accent + '10',
                  borderWidth: 1,
                  borderColor: accent + '30',
                  borderRadius: s(10),
                  padding: s(10)
                }}
              >
                <Gift size={s(14)} color={accent} />
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: '600',
                    color: accent,
                    flex: 1
                  }}
                >
                  {prog.reward_description}
                </Text>
                {prog.reward_value != null && (
                  <Text
                    style={{ fontSize: s(12), fontWeight: '700', color: accent }}
                  >
                    {prog.reward_type === 'discount_percent'
                      ? `${prog.reward_value}% off`
                      : prog.reward_type === 'discount_fixed'
                      ? `$${prog.reward_value} off`
                      : prog.reward_type}
                  </Text>
                )}
              </View>

              {/* Fix #5 — rule pills are teal */}
              <View style={{ flexDirection: 'row', gap: s(8), flexWrap: 'wrap' }}>
                {prog.program_type === 'points' &&
                  prog.points_per_dollar != null && (
                    <View
                      style={{
                        backgroundColor: colors.teal + '10',
                        borderWidth: 1,
                        borderColor: colors.teal + '30',
                        borderRadius: s(8),
                        paddingHorizontal: s(10),
                        paddingVertical: s(5)
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(11),
                          color: colors.teal,
                          fontWeight: '600'
                        }}
                      >
                        {prog.points_per_dollar} pts / $1
                      </Text>
                    </View>
                  )}
                {prog.program_type === 'points' &&
                  prog.points_redemption_threshold != null && (
                    <View
                      style={{
                        backgroundColor: colors.teal + '10',
                        borderWidth: 1,
                        borderColor: colors.teal + '30',
                        borderRadius: s(8),
                        paddingHorizontal: s(10),
                        paddingVertical: s(5)
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(11),
                          color: colors.teal,
                          fontWeight: '600'
                        }}
                      >
                        Redeem at {prog.points_redemption_threshold} pts
                      </Text>
                    </View>
                  )}
                {prog.program_type === 'visits' &&
                  prog.visits_required != null && (
                    <View
                      style={{
                        backgroundColor: colors.teal + '10',
                        borderWidth: 1,
                        borderColor: colors.teal + '30',
                        borderRadius: s(8),
                        paddingHorizontal: s(10),
                        paddingVertical: s(5)
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(11),
                          color: colors.teal,
                          fontWeight: '600'
                        }}
                      >
                        Every {prog.visits_required} visits
                      </Text>
                    </View>
                  )}
                {prog.program_type === 'punch' &&
                  prog.punches_required != null && (
                    <View
                      style={{
                        backgroundColor: colors.teal + '10',
                        borderWidth: 1,
                        borderColor: colors.teal + '30',
                        borderRadius: s(8),
                        paddingHorizontal: s(10),
                        paddingVertical: s(5)
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(11),
                          color: colors.teal,
                          fontWeight: '600'
                        }}
                      >
                        {prog.punches_required} punches to reward
                      </Text>
                    </View>
                  )}
                {prog.min_order_amount != null && (
                  <View
                    style={{
                      backgroundColor: colors.teal + '10',
                      borderWidth: 1,
                      borderColor: colors.teal + '30',
                      borderRadius: s(8),
                      paddingHorizontal: s(10),
                      paddingVertical: s(5)
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(11),
                        color: colors.teal,
                        fontWeight: '600'
                      }}
                    >
                      Min ${prog.min_order_amount}
                    </Text>
                  </View>
                )}
                {prog.reward_expiry_days != null && (
                  <View
                    style={{
                      backgroundColor: colors.teal + '10',
                      borderWidth: 1,
                      borderColor: colors.teal + '30',
                      borderRadius: s(8),
                      paddingHorizontal: s(10),
                      paddingVertical: s(5)
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(11),
                        color: colors.teal,
                        fontWeight: '600'
                      }}
                    >
                      Exp. {prog.reward_expiry_days}d
                    </Text>
                  </View>
                )}
                {prog.auto_enroll && (
                  <View
                    style={{
                      backgroundColor: colors.success + '15',
                      borderWidth: 1,
                      borderColor: colors.success + '30',
                      borderRadius: s(8),
                      paddingHorizontal: s(10),
                      paddingVertical: s(5)
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(11),
                        color: colors.success,
                        fontWeight: '600'
                      }}
                    >
                      Auto-enroll
                    </Text>
                  </View>
                )}
              </View>

              {/* Stats */}
              <View style={{ flexDirection: 'row', gap: s(8) }}>
                {[
                  {
                    label: 'Enrolled',
                    value: progEnrollments.length.toString()
                  },
                  { label: 'Rewards Earned', value: progEarned.toString() }
                ].map(stat => (
                  <View
                    key={stat.label}
                    style={{
                      flex: 1,
                      backgroundColor: colors.panel,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: s(10),
                      padding: s(10)
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(10),
                        fontWeight: '600',
                        color: colors.muted,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: s(3)
                      }}
                    >
                      {stat.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: s(16),
                        fontWeight: '700',
                        color: colors.heading
                      }}
                    >
                      {stat.value}
                    </Text>
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

// Memoized row so FlatList can recycle off-screen items instead of keeping
// every customer's view tree mounted (the old ScrollView+.map leaked Views).
const CustomerRow: React.FC<{ e: LoyaltyEnrollment }> = React.memo(({ e }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const cust = e.customer
  const prog = e.program
  const accent = colors.teal
  const progress = progressForEnrollment(e)
  const pct = progress
    ? Math.min(Math.round((progress.current / progress.target) * 100), 100)
    : null
  const rewardReady = pct === 100

  const stats: string[] = []
  if (e.current_points > 0)
    stats.push(`${e.current_points.toLocaleString()} pts`)
  if (e.current_visits > 0) stats.push(`${e.current_visits} visits`)
  if (e.current_punches > 0) stats.push(`${e.current_punches} punches`)
  if (prog?.name) stats.push(prog.name)

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: s(10),
        paddingHorizontal: s(12),
        paddingVertical: s(9),
        gap: s(6)
      }}
    >
      {/* Main row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
        {/* Avatar */}
        <View
          style={{
            width: s(28),
            height: s(28),
            borderRadius: s(14),
            backgroundColor: accent + '18',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text style={{ fontSize: s(11), fontWeight: '700', color: accent }}>
            {(cust?.name ?? '?')[0].toUpperCase()}
          </Text>
        </View>

        {/* Name + meta */}
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: s(13), fontWeight: '600', color: colors.heading }}
          >
            {cust?.name ?? 'Unknown'}
          </Text>
          <Text style={{ fontSize: s(10), color: colors.muted }}>
            {stats.join(' · ')}
          </Text>
        </View>

        {/* Right side */}
        {rewardReady ? (
          <Text
            style={{ fontSize: s(10), fontWeight: '600', color: colors.success }}
          >
            🎉 Ready
          </Text>
        ) : (
          <View style={{ alignItems: 'flex-end' }}>
            {progress && (
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {progress.current}/{progress.target}
              </Text>
            )}
            {progress && (
              <Text style={{ fontSize: s(10), color: colors.muted }}>
                {progress.label}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Progress bar */}
      {progress && (
        <View style={{ paddingLeft: s(36) }}>
          <ProgressBar
            current={progress.current}
            target={progress.target}
            color={rewardReady ? colors.success : accent}
          />
        </View>
      )}
    </View>
  )
})

// Fix #6 — better layout, better program filter design
const CustomersTab: React.FC<{
  enrollments: LoyaltyEnrollment[]
  programs: LoyaltyProgram[]
  loading: boolean
  onEnroll: () => void
}> = ({ enrollments, programs, loading, onEnroll }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const [search, setSearch] = useState('')
  const [progFilter, setProgFilter] = useState<string | null>(null)

  const filtered = enrollments.filter(e => {
    const name = e.customer?.name ?? ''
    const phone = e.customer?.phone ?? ''
    const matchS =
      !search ||
      name.toLowerCase().includes(search.toLowerCase()) ||
      phone.includes(search)
    const matchP = !progFilter || e.program_id === progFilter
    return matchS && matchP
  })

  if (loading) return <Loader />

  return (
    <View style={{ flex: 1, gap: 10 }}>
      {/* Search bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(8),
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: s(10),
          paddingHorizontal: s(12),
          paddingVertical: s(9)
        }}
      >
        <Search size={s(14)} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder='Search name or phone…'
          placeholderTextColor={colors.muted}
          style={{ flex: 1, fontSize: s(13), color: colors.heading }}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <X size={s(14)} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Program filter — segmented selector */}
      {programs.length > 0 && (
        <View
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(10),
            padding: s(3)
          }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: s(3) }}
          >
            {[
              { id: null as string | null, name: 'All' },
              ...programs.map(p => ({ id: p.id, name: p.name }))
            ].map(p => {
              const active = progFilter === p.id
              const count =
                p.id === null
                  ? enrollments.length
                  : enrollments.filter(e => e.program_id === p.id).length
              return (
                <TouchableOpacity
                  key={p.id ?? 'all'}
                  onPress={() => setProgFilter(p.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: s(6),
                    paddingHorizontal: s(14),
                    paddingVertical: s(7),
                    borderRadius: s(8),
                    backgroundColor: active ? colors.teal : 'transparent'
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(12),
                      fontWeight: '600',
                      color: active ? colors.onSolid : colors.label
                    }}
                  >
                    {p.name}
                  </Text>
                  <View
                    style={{
                      minWidth: s(18),
                      height: s(18),
                      borderRadius: s(9),
                      paddingHorizontal: s(4),
                      backgroundColor: active
                        ? colors.onSolid + '25'
                        : colors.border,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(10),
                        fontWeight: '700',
                        color: active ? colors.onSolid : colors.muted
                      }}
                    >
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={e => e.id}
        renderItem={({ item }) => <CustomerRow e={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20, gap: 8 }}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        ListHeaderComponent={
          /* Enroll CTA */
          <TouchableOpacity
            onPress={onEnroll}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(10),
              paddingHorizontal: s(14),
              paddingVertical: s(12),
              backgroundColor: colors.teal + '10',
              borderWidth: 1,
              borderColor: colors.teal + '30',
              borderRadius: s(12),
              marginBottom: s(8)
            }}
          >
            <View
              style={{
                width: s(32),
                height: s(32),
                borderRadius: s(9),
                backgroundColor: colors.teal + '25',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Plus size={s(15)} color={colors.teal} />
            </View>
            <View>
              <Text
                style={{ fontSize: s(13), fontWeight: '600', color: colors.teal }}
              >
                Enroll New Customer
              </Text>
              <Text style={{ fontSize: s(11), color: colors.teal + 'AA' }}>
                Add a customer to a loyalty program
              </Text>
            </View>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Users size={s(28)} color={colors.muted} />}
            text='No enrolled customers found'
          />
        }
      />
    </View>
  )
}

// ─── Tab: Redeem ──────────────────────────────────────────────────────────────

const RedeemTab: React.FC<{ merchantId: string }> = ({ merchantId }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const { show } = useToast()

  const phone = useLoyaltyDataStore(storeState => storeState.redeemPhone)
  const searching = useLoyaltyDataStore(s => s.redeemSearching)
  const searched = useLoyaltyDataStore(s => s.redeemSearched)
  const customer = useLoyaltyDataStore(s => s.redeemCustomer)
  const enrollments = useLoyaltyDataStore(s => s.redeemEnrollments)
  const rewards = useLoyaltyDataStore(s => s.redeemRewards)
  const redeeming = useLoyaltyDataStore(s => s.redeemRedeeming)
  const redeemed = useLoyaltyDataStore(s => s.redeemLastRedeemed)
  const lookupCustomer = useLoyaltyDataStore(s => s.lookupCustomer)
  const redeemReward = useLoyaltyDataStore(s => s.redeemReward)
  const clearRedeemState = useLoyaltyDataStore(s => s.clearRedeemState)
  const clearLastRedeemed = useLoyaltyDataStore(s => s.clearLastRedeemed)
  const setRedeemPhone = useLoyaltyDataStore(s => s.setRedeemPhone)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePhoneChange = (val: string) => {
    setRedeemPhone(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => lookupCustomer(val, merchantId), 400)
  }

  const handleRedeem = async (reward: LoyaltyReward) => {
    const result = await redeemReward(reward.id, merchantId)
    if (!result.success)
      show({
        title: 'Error',
        message: result.error ?? 'Failed to redeem reward',
        type: 'error'
      })
  }

  const handleReset = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    clearRedeemState()
  }

  // Clear any pending debounce timer on unmount so its closure (which
  // retains this component's tree) doesn't outlive the screen.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    []
  )

  const totalPoints = enrollments.reduce(
    (s, e) => s + (e.current_points ?? 0),
    0
  )
  const totalVisits = enrollments.reduce(
    (s, e) => s + (e.current_visits ?? 0),
    0
  )
  const totalPunches = enrollments.reduce(
    (s, e) => s + (e.current_punches ?? 0),
    0
  )

  return (
    <View style={{ flex: 1 }}>
      {/* Fix #7 — Phone input always visible at top, prominent */}
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: customer ? colors.teal + '40' : colors.border,
          borderRadius: s(12),
          marginBottom: s(12),
          overflow: 'hidden'
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: s(14),
            paddingVertical: s(12),
            gap: s(10)
          }}
        >
          <View
            style={{
              width: s(36),
              height: s(36),
              borderRadius: s(9),
              backgroundColor: colors.teal + '15',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Search size={s(16)} color={colors.teal} />
          </View>
          <TextInput
            value={phone}
            onChangeText={handlePhoneChange}
            placeholder='Enter phone number to look up customer…'
            placeholderTextColor={colors.muted}
            keyboardType='phone-pad'
            style={{
              flex: 1,
              fontSize: s(15),
              color: colors.heading,
              fontWeight: '500'
            }}
            autoFocus={false}
          />
          {searching && <ActivityIndicator color={colors.teal} size='small' />}
          {!searching && phone.length > 0 && (
            <TouchableOpacity onPress={handleReset} style={{ padding: s(4) }}>
              <X size={s(15)} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
        {phone.length > 0 && phone.length < 4 && (
          <View style={{ paddingHorizontal: s(14), paddingBottom: s(10) }}>
            <Text style={{ fontSize: s(11), color: colors.muted }}>
              Keep typing to search…
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20, gap: 12 }}
      >
        {/* Not found */}
        {searched && !customer && !searching && (
          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(12),
              padding: s(20),
              alignItems: 'center',
              gap: s(8)
            }}
          >
            <AlertCircle size={s(22)} color={colors.muted} />
            <Text style={{ fontSize: s(13), color: colors.muted }}>
              No loyalty account found
            </Text>
            <Text
              style={{ fontSize: s(11), color: colors.muted, textAlign: 'center' }}
            >
              Try a different number or enroll this customer first
            </Text>
          </View>
        )}

        {/* Success banner */}
        {redeemed && (
          <View
            style={{
              backgroundColor: colors.success + '10',
              borderWidth: 1,
              borderColor: colors.success + '40',
              borderRadius: s(12),
              padding: s(16),
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(12)
            }}
          >
            <View
              style={{
                width: s(40),
                height: s(40),
                borderRadius: s(20),
                backgroundColor: colors.success + '20',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Check size={s(18)} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: '700',
                  color: colors.success
                }}
              >
                Reward Redeemed!
              </Text>
              <Text style={{ fontSize: s(12), color: colors.label, marginTop: s(1) }}>
                <Text style={{ fontWeight: '600', color: colors.heading }}>
                  {redeemed.reward_description}
                </Text>{' '}
                applied for {customer?.name}
              </Text>
            </View>
            <TouchableOpacity
              onPress={clearLastRedeemed}
              style={{ padding: s(6) }}
            >
              <X size={s(13)} color={colors.muted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Customer card */}
        {customer && (
          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.teal + '30',
              borderRadius: s(12),
              padding: s(14)
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}
            >
              <View
                style={{
                  width: s(44),
                  height: s(44),
                  borderRadius: s(22),
                  backgroundColor: colors.teal + '20',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: s(18),
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  {(customer.name ?? '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: s(15),
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  {customer.name ?? 'Unknown'}
                </Text>
                <Text
                  style={{ fontSize: s(11), color: colors.muted, marginTop: s(1) }}
                >
                  {customer.phone} · {customer.visits ?? 0} visits · $
                  {(customer.lifetime_spend ?? 0).toFixed(0)} lifetime
                </Text>
              </View>
            </View>

            {/* Balances */}
            {(totalPoints > 0 || totalVisits > 0 || totalPunches > 0) && (
              <View style={{ flexDirection: 'row', gap: s(8), marginTop: s(12) }}>
                {totalPoints > 0 && (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: colors.panel,
                      borderRadius: s(9),
                      padding: s(10),
                      borderWidth: 1,
                      borderColor: colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(10),
                        color: colors.muted,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: s(3)
                      }}
                    >
                      Points
                    </Text>
                    <Text
                      style={{
                        fontSize: s(18),
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      {totalPoints.toLocaleString()}
                    </Text>
                  </View>
                )}
                {totalVisits > 0 && (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: colors.panel,
                      borderRadius: s(9),
                      padding: s(10),
                      borderWidth: 1,
                      borderColor: colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(10),
                        color: colors.muted,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: s(3)
                      }}
                    >
                      Visits
                    </Text>
                    <Text
                      style={{
                        fontSize: s(18),
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      {totalVisits}
                    </Text>
                  </View>
                )}
                {totalPunches > 0 && (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: colors.panel,
                      borderRadius: s(9),
                      padding: s(10),
                      borderWidth: 1,
                      borderColor: colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(10),
                        color: colors.muted,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: s(3)
                      }}
                    >
                      Punches
                    </Text>
                    <Text
                      style={{
                        fontSize: s(18),
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      {totalPunches}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Progress per enrollment */}
            {enrollments.map(e => {
              const progress = progressForEnrollment(e)
              if (!progress) return null
              const accent = colors.teal
              const pct = Math.min(
                Math.round((progress.current / progress.target) * 100),
                100
              )
              return (
                <View key={e.id} style={{ marginTop: s(10) }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginBottom: s(4)
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(11),
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      {(e.program as any)?.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: s(11),
                        fontWeight: '600',
                        color: pct === 100 ? colors.success : accent
                      }}
                    >
                      {pct === 100
                        ? '🎉 Reward ready!'
                        : `${progress.current}/${progress.target} ${progress.label}`}
                    </Text>
                  </View>
                  <ProgressBar
                    current={progress.current}
                    target={progress.target}
                    color={accent}
                  />
                </View>
              )
            })}
          </View>
        )}

        {/* Available rewards */}
        {customer && (
          <SectionCard
            title='Available Rewards'
            icon={<Gift size={s(13)} color={colors.teal} />}
          >
            {rewards.length === 0 ? (
              <View
                style={{ alignItems: 'center', paddingVertical: s(20), gap: s(6) }}
              >
                <Gift size={s(22)} color={colors.muted} />
                <Text style={{ fontSize: s(12), color: colors.muted }}>
                  No pending rewards to redeem
                </Text>
              </View>
            ) : (
              <View style={{ gap: s(8) }}>
                {rewards.map(reward => {
                  const valueLabel =
                    reward.reward_type === 'discount_percent'
                      ? `${reward.reward_value}% off`
                      : reward.reward_type === 'discount_fixed'
                      ? `$${reward.reward_value} off`
                      : reward.reward_type
                  return (
                    <View
                      key={reward.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: colors.panel,
                        borderWidth: 1,
                        borderColor: colors.teal + '30',
                        borderRadius: s(10),
                        padding: s(12),
                        gap: s(10)
                      }}
                    >
                      <View
                        style={{
                          width: s(34),
                          height: s(34),
                          borderRadius: s(9),
                          backgroundColor: colors.teal + '15',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Tag size={s(15)} color={colors.teal} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: s(13),
                            fontWeight: '600',
                            color: colors.heading
                          }}
                        >
                          {reward.reward_description}
                        </Text>
                        <Text
                          style={{
                            fontSize: s(11),
                            color: colors.muted,
                            marginTop: s(1)
                          }}
                        >
                          {valueLabel}
                          {reward.reward_max_value != null
                            ? ` · max $${reward.reward_max_value}`
                            : ''}
                          {reward.expires_at
                            ? ` · exp. ${relativeDate(reward.expires_at)}`
                            : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRedeem(reward)}
                        disabled={redeeming === reward.id}
                        style={{
                          paddingHorizontal: s(14),
                          paddingVertical: s(8),
                          borderRadius: s(8),
                          backgroundColor: colors.teal,
                          minWidth: s(80),
                          alignItems: 'center'
                        }}
                      >
                        {redeeming === reward.id ? (
                          <ActivityIndicator
                            color={colors.onSolid}
                            size='small'
                          />
                        ) : (
                          <Text
                            style={{
                              fontSize: s(12),
                              fontWeight: '700',
                              color: colors.onSolid
                            }}
                          >
                            Redeem
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>
            )}
          </SectionCard>
        )}
      </ScrollView>
    </View>
  )
}

// ─── Persist active tab across navigation (survives remount) ─────────────────
let _persistedTab: TabId = 'overview'

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'programs', label: 'Programs' },
  { id: 'customers', label: 'Customers' },
  { id: 'redeem', label: 'Redeem' }
]

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LoyaltyScreen () {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const router = useRouter()
  const selectedStore = useStoreSettingsStore(storeState => storeState.selectedStore)
  const merchantId = selectedStore?.merchant_id ?? ''

  const programs = useLoyaltyDataStore(storeState => storeState.programs)
  const enrollments = useLoyaltyDataStore(storeState => storeState.enrollments)
  const loading = useLoyaltyDataStore(storeState => storeState.loading)
  const fetchData = useLoyaltyDataStore(storeState => storeState.fetchData)

  const [activeTab, setActiveTab] = useState<TabId>(_persistedTab)

  const loadData = useCallback(() => {
    fetchData(merchantId)
  }, [merchantId, fetchData])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Tab bar + refresh */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.panel,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: s(10)
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  _persistedTab = tab.id
                  setActiveTab(tab.id)
                }}
                style={{
                  paddingHorizontal: s(14),
                  paddingVertical: s(10),
                  borderBottomWidth: 2,
                  borderBottomColor: active ? colors.teal : 'transparent',
                  marginRight: s(2)
                }}
              >
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: '600',
                    color: active ? colors.teal : colors.label
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <TouchableOpacity
          onPress={loadData}
          style={{
            padding: s(7),
            backgroundColor: colors.teal + '10',
            borderRadius: s(10),
            marginLeft: s(6)
          }}
        >
          <RefreshCw size={s(14)} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingHorizontal: s(14), paddingTop: s(12) }}>
        {activeTab === 'overview' && (
          <OverviewTab
            programs={programs}
            enrollments={enrollments}
            loading={loading}
          />
        )}
        {activeTab === 'programs' && (
          <ProgramsTab
            programs={programs}
            enrollments={enrollments}
            loading={loading}
            onAdd={() => router.push('/loyalty/program-form' as any)}
            onEdit={p =>
              router.push({
                pathname: '/loyalty/program-form' as any,
                params: { id: p.id }
              })
            }
          />
        )}
        {activeTab === 'customers' && (
          <CustomersTab
            enrollments={enrollments}
            programs={programs}
            loading={loading}
            onEnroll={() => router.push('/loyalty/enroll-customer' as any)}
          />
        )}
        {activeTab === 'redeem' && <RedeemTab merchantId={merchantId} />}
      </View>
    </View>
  )
}
