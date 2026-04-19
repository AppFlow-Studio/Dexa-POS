/**
 * TipDistributionWizard
 * 4-step flow: Cash Tip Declaration -> Calculate -> Review/Adjust -> Approve
 */

import { useSupabaseClient } from '@/hooks/useSupabaseClient'
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
  { key: 'calculate', label: 'Calculate' },
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
  const calculateDistribution = useTipDistributionStore(
    s => s.calculateDistribution
  )
  const approveDistribution = useTipDistributionStore(
    s => s.approveDistribution
  )
  const updateDetailAdjustment = useTipDistributionStore(
    s => s.updateDetailAdjustment
  )
  const reset = useTipDistributionStore(s => s.reset)
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
  // Tips pulled from payments, keyed by staff profile id
  const [cardTipsByStaff, setCardTipsByStaff] = useState<Record<string, number>>({})
  // Tracks which staff already declared cash tips at clock-out (from employee_daily_tips)
  const [preDeclaredStaff, setPreDeclaredStaff] = useState<Set<string>>(new Set())


  // Fixed pixel height for the scrollable list cards
  // 96% sheet - 32px padding top/bottom - ~58px step indicator - 14px margin
  const listHeight = screenHeight * 0.96 - 32 - 58 - 14

  useEffect(() => {
    if (!isOpen || !selectedStore?.id) {
      setClockedInStaffProfileIds(new Set())
      setCardTipsByStaff({})
      return
    }

    setClockedInStaffProfileIds(new Set())
    setCardTipsByStaff({})
    setPreDeclaredStaff(new Set())

    const startOfDay = new Date(`${date}T00:00:00`).toISOString()
    const endOfDay = new Date(`${date}T23:59:59.999`).toISOString()
    let isCancelled = false

    const loadData = async () => {
      setIsLoadingClockedInStaff(true)
      try {
        // Load shifts, employee_daily_tips (pre-declared), and card tips in parallel
        const [shiftsRes, dailyTipsRes, paymentsRes] = await Promise.all([
          supabase
            .from('staff_shifts')
            .select('staff_profile_id')
            .eq('location_id', selectedStore.id)
            .gte('clock_in_time', startOfDay)
            .lte('clock_in_time', endOfDay),
          supabase
            .from('employee_daily_tips')
            .select('staff_profile_id, charged_tips, cash_tips_declared')
            .eq('location_id', selectedStore.id)
            .eq('shift_date', date),
          supabase
            .from('order_payments')
            .select('tip_amount, order_id, payment_method, status, is_voided, is_returned')
            .eq('location_id', selectedStore.id)
            .neq('payment_method', 'cash')
            .gte('initiated_at', startOfDay)
            .lte('initiated_at', endOfDay),
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
          validPayments.forEach((p: any) => {
            if (!p.order_id) return
            orderTipMap.set(p.order_id, (orderTipMap.get(p.order_id) || 0) + Number(p.tip_amount || 0))
          })

          const { data: ordersRaw } = await supabase
            .from('orders')
            .select('id, assigned_server_id, created_by_staff_id')
            .in('id', orderIds)

          if (!isCancelled) {
            const cardMap: Record<string, number> = {}
            ;(ordersRaw || []).forEach((o: any) => {
              const sid = o.assigned_server_id || o.created_by_staff_id
              if (!sid) return
              if (orderTipMap.has(o.id)) cardMap[sid] = (cardMap[sid] || 0) + orderTipMap.get(o.id)!
            })
            setCardTipsByStaff(cardMap)
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

  const handleCalculate = useCallback(async () => {
    if (!selectedStore || !loggedInEmployee) return

    // Rebuild employee_daily_tips from orders + shifts (server-side)
    // This picks up both charged tips from payments and cash declarations from staff_shifts
    try {
      const { error: rebuildErr } = await supabase.rpc('rebuild_employee_daily_tips', {
        p_location_id: selectedStore.id,
        p_shift_date: date,
      })
      if (rebuildErr) console.error('[TipDist] rebuild_employee_daily_tips error:', rebuildErr)
    } catch (e) {
      console.error('[TipDist] rebuild failed:', e)
    }

    await calculateDistribution(
      supabase,
      selectedStore.id,
      selectedStore.merchant_id,
      date,
      loggedInEmployee.profileId
    )
  }, [
    supabase,
    selectedStore,
    loggedInEmployee,
    date,
    calculateDistribution,
  ])

  const handleApprove = useCallback(async () => {
    if (!currentSession || !loggedInEmployee) return
    await approveDistribution(
      supabase,
      currentSession.id,
      loggedInEmployee.profileId
    )
  }, [supabase, currentSession, loggedInEmployee, approveDistribution])

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
                        ${(cardAmount + cashAmount).toFixed(2)}
                      </Text>
                      <Text style={{ fontSize: 9, color: colors.muted, marginTop: 1 }}>total tips</Text>
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
                      <Text style={{ fontSize: 9, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>Card Tips</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: cardAmount > 0 ? colors.heading : colors.muted }}>
                        ${cardAmount.toFixed(2)}
                      </Text>
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
            onPress={handleCalculate}
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
                  Calculate
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
        Calculating Distribution...
      </Text>
      <Text style={{ fontSize: 12, color: colors.label }}>
        Processing tip-out rules and pool configurations.
      </Text>
    </View>
  )

  // ── Step 3: Review & Adjust ─────────────────────────────────────────────────
  const renderReviewStep = () => {
    if (!currentSession) return null
    const focusedDetail = currentSession.details.find(
      d => d.id === focusedDetailId
    )
    const focusedAdjustment = focusedDetail
      ? (focusedDetail.manualAdjustment ?? 0).toFixed(2)
      : '0.00'

    return (
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {/* Left card */}
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
              Review Distribution
            </Text>
            <Text style={{ fontSize: 11, color: colors.label, marginTop: 3 }}>
              Tap an employee to adjust their tip amount.
            </Text>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 10, gap: 8 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled
            nestedScrollEnabled
          >
            {/* Summary */}
            <View
              style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panel,
                padding: 12
              }}
            >
              {[
                {
                  label: 'Tips Collected',
                  value: currentSession.totalTipsCollected
                },
                { label: 'Tip-Outs', value: currentSession.totalTipOuts },
                { label: 'Pooled', value: currentSession.totalTipsPooled }
              ].map(({ label, value }) => (
                <View
                  key={label}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginBottom: 6
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.label }}>
                    {label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    {formatCurrency(value)}
                  </Text>
                </View>
              ))}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: 8,
                  marginTop: 2,
                  flexDirection: 'row',
                  justifyContent: 'space-between'
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  Total Distributed
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: colors.teal
                  }}
                >
                  {formatCurrency(currentSession.totalDistributed)}
                </Text>
              </View>
            </View>

            {currentSession.details.map(detail => {
              const isSelected = focusedDetailId === detail.id
              return (
                <TouchableOpacity
                  key={detail.id}
                  onPress={() => setFocusedDetailId(detail.id)}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.teal : colors.border,
                    backgroundColor: isSelected
                      ? colors.teal + '12'
                      : colors.panel,
                    padding: 12
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 8
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: isSelected
                          ? colors.teal + '25'
                          : colors.card,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.teal : colors.border,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: isSelected ? colors.teal : colors.label
                        }}
                      >
                        {initials(detail.staffName || detail.staffProfileId)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: colors.heading
                        }}
                      >
                        {detail.staffName || detail.staffProfileId}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: colors.label,
                          marginTop: 1
                        }}
                      >
                        {detail.roleCode.replace('merchant.', '')}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      {formatCurrency(detail.netTips)}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginBottom: 8
                    }}
                  >
                    {detail.individualTipsEarned > 0 && (
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 20,
                          backgroundColor: colors.teal + '18',
                          borderWidth: 1,
                          borderColor: colors.teal + '40'
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: colors.teal
                          }}
                        >
                          Earned {formatCurrency(detail.individualTipsEarned)}
                        </Text>
                      </View>
                    )}
                    {detail.tipOutGiven > 0 && (
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 20,
                          backgroundColor: colors.danger + '12',
                          borderWidth: 1,
                          borderColor: colors.danger + '40'
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: colors.danger
                          }}
                        >
                          Tip-out -{formatCurrency(detail.tipOutGiven)}
                        </Text>
                      </View>
                    )}
                    {detail.tipOutReceived > 0 && (
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 20,
                          backgroundColor: colors.teal + '18',
                          borderWidth: 1,
                          borderColor: colors.teal + '40'
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: colors.teal
                          }}
                        >
                          +{formatCurrency(detail.tipOutReceived)}
                        </Text>
                      </View>
                    )}
                    {detail.tipPoolReceived > 0 && (
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 20,
                          backgroundColor: colors.info + '15',
                          borderWidth: 1,
                          borderColor: colors.info + '40'
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: colors.info
                          }}
                        >
                          Pool +{formatCurrency(detail.tipPoolReceived)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <Text style={{ fontSize: 11, color: colors.label }}>
                      Adjustment:
                    </Text>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: colors.inset,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.teal : colors.border,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 4
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: colors.heading,
                          textAlign: 'right'
                        }}
                      >
                        ${(detail.manualAdjustment ?? 0).toFixed(2)}
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
          focusedDetail
            ? focusedDetail.staffName || 'Employee'
            : 'Select an employee',
          `$${focusedAdjustment}`,
          !!focusedDetailId,
          handleAdjustmentInput,
          handleAdjustmentBackspace,
          <TouchableOpacity
            onPress={handleApprove}
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
            <Check size={15} color={colors.onSolid} />
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: colors.onSolid }}
            >
              Approve
            </Text>
          </TouchableOpacity>
        )}
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
        Distribution Approved
      </Text>
      <Text style={{ fontSize: 12, color: colors.label, textAlign: 'center' }}>
        Tips distributed for {date}.{'\n'}Total:{' '}
        {formatCurrency(currentSession?.totalDistributed || 0)}
      </Text>
      <TouchableOpacity
        onPress={handleClose}
        style={{
          marginTop: 8,
          paddingVertical: 11,
          paddingHorizontal: 28,
          borderRadius: 10,
          backgroundColor: colors.teal
        }}
      >
        <Text
          style={{ fontSize: 13, fontWeight: '700', color: colors.onSolid }}
        >
          Done
        </Text>
      </TouchableOpacity>
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
      {/* Backdrop */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end'
        }}
      >
        <View
          style={{
            height: '96%',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            backgroundColor: colors.screen,
            padding: 16
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
          {wizardStep === 'declare' && renderDeclareStep()}
          {wizardStep === 'calculate' && renderCalculateStep()}
          {wizardStep === 'review' && renderReviewStep()}
          {wizardStep === 'approve' && renderApproveStep()}
          {renderFooter()}
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

export default TipDistributionWizard
