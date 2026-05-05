/**
 * TipDistributionWizard
 * 4-step flow: Cash Tip Declaration -> Calculate -> Review/Adjust -> Approve
 */

import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { getBusinessDayBounds } from '@/lib/businessDay'
import { colors } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import {
  TipWizardStep,
  useTipDistributionStore
} from '@/stores/useTipDistributionStore'
import { formatCurrency } from '@/utils/currency'
import {
  Calculator,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Edit3,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native'

interface TipDistributionWizardProps {
  isOpen: boolean
  onClose: () => void
  sessionDate?: string
}

const STEPS: { key: TipWizardStep; label: string }[] = [
  { key: 'declare', label: 'Declare' },
  { key: 'calculate', label: 'Preview' },
  { key: 'review', label: 'Review' },
  { key: 'approve', label: 'Approve' }
]

const NUM_PAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫']
]

function initials (name: string) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const TipDistributionWizard: React.FC<TipDistributionWizardProps> = ({
  isOpen,
  onClose,
  sessionDate
}) => {
  const supabase = useSupabaseClient()
  const { height: screenHeight } = useWindowDimensions()

  const wizardStep = useTipDistributionStore(s => s.wizardStep)
  const currentSession = useTipDistributionStore(s => s.currentSession)
  const cashTipDeclarations = useTipDistributionStore(
    s => s.cashTipDeclarations
  )
  const isCalculating = useTipDistributionStore(s => s.isCalculating)
  const declareCashTips = useTipDistributionStore(s => s.declareCashTips)
  const setWizardStep = useTipDistributionStore(s => s.setWizardStep)
  const previewDistribution = useTipDistributionStore(
    s => s.previewDistribution
  )
  const approveDistribution = useTipDistributionStore(
    s => s.approveDistribution
  )
  const updateDetailAdjustment = useTipDistributionStore(
    s => s.updateDetailAdjustment
  )
  const reset = useTipDistributionStore(s => s.reset)
  const resetForNewSession = useTipDistributionStore(s => s.resetForNewSession)
  const previousSessions = useTipDistributionStore(s => s.previousSessions)
  const fetchPreviousSessions = useTipDistributionStore(s => s.fetchPreviousSessions)
  const storeError = useTipDistributionStore(s => s.error)
  const clearError = useTipDistributionStore(s => s.clearError)

  const employees = useEmployeeStore(s => s.employees)
  const loggedInEmployee = useEmployeeStore(s => s.loggedInEmployee)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)

  const date = sessionDate ?? new Date().toISOString().split('T')[0]

  const [focusedEmployeeId, setFocusedEmployeeId] = useState<string | null>(null)
  const [focusedDetailId, setFocusedDetailId] = useState<string | null>(null)
  const [clockedInStaffProfileIds, setClockedInStaffProfileIds] = useState<Set<string>>(new Set())
  const [isLoadingClockedInStaff, setIsLoadingClockedInStaff] = useState(false)
  // Tips pulled from payments, keyed by staff profile id (gross — what the
  // customer wrote on the slip; the bank deducts processor fee from this).
  const [cardTipsByStaff, setCardTipsByStaff] = useState<Record<string, number>>({})
  // Processor fee on each staff's card tips (informational; the merchant
  // never received this portion — the bank kept it).
  const [cardTipsFeeByStaff, setCardTipsFeeByStaff] = useState<Record<string, number>>({})
  // Tracks which staff already declared cash tips at clock-out (from employee_daily_tips)
  const [preDeclaredStaff, setPreDeclaredStaff] = useState<Set<string>>(new Set())


  // Fixed pixel height for the scrollable list cards
  // 96% sheet - 32px padding top/bottom - ~58px step indicator - 14px margin
  const listHeight = screenHeight * 0.9 - 32 - 58 - 14

  useEffect(() => {
    if (!isOpen || !selectedStore?.id) {
      setClockedInStaffProfileIds(new Set())
      setCardTipsByStaff({})
      return
    }

    setClockedInStaffProfileIds(new Set())
    setCardTipsByStaff({})
    setCardTipsFeeByStaff({})
    setPreDeclaredStaff(new Set())

    const tz = selectedStore?.timezone || 'UTC'
    const rollover = (selectedStore as any)?.business_day_start_hour ?? 0
    const bounds = getBusinessDayBounds(date, { timezone: tz, rolloverHour: rollover })
    let isCancelled = false

    const loadData = async () => {
      setIsLoadingClockedInStaff(true)
      try {
        // Fetch previous sessions first to determine the time window
        await fetchPreviousSessions(supabase, selectedStore.id, date)
        const sessions = useTipDistributionStore.getState().previousSessions
        const approved = sessions.filter(s => s.status === 'approved')
        const lastCutoff = approved.length > 0
          ? approved[approved.length - 1].dataCutoffAt
          : null
        const windowStart = lastCutoff || bounds.startUtc
        const windowEnd = bounds.endUtc

        // Load shifts, employee_daily_tips (pre-declared), and card tips in parallel
        // Shifts: include those started in window OR still active (no clock_out)
        const shiftsQuery = lastCutoff
          ? supabase
              .from('staff_shifts')
              .select('staff_profile_id')
              .eq('location_id', selectedStore.id)
              .gte('clock_in_time', bounds.startUtc)
              .lte('clock_in_time', windowEnd)
              .or(`clock_in_time.gte.${windowStart},clock_out_time.is.null,clock_out_time.gt.${windowStart}`)
          : supabase
              .from('staff_shifts')
              .select('staff_profile_id')
              .eq('location_id', selectedStore.id)
              .gte('clock_in_time', windowStart)
              .lte('clock_in_time', windowEnd)

        const [shiftsRes, dailyTipsRes, paymentsRes] = await Promise.all([
          shiftsQuery,
          supabase
            .from('employee_daily_tips')
            .select('staff_profile_id, charged_tips, cash_tips_declared')
            .eq('location_id', selectedStore.id)
            .eq('shift_date', date),
          supabase
            .from('order_payments')
            .select('tip_amount, tip_fee, order_id, payment_method, status, is_voided, is_returned')
            .eq('location_id', selectedStore.id)
            .neq('payment_method', 'cash')
            .gte('initiated_at', windowStart)
            .lte('initiated_at', windowEnd),
        ])

        if (shiftsRes.error) console.error('[TipDist] Failed to load shifts:', shiftsRes.error)
        if (dailyTipsRes.error) console.error('[TipDist] Failed to load daily tips:', dailyTipsRes.error)
        if (paymentsRes.error) console.error('[TipDist] Failed to load payments:', paymentsRes.error)

        if (isCancelled) return

        // Set clocked-in staff IDs
        const ids = new Set<string>(
          (shiftsRes.data || [])
            .map((row: { staff_profile_id: string | null }) => row.staff_profile_id)
            .filter((id): id is string => Boolean(id))
        )
        setClockedInStaffProfileIds(ids)

        // Pre-populate cash declarations from employee_daily_tips (declared at clock-out)
        const declared = new Set<string>()
        ;(dailyTipsRes.data || []).forEach((row: any) => {
          const staffId = row.staff_profile_id
          const cashDeclared = Number(row.cash_tips_declared) || 0
          if (staffId && cashDeclared > 0) {
            declareCashTips(staffId, cashDeclared)
            declared.add(staffId)
          }
        })
        setPreDeclaredStaff(declared)

        // Build card tips map from payments
        const validPayments = (paymentsRes.data || []).filter(
          (p: any) =>
            !p.is_voided &&
            !p.is_returned &&
            !['pending', 'processing', 'failed', 'declined', 'void'].includes(p.status)
        )
        const orderIds = [...new Set(validPayments.map((p: any) => p.order_id).filter(Boolean))]

        if (orderIds.length > 0 && !isCancelled) {
          const orderTipMap = new Map<string, number>()
          const orderFeeMap = new Map<string, number>()
          validPayments.forEach((p: any) => {
            if (!p.order_id) return
            orderTipMap.set(p.order_id, (orderTipMap.get(p.order_id) || 0) + Number(p.tip_amount || 0))
            orderFeeMap.set(p.order_id, (orderFeeMap.get(p.order_id) || 0) + Number(p.tip_fee || 0))
          })

          const { data: ordersRaw } = await supabase
            .from('orders')
            .select('id, assigned_server_id, created_by_staff_id')
            .in('id', orderIds)

          if (!isCancelled) {
            const cardMap: Record<string, number> = {}
            const feeMap: Record<string, number> = {}
            ;(ordersRaw || []).forEach((o: any) => {
              const sid = o.assigned_server_id || o.created_by_staff_id
              if (!sid) return
              if (orderTipMap.has(o.id)) cardMap[sid] = (cardMap[sid] || 0) + orderTipMap.get(o.id)!
              if (orderFeeMap.has(o.id)) feeMap[sid] = (feeMap[sid] || 0) + orderFeeMap.get(o.id)!
            })
            setCardTipsByStaff(cardMap)
            setCardTipsFeeByStaff(feeMap)
          }
        }
      } finally {
        if (!isCancelled) setIsLoadingClockedInStaff(false)
      }
    }

    void loadData()

    return () => { isCancelled = true }
  }, [date, isOpen, selectedStore?.id, supabase])

  const activeEmployees = useMemo(
    () => employees.filter(e => clockedInStaffProfileIds.has(e.profileId)),
    [clockedInStaffProfileIds, employees]
  )

  const handlePreview = useCallback(async () => {
    if (!selectedStore) return

    // Preview runs the full calculation in a rolled-back subtransaction — no DB writes
    // rebuild_employee_daily_tips is called internally by the preview RPC
    await previewDistribution(
      supabase,
      selectedStore.id,
      selectedStore.merchant_id,
      date,
    )
  }, [
    supabase,
    selectedStore,
    date,
    previewDistribution,
  ])

  const handleApprove = useCallback(async () => {
    if (!selectedStore || !loggedInEmployee) return
    // Real calculate + approve in one step (preview was a dry-run)
    await approveDistribution(
      supabase,
      selectedStore.id,
      selectedStore.merchant_id,
      date,
      loggedInEmployee.profileId,
    )
  }, [supabase, selectedStore, date, loggedInEmployee, approveDistribution])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  // ── Numpad helpers ──────────────────────────────────────────────────────────
  // Track raw string to preserve trailing dots/zeros during entry
  const [cashTipRaw, setCashTipRaw] = useState<string>('0')
  const [adjustmentRaw, setAdjustmentRaw] = useState<string>('0')

  // Sync raw string when focused employee changes
  useEffect(() => {
    if (focusedEmployeeId) {
      const val = cashTipDeclarations[focusedEmployeeId] ?? 0
      setCashTipRaw(val === 0 ? '0' : String(val))
    }
  }, [focusedEmployeeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focusedDetailId && currentSession) {
      const detail = currentSession.details.find(d => d.id === focusedDetailId)
      const val = detail?.manualAdjustment ?? 0
      setAdjustmentRaw(val === 0 ? '0' : String(val))
    }
  }, [focusedDetailId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isValidCurrencyAppend = (current: string, digit: string): string | null => {
    const next = current === '0' && digit !== '.' ? digit : current + digit
    // Allow valid currency format: digits with at most one dot and 2 decimal places
    if (/^\d*\.?\d{0,2}$/.test(next)) return next
    return null
  }

  const handleNumpadInput = (digit: string) => {
    if (!focusedEmployeeId) return
    const next = isValidCurrencyAppend(cashTipRaw, digit)
    if (next === null) return
    setCashTipRaw(next)
    declareCashTips(focusedEmployeeId, parseFloat(next) || 0)
  }
  const handleNumpadBackspace = () => {
    if (!focusedEmployeeId) return
    const next = cashTipRaw.length <= 1 ? '0' : cashTipRaw.slice(0, -1)
    setCashTipRaw(next)
    declareCashTips(focusedEmployeeId, parseFloat(next) || 0)
  }
  const handleAdjustmentInput = (digit: string) => {
    if (!focusedDetailId || !currentSession) return
    const next = isValidCurrencyAppend(adjustmentRaw, digit)
    if (next === null) return
    setAdjustmentRaw(next)
    updateDetailAdjustment(focusedDetailId, parseFloat(next) || 0)
  }
  const handleAdjustmentBackspace = () => {
    if (!focusedDetailId || !currentSession) return
    const next = adjustmentRaw.length <= 1 ? '0' : adjustmentRaw.slice(0, -1)
    setAdjustmentRaw(next)
    updateDetailAdjustment(focusedDetailId, parseFloat(next) || 0)
  }

  // ── Step indicator ──────────────────────────────────────────────────────────
  const stepIndex = STEPS.findIndex(s => s.key === wizardStep)

  const renderStepIndicator = () => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        marginBottom: 14
      }}
    >
      <TouchableOpacity
        onPress={handleClose}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card
        }}
      >
        <X size={15} color={colors.label} />
      </TouchableOpacity>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8
        }}
      >
        {STEPS.map((step, i) => {
          const isActive = i === stepIndex
          const isDone = i < stepIndex
          const iconColor = isActive
            ? colors.onSolid
            : isDone
            ? colors.teal
            : colors.muted
          return (
            <React.Fragment key={step.key}>
              <TouchableOpacity
                onPress={() => {
                  if (i <= stepIndex) setWizardStep(step.key)
                }}
                disabled={i > stepIndex}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: isActive
                    ? colors.teal
                    : isDone
                    ? colors.teal + '60'
                    : colors.border,
                  backgroundColor: isActive
                    ? colors.teal
                    : isDone
                    ? colors.teal + '15'
                    : 'transparent',
                  opacity: !isActive && !isDone ? 0.45 : 1
                }}
              >
                {i === 0 && <DollarSign size={13} color={iconColor} />}
                {i === 1 && <Calculator size={13} color={iconColor} />}
                {i === 2 && <Edit3 size={13} color={iconColor} />}
                {i === 3 && <CheckCircle size={13} color={iconColor} />}
                <Text
                  style={{ fontSize: 12, fontWeight: '600', color: iconColor }}
                >
                  {step.label}
                </Text>
              </TouchableOpacity>
              {i < STEPS.length - 1 && (
                <ChevronRight size={13} color={colors.muted} />
              )}
            </React.Fragment>
          )
        })}
      </View>
    </View>
  )

  // ── Numpad panel ────────────────────────────────────────────────────────────
  const renderNumpad = (
    label: string,
    amount: string,
    active: boolean,
    onKey: (k: string) => void,
    onBack: () => void,
    actionBtn?: React.ReactNode
  ) => (
    <View
      style={{
        width: 260,
        height: listHeight,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: active ? colors.teal + '80' : colors.border,
        backgroundColor: colors.card,
        overflow: 'hidden'
      }}
    >
      {/* Display */}
      <View
        style={{
          backgroundColor: active ? colors.teal + '18' : colors.panel,
          padding: 16,
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: active ? colors.teal + '40' : colors.border
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: active ? colors.teal : colors.muted,
            letterSpacing: 0.3,
            marginBottom: 6
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            color: active ? colors.teal : colors.muted,
            letterSpacing: -0.5
          }}
        >
          {amount}
        </Text>
      </View>

      {/* Buttons */}
      <View style={{ padding: 10, gap: 6, flex: 1, justifyContent: 'center' }}>
        {NUM_PAD_ROWS.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
            {row.map(key => (
              <TouchableOpacity
                key={key}
                onPress={() => (key === '⌫' ? onBack() : onKey(key))}
                disabled={!active && key !== '⌫'}
                style={{
                  flex: 1,
                  paddingVertical: 16,
                  borderRadius: 10,
                  backgroundColor:
                    key === '⌫' ? colors.danger + '12' : colors.panel,
                  borderWidth: 1,
                  borderColor:
                    key === '⌫' ? colors.danger + '35' : colors.border,
                  alignItems: 'center',
                  opacity: !active && key !== '⌫' ? 0.3 : 1
                }}
              >
                <Text
                  style={{
                    fontSize: 19,
                    fontWeight: key === '⌫' ? '700' : '500',
                    color: key === '⌫' ? colors.danger : colors.heading
                  }}
                >
                  {key}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {actionBtn && (
        <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
          {actionBtn}
        </View>
      )}
    </View>
  )

  // ── Step 1: Declare ─────────────────────────────────────────────────────────
  const renderDeclareStep = () => {
    const focusedEmp = employees.find(e => e.profileId === focusedEmployeeId)
    const focusedAmount = focusedEmployeeId
      ? (cashTipDeclarations[focusedEmployeeId] ?? 0).toFixed(2)
      : '0.00'

    return (
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {/* Left card — fixed height, rows scroll inside */}
        <View
          style={{
            flex: 1,
            height: listHeight,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              padding: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: colors.panel
            }}
          >
            <Text
              style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}
            >
              Tip Declaration
            </Text>
            <Text style={{ fontSize: 11, color: colors.label, marginTop: 3 }}>
              Card tips are pre-filled. Tap a server to adjust their cash tips.
            </Text>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 10, gap: 6 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled
            nestedScrollEnabled
          >
            {isLoadingClockedInStaff && (
              <View style={{ paddingVertical: 8 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.label,
                    textAlign: 'center'
                  }}
                >
                  Loading staff clock-ins for {date}...
                </Text>
              </View>
            )}
            {activeEmployees.length === 0 && (
              <Text
                style={{
                  fontSize: 12,
                  color: colors.muted,
                  textAlign: 'center',
                  paddingVertical: 20
                }}
              >
                No staff clock-ins found for this day.
              </Text>
            )}
            {activeEmployees.map(emp => {
              const isSelected = focusedEmployeeId === emp.profileId
              const cashAmount = cashTipDeclarations[emp.profileId] ?? 0
              const cardAmount = cardTipsByStaff[emp.profileId] ?? 0
              const cardFee = cardTipsFeeByStaff[emp.profileId] ?? 0
              const cardAmountNet = Math.max(0, cardAmount - cardFee)
              return (
                <TouchableOpacity
                  key={emp.id}
                  onPress={() => setFocusedEmployeeId(emp.profileId)}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: isSelected ? colors.teal + '12' : colors.panel,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.teal : colors.border
                  }}
                >
                  {/* Top row: avatar + name + total */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: isSelected ? colors.teal + '30' : colors.card,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.teal : colors.border,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? colors.teal : colors.label }}>
                        {initials(emp.displayName)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>
                        {emp.displayName}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.label, marginTop: 1 }}>
                        {emp.role.replace('merchant.', '')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.teal }}>
                        ${(cardAmountNet + cashAmount).toFixed(2)}
                      </Text>
                      <Text style={{ fontSize: 9, color: colors.muted, marginTop: 1 }}>net tips</Text>
                    </View>
                  </View>

                  {/* Bottom row: card tips chip + cash declaration */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <View style={{
                      flex: 1,
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text style={{ fontSize: 9, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Card Tips</Text>
                        {cardFee > 0 && (
                          <Text style={{ fontSize: 8, color: colors.muted }}>
                            net of ${cardFee.toFixed(2)} fee
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: cardAmountNet > 0 ? colors.heading : colors.muted }}>
                        ${cardAmountNet.toFixed(2)}
                      </Text>
                      {cardFee > 0 && (
                        <Text style={{ fontSize: 9, color: colors.muted, marginTop: 1 }}>
                          gross ${cardAmount.toFixed(2)}
                        </Text>
                      )}
                    </View>
                    <View style={{
                      flex: 1,
                      backgroundColor: isSelected ? colors.teal + '15' : colors.card,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.teal + '50' : colors.border,
                      borderRadius: 8,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                        <Text style={{ fontSize: 9, color: isSelected ? colors.teal : colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Cash Tips</Text>
                        {preDeclaredStaff.has(emp.profileId) && (
                          <View style={{ backgroundColor: colors.success + '20', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 7, fontWeight: '700', color: colors.success }}>DECLARED</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: cashAmount > 0 ? colors.teal : colors.muted }}>
                        ${cashAmount.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* Right — numpad */}
        {renderNumpad(
          focusedEmp ? `${focusedEmp.displayName} — Cash Tips` : 'Select an employee',
          `$${focusedAmount}`,
          !!focusedEmployeeId,
          handleNumpadInput,
          handleNumpadBackspace,
          <TouchableOpacity
            onPress={handlePreview}
            disabled={isCalculating}
            style={{
              paddingVertical: 14,
              borderRadius: 10,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: colors.teal
            }}
          >
            {isCalculating ? (
              <ActivityIndicator color={colors.onSolid} />
            ) : (
              <>
                <Calculator size={15} color={colors.onSolid} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.onSolid
                  }}
                >
                  Preview
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    )
  }

  // ── Step 2: Calculating ─────────────────────────────────────────────────────
  const renderCalculateStep = () => (
    <View
      style={{
        height: listHeight,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12
      }}
    >
      <Calculator size={48} color={colors.teal} />
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>
        Previewing Distribution...
      </Text>
      <Text style={{ fontSize: 12, color: colors.label }}>
        Running preview — no changes saved until you approve.
      </Text>
    </View>
  )

  // ── Step 3: Review & Adjust ─────────────────────────────────────────────────
  const renderReviewStep = () => {
    if (!currentSession) return null

    const fmtCell = (v: number) => v === 0 ? '-' : formatCurrency(v)
    const fmtPoolCell = (v: number, positive: boolean) =>
      v === 0 ? '-' : `${positive ? '+' : '-'}${formatCurrency(v)}`

    // Sum the processor (bank) fee taken on card tips for this session.
    // Source: cardTipsFeeByStaff (built from order_payments.tip_fee in the
    // declare-step fetch). Reflects what the bank kept before paying the
    // merchant — already netted out of the distribution numbers.
    const totalProcessorFee = Object.values(cardTipsFeeByStaff).reduce(
      (sum, v) => sum + (v || 0),
      0,
    )

    const COL = { name: 2.2, role: 1.2, hrs: 0.7, tips: 0.9, poolIn: 0.9, poolOut: 0.9, net: 1 }

    return (
      <View style={{ flex: 1, gap: 8 }}>
        {currentSession.status === 'preview' && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: 8,
              backgroundColor: colors.warning + '12',
              borderWidth: 1,
              borderColor: colors.warning + '30',
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.warning }}>
              Preview — no changes saved yet. Approve to finalize.
            </Text>
          </View>
        )}

        {/* Summary tiles */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            {
              label: 'Tips Collected',
              value: currentSession.totalTipsCollected,
              subtitle: totalProcessorFee > 0
                ? `net of $${totalProcessorFee.toFixed(2)} bank fee`
                : undefined,
            },
            { label: 'Pooled', value: currentSession.totalTipsPooled },
            { label: 'Tip-Outs', value: currentSession.totalTipOuts },
            {
              label: 'Total Distributed',
              value: currentSession.totalDistributed,
              highlight: true,
            },
          ].map(({ label, value, highlight, subtitle }) => (
            <View
              key={label}
              style={{
                flex: 1,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: highlight ? colors.teal + '40' : colors.border,
                backgroundColor: highlight ? colors.teal + '10' : colors.card,
                padding: 10,
              }}
            >
              <Text style={{ fontSize: 9, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {label}
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: highlight ? colors.teal : colors.heading, marginTop: 3 }}>
                {formatCurrency(value)}
              </Text>
              {subtitle && (
                <Text style={{ fontSize: 8, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* Bank fee transparency banner — shows what the processor ate
            on card tips for this session. Pure reporting; the distribution
            already nets this out via employee_daily_tips.charged_tips. */}
        {totalProcessorFee > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderRadius: 8,
              backgroundColor: colors.warning + '10',
              borderWidth: 1,
              borderColor: colors.warning + '30',
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            <DollarSign size={14} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.warning }}>
                Bank processor fee on card tips: ${totalProcessorFee.toFixed(2)}
              </Text>
              <Text style={{ fontSize: 10, color: colors.label, marginTop: 1 }}>
                The bank deducts this from the merchant payout before tips are distributed. Already netted out of the numbers above.
              </Text>
            </View>
          </View>
        )}

        {/* Table */}
        <View
          style={{
            flex: 1,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            overflow: 'hidden',
          }}
        >
          {/* Header row */}
          <View
            style={{
              flexDirection: 'row',
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: colors.panel,
            }}
          >
            <Text style={{ flex: COL.name, fontSize: 10, fontWeight: '700', color: colors.muted }}>Employee</Text>
            <Text style={{ flex: COL.role, fontSize: 10, fontWeight: '700', color: colors.muted }}>Role</Text>
            <Text style={{ flex: COL.hrs, fontSize: 10, fontWeight: '700', color: colors.muted, textAlign: 'right' }}>Hours</Text>
            <Text style={{ flex: COL.tips, fontSize: 10, fontWeight: '700', color: colors.muted, textAlign: 'right' }}>Own Tips</Text>
            <Text style={{ flex: COL.poolIn, fontSize: 10, fontWeight: '700', color: colors.muted, textAlign: 'right' }}>Pool In</Text>
            <Text style={{ flex: COL.poolOut, fontSize: 10, fontWeight: '700', color: colors.muted, textAlign: 'right' }}>Pool Out</Text>
            <Text style={{ flex: COL.net, fontSize: 10, fontWeight: '700', color: colors.teal, textAlign: 'right' }}>Net Tips</Text>
          </View>

          {/* Data rows */}
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {currentSession.details.map((detail, idx) => (
              <View
                key={detail.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderBottomWidth: idx < currentSession.details.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ flex: COL.name, fontSize: 12, fontWeight: '600', color: colors.heading }} numberOfLines={1}>
                  {detail.staffName || detail.staffProfileId.slice(0, 8)}
                </Text>
                <View style={{ flex: COL.role }}>
                  <View style={{
                    alignSelf: 'flex-start',
                    backgroundColor: colors.panel,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                  }}>
                    <Text style={{ fontSize: 9, color: colors.label }}>{detail.roleCode.replace('merchant.', '')}</Text>
                  </View>
                </View>
                <Text style={{ flex: COL.hrs, fontSize: 11, color: colors.heading, textAlign: 'right' }}>
                  {detail.hoursWorked.toFixed(1)}
                </Text>
                <Text style={{ flex: COL.tips, fontSize: 11, color: colors.heading, textAlign: 'right' }}>
                  {fmtCell(detail.individualTipsEarned)}
                </Text>
                <Text style={{ flex: COL.poolIn, fontSize: 11, color: detail.tipPoolReceived > 0 ? colors.success : colors.muted, textAlign: 'right', fontWeight: detail.tipPoolReceived > 0 ? '600' : '400' }}>
                  {fmtPoolCell(detail.tipPoolReceived, true)}
                </Text>
                <Text style={{ flex: COL.poolOut, fontSize: 11, color: detail.tipPoolContributed > 0 ? colors.danger : colors.muted, textAlign: 'right', fontWeight: detail.tipPoolContributed > 0 ? '600' : '400' }}>
                  {fmtPoolCell(detail.tipPoolContributed, false)}
                </Text>
                <Text style={{ flex: COL.net, fontSize: 12, fontWeight: '700', color: colors.teal, textAlign: 'right' }}>
                  {formatCurrency(detail.netTips)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Approve button */}
        <TouchableOpacity
          onPress={handleApprove}
          style={{
            paddingVertical: 14,
            borderRadius: 10,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.teal,
          }}
        >
          <Check size={15} color={colors.onSolid} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onSolid }}>
            Approve
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Step 4: Approved ────────────────────────────────────────────────────────
  const renderApproveStep = () => (
    <View
      style={{
        height: listHeight,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12
      }}
    >
      <CheckCircle size={56} color={colors.success} />
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.heading }}>
        Session #{currentSession?.sequenceNumber ?? 1} Approved
      </Text>
      <Text style={{ fontSize: 12, color: colors.label, textAlign: 'center' }}>
        {currentSession?.dataStartAfter
          ? `Covers activity since ${new Date(currentSession.dataStartAfter).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : `All activity for ${date}`}
        {'\n'}Total: {formatCurrency(currentSession?.totalDistributed || 0)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <TouchableOpacity
          onPress={handleClose}
          style={{
            paddingVertical: 11,
            paddingHorizontal: 24,
            borderRadius: 10,
            backgroundColor: colors.teal,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.onSolid }}>
            Done
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            resetForNewSession()
            fetchPreviousSessions(supabase, selectedStore?.id || '', date)
          }}
          style={{
            paddingVertical: 11,
            paddingHorizontal: 24,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.teal + '50',
            backgroundColor: colors.teal + '12',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>
            Start Another Close-Out
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  // ── Footer with Back navigation ─────────────────────────────────────────────
  const renderFooter = () => {
    // No footer on calculate (auto-transitions) or approve (has inline Done)
    if (wizardStep === 'calculate' || wizardStep === 'approve') return null

    const canGoBack = wizardStep === 'review'

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        {canGoBack ? (
          <TouchableOpacity
            onPress={() => setWizardStep('declare')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 10,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronLeft size={16} color={colors.label} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label, marginLeft: 4 }}>
              Back to Declare
            </Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={isOpen}
      transparent
      animationType='slide'
      onRequestClose={handleClose}
    >
      {/* Backdrop — non-dismissible, only X button closes */}
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'flex-end'
        }}
      >
        <View
          style={{
            height: '100%',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            backgroundColor: colors.screen,
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: 8,
          }}
        >
          {renderStepIndicator()}
          {!!storeError && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.danger + '55',
                backgroundColor: colors.danger + '12',
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 8,
              }}
            >
              <Text style={{ flex: 1, fontSize: 12, color: colors.danger, fontWeight: '600' }}>
                {storeError}
              </Text>
              <TouchableOpacity onPress={clearError} hitSlop={8}>
                <X size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
          {/* Multi-session context banner */}
          {(() => {
            const approvedPrev = previousSessions.filter(s => s.status === 'approved')
            const lastApproved = approvedPrev[approvedPrev.length - 1]
            const seqNum = currentSession?.sequenceNumber ?? (approvedPrev.length + 1)
            // Use currentSession's start if available, otherwise derive from last approved cutoff
            const windowStart = currentSession?.dataStartAfter
              ?? lastApproved?.dataCutoffAt
              ?? null

            return (
              <View
                style={{
                  borderRadius: 10,
                  backgroundColor: colors.teal + '08',
                  borderWidth: 1,
                  borderColor: colors.teal + '25',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}>
                  Session #{seqNum} · {windowStart
                    ? `Since ${new Date(windowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'All activity today'}
                </Text>
                {lastApproved && (
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
                    Prior: Session #{lastApproved.sequenceNumber} (Approved, {formatCurrency(lastApproved.totalDistributed)} distributed)
                  </Text>
                )}
              </View>
            )
          })()}
          {wizardStep === 'declare' && renderDeclareStep()}
          {wizardStep === 'calculate' && renderCalculateStep()}
          {wizardStep === 'review' && renderReviewStep()}
          {wizardStep === 'approve' && renderApproveStep()}
          {renderFooter()}
        </View>
      </View>
    </Modal>
  )
}

export default TipDistributionWizard
