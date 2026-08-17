/**
 * Tip Management Screen (read-only — Wave 1)
 *
 * Surfaces the tip model that today is only visible on the website dashboard:
 *   • Pools        — tip pool configs, their scope (roles, source %, effective
 *                    window, active) and per-role shares.
 *   • Tip-Out Rules — role → role tip-outs, their type/value and scope.
 *   • Distribution — unsettled tip summary + the day's distribution sessions,
 *                    including each session's data window (start → cutoff).
 *
 * This is intentionally read-only for now. Creating/editing pools and rules on
 * the POS (writing to the shared DB) is gated behind a feasibility spike (RLS +
 * distribution semantics) and will land behind EXPO_PUBLIC_TIP_MANAGEMENT_WRITE.
 * Until then, edits happen on the Dexa dashboard.
 *
 * All reads reuse existing services — see `services/endOfDayService.ts`.
 */

import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { getCurrentBusinessDay } from '@/lib/businessDay'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import {
  fetchTipDistributionRulesOverview,
  fetchTodaySessions,
  fetchUnsettledTipSummary,
  TipDistributionRulesOverview,
  TipOutRuleOverview,
  TipPoolConfigOverview,
  TodaySessionRow,
  TodayTipSummary,
} from '@/services/endOfDayService'
import {
  EmployeeDailyTipRow,
  fetchDailyTips,
} from '@/services/tipDistributionService'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { DateTime } from 'luxon'
import {
  Banknote,
  CalendarClock,
  CreditCard,
  Info,
  Layers,
  Percent,
  Split,
  Users,
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

// ── Formatting helpers ────────────────────────────────────────────────────────

const money = (v: number | null | undefined) => `$${(Number(v) || 0).toFixed(2)}`

const fmtLabel = (raw: string) =>
  (raw || '').replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// Job role codes may be prefixed (e.g. "merchant.bartender"); show the leaf.
const roleLabel = (code?: string | null, name?: string | null) => {
  if (name) return name
  if (!code) return '—'
  const leaf = code.includes('.') ? code.split('.').pop()! : code
  return fmtLabel(leaf)
}

const fmtTipSource = (raw: string) => {
  switch (raw) {
    case 'charged_tips': return 'Charged Tips'
    case 'all_tips': return 'All Tips'
    case 'cash_only': return 'Cash Only'
    default: return fmtLabel(raw)
  }
}

const fmtRuleValue = (rule: TipOutRuleOverview) => {
  if (rule.tipOutType === 'flat_amount') return `${money(rule.tipOutValue)} flat`
  if (rule.tipOutType === 'percentage_of_tips') return `${rule.tipOutValue.toFixed(1)}% of tips`
  if (rule.tipOutType === 'percentage_of_sales') return `${rule.tipOutValue.toFixed(1)}% of sales`
  return `${rule.tipOutValue} ${fmtLabel(rule.tipOutType)}`
}

// "YYYY-MM-DD" (or ISO) → "Mon D, YYYY". Falls back to the raw string.
const fmtDate = (iso?: string | null) => {
  if (!iso) return null
  const dt = iso.length <= 10 ? DateTime.fromISO(iso) : DateTime.fromISO(iso)
  return dt.isValid ? dt.toFormat('MMM d, yyyy') : iso
}

// ISO timestamp → tz-aware "Mon D, h:mm a".
const fmtDateTime = (iso: string | null, tz: string) => {
  if (!iso) return '—'
  const dt = DateTime.fromISO(iso).setZone(tz)
  return dt.isValid ? dt.toFormat('MMM d, h:mm a') : '—'
}

const scopeLabel = (effectiveDate?: string | null, endDate?: string | null) => {
  const from = fmtDate(effectiveDate)
  const to = fmtDate(endDate)
  if (from && to) return `${from} → ${to}`
  if (from) return `From ${from}`
  if (to) return `Until ${to}`
  return 'Always active'
}

type TabKey = 'pools' | 'rules' | 'distribution'

// ── Small shared primitives ───────────────────────────────────────────────────

const Pill: React.FC<{ text: string; tone?: 'teal' | 'muted' | 'success' | 'danger' | 'warning'; s: (n: number) => number }> = ({ text, tone = 'teal', s }) => {
  const toneColor =
    tone === 'success' ? colors.success
    : tone === 'danger' ? colors.danger
    : tone === 'warning' ? colors.warning
    : tone === 'muted' ? colors.muted
    : colors.teal
  return (
    <View style={{ borderRadius: s(20), paddingHorizontal: s(8), paddingVertical: s(2), backgroundColor: toneColor + '20' }}>
      <Text style={{ fontSize: s(10), fontWeight: '600', color: toneColor }}>{text}</Text>
    </View>
  )
}

const SectionCard: React.FC<{ children: React.ReactNode; s: (n: number) => number }> = ({ children, s }) => (
  <View
    style={{
      backgroundColor: colors.panel,
      padding: s(14),
      borderRadius: s(14),
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: s(12),
    }}
  >
    {children}
  </View>
)

const EmptyState: React.FC<{ text: string; s: (n: number) => number }> = ({ text, s }) => (
  <View style={{ paddingVertical: s(20), alignItems: 'center' }}>
    <Text style={{ fontSize: s(12), color: colors.muted, textAlign: 'center' }}>{text}</Text>
  </View>
)

// ── Pools tab ─────────────────────────────────────────────────────────────────

const PoolCard: React.FC<{ config: TipPoolConfigOverview; s: (n: number) => number }> = ({ config, s }) => (
  <View
    style={{
      borderRadius: s(10),
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: s(12),
      gap: s(6),
    }}
  >
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: s(8) }}>
      <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.heading, flex: 1 }} numberOfLines={1}>
        {config.name}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
        <Pill text={fmtLabel(config.distributionMethod)} s={s} />
        <Pill text={config.isActive ? 'Active' : 'Inactive'} tone={config.isActive ? 'success' : 'muted'} s={s} />
      </View>
    </View>

    {config.description ? (
      <Text style={{ fontSize: s(11), color: colors.muted }}>{config.description}</Text>
    ) : null}

    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), flexWrap: 'wrap' }}>
      <Split size={s(12)} color={colors.label} />
      <Text style={{ fontSize: s(11), color: colors.label }}>
        Source: {fmtTipSource(config.tipSource)} · {config.sourcePercentage}%
      </Text>
    </View>

    {config.contributingRoleCodes.length > 0 && (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), flexWrap: 'wrap' }}>
        <Users size={s(12)} color={colors.label} />
        <Text style={{ fontSize: s(11), color: colors.label }}>
          Contributing: {config.contributingRoleCodes.map((c) => roleLabel(c)).join(', ')}
        </Text>
      </View>
    )}

    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
      <CalendarClock size={s(12)} color={colors.label} />
      <Text style={{ fontSize: s(11), color: colors.label }}>{scopeLabel(config.effectiveDate, config.endDate)}</Text>
    </View>

    {config.shares.length > 0 && (
      <View style={{ marginTop: s(4), borderTopWidth: 1, borderTopColor: colors.border, paddingTop: s(6), gap: s(3) }}>
        <Text style={{ fontSize: s(10), fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Role Shares
        </Text>
        {config.shares.map((share) => (
          <View key={share.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: s(11), color: colors.label }}>{roleLabel(share.roleCode, share.roleName)}</Text>
            <Text style={{ fontSize: s(11), fontWeight: '600', color: colors.heading }}>
              {share.pointsPerHour ? `${share.pointsPerHour} pts/hr` : `${share.sharePercentage}%`}
            </Text>
          </View>
        ))}
      </View>
    )}
  </View>
)

// ── Tip-out rule tab ──────────────────────────────────────────────────────────

const RuleCard: React.FC<{ rule: TipOutRuleOverview; s: (n: number) => number }> = ({ rule, s }) => (
  <View
    style={{
      borderRadius: s(10),
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: s(12),
      gap: s(6),
    }}
  >
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: s(8) }}>
      <Text style={{ fontSize: s(13), fontWeight: '600', color: colors.heading, flex: 1 }} numberOfLines={1}>
        {roleLabel(rule.fromRoleCode, rule.fromRoleName)}  →  {roleLabel(rule.toRoleCode, rule.toRoleName)}
      </Text>
      <Pill text={rule.isActive ? 'Active' : 'Inactive'} tone={rule.isActive ? 'success' : 'muted'} s={s} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
      <Percent size={s(12)} color={colors.label} />
      <Text style={{ fontSize: s(12), color: colors.label }}>{fmtRuleValue(rule)}</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
      <CalendarClock size={s(12)} color={colors.label} />
      <Text style={{ fontSize: s(11), color: colors.label }}>{scopeLabel(rule.effectiveDate, rule.endDate)}</Text>
    </View>
  </View>
)

// ── Distribution tab ──────────────────────────────────────────────────────────

const sessionTone = (status: string): 'success' | 'warning' | 'danger' | 'muted' => {
  if (status === 'approved' || status === 'exported') return 'success'
  if (status === 'voided') return 'danger'
  if (status === 'draft' || status === 'preview') return 'muted'
  return 'warning'
}

const Metric: React.FC<{ label: string; value: string; sub?: string; icon?: React.ReactNode; s: (n: number) => number }> = ({ label, value, sub, icon, s }) => (
  <View style={{ flex: 1, gap: s(2) }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
      {icon}
      <Text style={{ fontSize: s(10), fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
    </View>
    <Text style={{ fontSize: s(16), fontWeight: '800', color: colors.heading }}>{value}</Text>
    {sub ? <Text style={{ fontSize: s(10), color: colors.muted }}>{sub}</Text> : null}
  </View>
)

const EmployeeTipRow: React.FC<{ row: EmployeeDailyTipRow; name: string; s: (n: number) => number }> = ({ row, name, s }) => {
  const cash = row.cashTipsDeclared ?? row.cashPaymentTips
  const facts: { label: string; value: string }[] = [
    { label: 'Charged', value: money(row.chargedTips) },
    { label: 'Cash', value: money(cash) },
  ]
  if (row.tipPoolReceived) facts.push({ label: 'Pool +', value: money(row.tipPoolReceived) })
  if (row.tipPoolContributed) facts.push({ label: 'Pool −', value: money(row.tipPoolContributed) })
  if (row.tipOutReceived) facts.push({ label: 'Tip-out +', value: money(row.tipOutReceived) })
  if (row.tipOutGiven) facts.push({ label: 'Tip-out −', value: money(row.tipOutGiven) })
  return (
    <View style={{ borderRadius: s(10), borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: s(12), gap: s(6) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: s(8) }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
          <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }} numberOfLines={1}>{name}</Text>
          {row.isVerified ? <Pill text="Verified" tone="success" s={s} /> : null}
        </View>
        <Text style={{ fontSize: s(14), fontWeight: '800', color: colors.teal }}>{money(row.totalTips)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: s(10) }}>
        <Text style={{ fontSize: s(10), color: colors.muted }}>{row.hoursWorked.toFixed(2)} hrs</Text>
        {facts.map((f) => (
          <Text key={f.label} style={{ fontSize: s(10), color: colors.label }}>
            {f.label} <Text style={{ fontWeight: '600', color: colors.heading }}>{f.value}</Text>
          </Text>
        ))}
      </View>
    </View>
  )
}

const DistributionTab: React.FC<{
  summary: TodayTipSummary | null
  sessions: TodaySessionRow[]
  dailyTips: EmployeeDailyTipRow[]
  nameFor: (profileId: string) => string
  tz: string
  s: (n: number) => number
}> = ({ summary, sessions, dailyTips, nameFor, tz, s }) => (
  <>
    {/* Unsettled tip summary */}
    <SectionCard s={s}>
      <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading, marginBottom: s(2) }}>Unsettled Tips</Text>
      <Text style={{ fontSize: s(10), color: colors.muted, marginBottom: s(12) }}>
        Since the last approved distribution{summary?.periodStart ? ` · from ${fmtDate(summary.periodStart)}` : ''}. Card tips shown net of processor fees.
      </Text>
      <View style={{ flexDirection: 'row', gap: s(8) }}>
        <Metric
          label="Card (net)"
          value={money(summary?.cardTipsNet)}
          sub={summary && summary.cardTipsProcessorFee > 0 ? `${money(summary.cardTipsProcessorFee)} fees` : undefined}
          icon={<CreditCard size={s(12)} color={colors.muted} />}
          s={s}
        />
        <View style={{ width: 1, backgroundColor: colors.border }} />
        <Metric label="Cash" value={money(summary?.cashTips)} icon={<Banknote size={s(12)} color={colors.muted} />} s={s} />
        <View style={{ width: 1, backgroundColor: colors.border }} />
        <Metric label="Total" value={money(summary?.totalTips)} s={s} />
      </View>

      {summary && summary.pendingPriorDaySessions.length > 0 && (
        <View style={{ marginTop: s(12), flexDirection: 'row', alignItems: 'flex-start', gap: s(6), backgroundColor: colors.warning + '12', borderRadius: s(8), padding: s(8) }}>
          <Info size={s(13)} color={colors.warning} style={{ marginTop: s(1) }} />
          <Text style={{ fontSize: s(11), color: colors.label, flex: 1 }}>
            {summary.pendingPriorDaySessions.length} prior day{summary.pendingPriorDaySessions.length === 1 ? '' : 's'} still unsettled:{' '}
            {summary.pendingPriorDaySessions.map((p) => fmtDate(p.date)).join(', ')}
          </Text>
        </View>
      )}
    </SectionCard>

    {/* Today's distribution sessions */}
    <SectionCard s={s}>
      <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading, marginBottom: s(2) }}>Distribution Sessions Today</Text>
      <Text style={{ fontSize: s(10), color: colors.muted, marginBottom: s(12) }}>
        Each session covers tips within its data window. Run distribution from End of Day.
      </Text>
      {sessions.length === 0 ? (
        <EmptyState text="No distribution sessions yet today. Tips are distributed from the End-of-Day flow." s={s} />
      ) : (
        <View style={{ gap: s(8) }}>
          {sessions.map((session) => (
            <View
              key={session.id}
              style={{ borderRadius: s(10), borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: s(12), gap: s(6) }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}>Session #{session.sequenceNumber}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                  <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.teal }}>{money(session.totalDistributed)}</Text>
                  <Pill text={fmtLabel(session.status)} tone={sessionTone(session.status)} s={s} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
                <CalendarClock size={s(12)} color={colors.label} />
                <Text style={{ fontSize: s(11), color: colors.label }}>
                  {session.dataStartAfter ? fmtDateTime(session.dataStartAfter, tz) : 'Start of day'} → {fmtDateTime(session.dataCutoffAt, tz)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </SectionCard>

    {/* Per-employee daily tips */}
    <SectionCard s={s}>
      <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading, marginBottom: s(2) }}>Per-Employee Tips</Text>
      <Text style={{ fontSize: s(10), color: colors.muted, marginBottom: s(12) }}>
        Server-computed for the current business day. Hours exclude breaks and sum multiple clock-ins.
      </Text>
      {dailyTips.length === 0 ? (
        <EmptyState text="No per-employee tips yet for this business day. They populate once distribution is rebuilt from End of Day." s={s} />
      ) : (
        <View style={{ gap: s(8) }}>
          {dailyTips.map((row) => (
            <EmployeeTipRow key={row.id} row={row} name={nameFor(row.staffProfileId)} s={s} />
          ))}
        </View>
      )}
    </SectionCard>
  </>
)

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TipsManagementScreen() {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const supabase = useSupabaseClient()
  const selectedStore = useStoreSettingsStore((st) => st.selectedStore)
  const locationId = selectedStore?.id || ''

  const tz = useMemo(() => {
    const raw = selectedStore?.timezone
    if (raw && DateTime.now().setZone(raw).isValid) return raw
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' }
    catch { return 'America/New_York' }
  }, [selectedStore?.timezone])

  const businessDay = useMemo(() => {
    try {
      return getCurrentBusinessDay({ timezone: tz, rolloverHour: selectedStore?.business_day_start_hour ?? 0 })
    } catch {
      return DateTime.now().setZone(tz).toFormat('yyyy-MM-dd')
    }
  }, [tz, selectedStore?.business_day_start_hour])

  const [tab, setTab] = useState<TabKey>('pools')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [overview, setOverview] = useState<TipDistributionRulesOverview | null>(null)
  const [summary, setSummary] = useState<TodayTipSummary | null>(null)
  const [sessions, setSessions] = useState<TodaySessionRow[]>([])
  const [dailyTips, setDailyTips] = useState<EmployeeDailyTipRow[]>([])
  const [error, setError] = useState<string | null>(null)

  // Resolve staff_profile_id → display name from the local employee roster,
  // falling back to a short id for staff not currently synced on this device.
  const employees = useEmployeeStore((st) => st.employees)
  const nameFor = useCallback(
    (profileId: string) => {
      const match = employees.find((e) => e.profileId === profileId)
      return match?.fullName || match?.displayName || `Staff ${profileId.slice(0, 6)}`
    },
    [employees]
  )

  const load = useCallback(async () => {
    if (!locationId) return
    setError(null)
    try {
      const [ov, sum, sess, tips] = await Promise.all([
        fetchTipDistributionRulesOverview(supabase, locationId),
        fetchUnsettledTipSummary(supabase, locationId).catch(() => null),
        fetchTodaySessions(supabase, locationId, businessDay).catch(() => [] as TodaySessionRow[]),
        fetchDailyTips(supabase, locationId, businessDay).catch(() => [] as EmployeeDailyTipRow[]),
      ])
      setOverview(ov)
      setSummary(sum)
      setSessions(sess)
      setDailyTips(tips)
      if (!ov) setError('Unable to load tip pools and rules.')
    } catch (e: any) {
      setError(e?.message || 'Failed to load tip management data.')
    }
  }, [supabase, locationId, businessDay])

  useEffect(() => {
    let active = true
    setLoading(true)
    load().finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'pools', label: 'Pools', icon: Layers },
    { key: 'rules', label: 'Tip-Out Rules', icon: Split },
    { key: 'distribution', label: 'Distribution', icon: Percent },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: s(16), paddingBottom: s(40) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
      >
        {/* Header */}
        <Text style={{ fontSize: s(20), fontWeight: '800', color: colors.heading, marginBottom: s(4) }}>Tip Management</Text>
        <Text style={{ fontSize: s(12), color: colors.muted, marginBottom: s(12) }}>
          View tip pools, tip-out rules, and how tips are being distributed at this location.
        </Text>

        {/* Read-only notice */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(8), backgroundColor: colors.teal + '10', borderRadius: s(10), padding: s(10), marginBottom: s(14), borderWidth: 1, borderColor: colors.teal + '22' }}>
          <Info size={s(15)} color={colors.teal} style={{ marginTop: s(1) }} />
          <Text style={{ fontSize: s(11), color: colors.label, flex: 1 }}>
            Read-only. Pools and tip-out rules are edited on the Dexa dashboard for now. Distribution runs from End of Day.
          </Text>
        </View>

        {/* Tab bar */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.panel, borderRadius: s(10), borderWidth: 1, borderColor: colors.border, padding: s(3), marginBottom: s(14) }}>
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = tab === key
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setTab(key)}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: s(6),
                  paddingVertical: s(8),
                  borderRadius: s(8),
                  backgroundColor: isActive ? colors.teal : 'transparent',
                }}
              >
                <Icon size={s(14)} color={isActive ? colors.onSolid : colors.muted} />
                <Text style={{ fontSize: s(12), fontWeight: '700', color: isActive ? colors.onSolid : colors.muted }}>{label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.teal} style={{ paddingVertical: s(40) }} />
        ) : (
          <>
            {tab === 'pools' && (
              <SectionCard s={s}>
                <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading, marginBottom: s(2) }}>Tip Pools</Text>
                <Text style={{ fontSize: s(10), color: colors.muted, marginBottom: s(12) }}>
                  How pooled tips are collected and split. Scope = contributing roles + effective window.
                </Text>
                {error && !overview ? (
                  <EmptyState text={error} s={s} />
                ) : !overview || overview.configs.length === 0 ? (
                  <EmptyState text="No tip pools configured for this location." s={s} />
                ) : (
                  <View style={{ gap: s(10) }}>
                    {overview.configs.map((config) => <PoolCard key={config.id} config={config} s={s} />)}
                  </View>
                )}
              </SectionCard>
            )}

            {tab === 'rules' && (
              <SectionCard s={s}>
                <Text style={{ fontSize: s(13), fontWeight: '700', color: colors.heading, marginBottom: s(2) }}>Tip-Out Rules</Text>
                <Text style={{ fontSize: s(10), color: colors.muted, marginBottom: s(12) }}>
                  Automatic transfers from one role to another (e.g. servers → bussers).
                </Text>
                {error && !overview ? (
                  <EmptyState text={error} s={s} />
                ) : !overview || overview.rules.length === 0 ? (
                  <EmptyState text="No tip-out rules configured for this location." s={s} />
                ) : (
                  <View style={{ gap: s(10) }}>
                    {overview.rules.map((rule) => <RuleCard key={rule.id} rule={rule} s={s} />)}
                  </View>
                )}
              </SectionCard>
            )}

            {tab === 'distribution' && (
              <DistributionTab summary={summary} sessions={sessions} dailyTips={dailyTips} nameFor={nameFor} tz={tz} s={s} />
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}
