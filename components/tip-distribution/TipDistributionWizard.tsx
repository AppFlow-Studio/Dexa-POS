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

  const employees = useEmployeeStore(s => s.employees)
  const loggedInEmployee = useEmployeeStore(s => s.loggedInEmployee)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)

  const date = sessionDate ?? new Date().toISOString().split('T')[0]

  const [focusedEmployeeId, setFocusedEmployeeId] = useState<string | null>(
    null
  )
  const [focusedDetailId, setFocusedDetailId] = useState<string | null>(null)
  const [clockedInStaffProfileIds, setClockedInStaffProfileIds] = useState<
    Set<string>
  >(new Set())
  const [isLoadingClockedInStaff, setIsLoadingClockedInStaff] = useState(false)

  // Fixed pixel height for the scrollable list cards
  // 96% sheet - 32px padding top/bottom - ~58px step indicator - 14px margin
  const listHeight = screenHeight * 0.96 - 32 - 58 - 14

  useEffect(() => {
    if (!isOpen || !selectedStore?.id) {
      setClockedInStaffProfileIds(new Set())
      return
    }

    setClockedInStaffProfileIds(new Set())

    const startOfDay = new Date(`${date}T00:00:00`).toISOString()
    const endOfDay = new Date(`${date}T23:59:59.999`).toISOString()
    let isCancelled = false

    const loadClockedInStaff = async () => {
      setIsLoadingClockedInStaff(true)
      try {
        const { data, error } = await supabase
          .from('staff_shifts')
          .select('staff_profile_id')
          .eq('location_id', selectedStore.id)
          .gte('clock_in_time', startOfDay)
          .lte('clock_in_time', endOfDay)

        if (error) {
          console.error(
            '[TipDist] Failed to load clocked-in staff for EOD:',
            error
          )
          return
        }

        if (!isCancelled) {
          const ids = new Set<string>(
            (data || [])
              .map(
                (row: { staff_profile_id: string | null }) =>
                  row.staff_profile_id
              )
              .filter((id): id is string => Boolean(id))
          )
          setClockedInStaffProfileIds(ids)
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingClockedInStaff(false)
        }
      }
    }

    void loadClockedInStaff()

    return () => {
      isCancelled = true
    }
  }, [date, isOpen, selectedStore?.id, supabase])

  const activeEmployees = useMemo(
    () => employees.filter(e => clockedInStaffProfileIds.has(e.profileId)),
    [clockedInStaffProfileIds, employees]
  )

  const handleCalculate = useCallback(async () => {
    if (!selectedStore || !loggedInEmployee) return

    // Save cash tip declarations to database before calculating
    const declarations = Object.entries(cashTipDeclarations).filter(
      ([_, amount]) => amount > 0
    )

    if (declarations.length > 0) {
      const updates = declarations.map(([staffProfileId, amount]) => ({
        staff_profile_id: staffProfileId,
        merchant_id: selectedStore.merchant_id,
        location_id: selectedStore.id,
        shift_date: date,
        cash_tips_declared: amount
      }))

      console.log('[TipDist] Upserting declarations:', updates)

      // Batch upsert all declarations at once
      const { data, error } = await supabase
        .from('employee_daily_tips')
        .upsert(updates, {
          onConflict: 'staff_profile_id,location_id,shift_date'
        })
      if (error) {
        console.error('[TipDist] Upsert error:', error)
        return
      }
      console.log('[TipDist] Upsert response:', { data, error })

      // Verify what was actually saved
      const { data: verifyData } = await supabase
        .from('employee_daily_tips')
        .select('staff_profile_id, cash_tips_declared, charged_tips')
        .eq('location_id', selectedStore.id)
        .eq('shift_date', date)
      console.log('[TipDist] Verified saved data:', verifyData)
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
    cashTipDeclarations
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
  const handleNumpadInput = (digit: string) => {
    if (!focusedEmployeeId) return
    const cur = cashTipDeclarations[focusedEmployeeId] ?? 0
    const str = cur === 0 ? digit : String(cur) + digit
    const num = parseFloat(str)
    declareCashTips(focusedEmployeeId, isNaN(num) ? 0 : num)
  }
  const handleNumpadBackspace = () => {
    if (!focusedEmployeeId) return
    const str = String(cashTipDeclarations[focusedEmployeeId] ?? 0)
    declareCashTips(focusedEmployeeId, parseFloat(str.slice(0, -1)) || 0)
  }
  const handleAdjustmentInput = (digit: string) => {
    if (!focusedDetailId || !currentSession) return
    const detail = currentSession.details.find(d => d.id === focusedDetailId)
    if (!detail) return
    const cur = detail.manualAdjustment ?? 0
    const str = cur === 0 ? digit : String(cur) + digit
    const num = parseFloat(str)
    updateDetailAdjustment(focusedDetailId, isNaN(num) ? 0 : num)
  }
  const handleAdjustmentBackspace = () => {
    if (!focusedDetailId || !currentSession) return
    const detail = currentSession.details.find(d => d.id === focusedDetailId)
    if (!detail) return
    updateDetailAdjustment(
      focusedDetailId,
      parseFloat(String(detail.manualAdjustment ?? 0).slice(0, -1)) || 0
    )
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
              Cash Tip Declarations
            </Text>
            <Text style={{ fontSize: 11, color: colors.label, marginTop: 3 }}>
              Tap an employee, then enter their cash tips.
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
              const amount = cashTipDeclarations[emp.profileId] ?? 0
              return (
                <TouchableOpacity
                  key={emp.id}
                  onPress={() => setFocusedEmployeeId(emp.profileId)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: isSelected
                      ? colors.teal + '12'
                      : colors.panel,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.teal : colors.border
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isSelected
                        ? colors.teal + '30'
                        : colors.card,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.teal : colors.border,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: isSelected ? colors.teal : colors.label
                      }}
                    >
                      {initials(emp.displayName)}
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
                      {emp.displayName}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: colors.label,
                        marginTop: 1
                      }}
                    >
                      {emp.role.replace('merchant.', '')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: amount > 0 ? colors.teal : colors.muted
                      }}
                    >
                      ${amount.toFixed(2)}
                    </Text>
                    {amount > 0 && (
                      <Text
                        style={{
                          fontSize: 9,
                          color: colors.success,
                          fontWeight: '600',
                          marginTop: 2
                        }}
                      >
                        DECLARED
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* Right — numpad */}
        {renderNumpad(
          focusedEmp ? focusedEmp.displayName : 'Select an employee',
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
        <TouchableOpacity
          activeOpacity={1}
          pointerEvents='box-none'
          style={{
            height: '96%',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            backgroundColor: colors.screen,
            padding: 16
          }}
        >
          {renderStepIndicator()}
          {wizardStep === 'declare' && renderDeclareStep()}
          {wizardStep === 'calculate' && renderCalculateStep()}
          {wizardStep === 'review' && renderReviewStep()}
          {wizardStep === 'approve' && renderApproveStep()}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

export default TipDistributionWizard
