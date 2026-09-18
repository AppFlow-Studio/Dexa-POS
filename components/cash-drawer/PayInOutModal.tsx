/**
 * PayInOutModal
 *
 * Dialog for Pay In, Pay Out, and Cash Drop operations.
 * Includes amount entry, reason selection, balance display, and manager PIN.
 */

import PinDisplay from '@/components/auth/PinDisplay'
import PinNumpad from '@/components/auth/PinNumpad'
import { useToast } from '@/contexts/ToastContext'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import {
  classifyKickOutcome,
  describeCashDrawerKickError,
  DRAWER_UNCONFIRMED_MESSAGE
} from '@/lib/cashDrawerKick'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import type { MerchantRole } from '@/lib/types'
import { recordDrawerOperation } from '@/services/cashDrawerService'
import { PrinterService } from '@/services/printing/PrinterService'
import { useCashDrawerStore } from '@/stores/useCashDrawerStore'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useInventoryStore } from '@/stores/useInventoryStore'
import { formatCurrency } from '@/utils/currency'
import React, { useCallback, useMemo, useState } from 'react'
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View, SafeAreaView } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming
} from 'react-native-reanimated'

interface PayInOutModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'pay_in' | 'pay_out' | 'cash_drop'
}

const MANAGER_ROLES: MerchantRole[] = [
  'merchant.manager',
  'merchant.admin',
  'merchant.owner'
]

const REASON_CHIPS: Record<string, string[]> = {
  pay_in: ['Added Change', 'Manager Float', 'Bank Deposit Return', 'Other'],
  pay_out: ['Vendor Payment', 'Petty Cash', 'Tip Out', 'Bank Run', 'Other'],
  cash_drop: ['Safe Drop']
}

const MODE_TITLES: Record<string, string> = {
  pay_in: 'Pay In',
  pay_out: 'Pay Out',
  cash_drop: 'Cash Drop'
}

const MODE_ACCENTS: Record<PayInOutModalProps['mode'], string> = {
  pay_in: colors.teal,
  pay_out: colors.danger,
  cash_drop: colors.teal
}

const MODE_SUBTITLES: Record<PayInOutModalProps['mode'], string> = {
  pay_in: 'Add cash into the active drawer',
  pay_out: 'Remove cash from the active drawer',
  cash_drop: 'Move excess cash to the safe'
}

const PayInOutModal: React.FC<PayInOutModalProps> = ({
  isOpen,
  onClose,
  mode
}) => {
  const supabase = useSupabaseClient()
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const { show } = useToast()

  const drawerId = useCashDrawerStore(s => s.drawerId)
  const activeSession = useCashDrawerStore(s => s.activeSession)
  const getRunningBalance = useCashDrawerStore(s => s.getRunningBalance)

  const loggedInEmployee = useEmployeeStore(s => s.loggedInEmployee)
  const vendors = useInventoryStore(s => s.vendors)

  const [amount, setAmount] = useState('')
  const [selectedReason, setSelectedReason] = useState<string | null>(
    mode === 'cash_drop' ? 'Safe Drop' : null
  )
  const [customReason, setCustomReason] = useState('')
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [approvedBy, setApprovedBy] = useState<string | null>(null)
  const [approvedByName, setApprovedByName] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const shakeX = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }]
  }))

  const parsedAmount = parseFloat(amount)
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0
  const displayAmount = amount.length > 0 ? amount : '0.00'
  const reason = selectedReason === 'Other' ? customReason : selectedReason
  const hasReason = Boolean(reason && reason.trim().length > 0)
  const requiresVendorSelection =
    mode === 'pay_out' && selectedReason === 'Vendor Payment'
  const selectedVendor =
    vendors.find(v => v.id === selectedVendorId) ?? null
  const balance = getRunningBalance()
  const showBalanceWarning =
    (mode === 'pay_out' || mode === 'cash_drop') &&
    isValidAmount &&
    parsedAmount > balance

  const canSubmit = isValidAmount && approvedBy && hasReason
  const sortedVendors = useMemo(
    () => [...vendors].sort((a, b) => a.name.localeCompare(b.name)),
    [vendors]
  )

  React.useEffect(() => {
    if (!requiresVendorSelection && selectedVendorId) {
      setSelectedVendorId(null)
    }
  }, [requiresVendorSelection, selectedVendorId])

  const handlePinSubmit = useCallback(() => {
    const employee = useEmployeeStore.getState().findEmployeeByPin(pin)
    const isManager = employee && MANAGER_ROLES.includes(employee.role)

    if (isManager) {
      setApprovedBy(employee.profileId || employee.id)
      setApprovedByName(employee.displayName || employee.id)
      setPin('')
    } else {
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      )
      setPin('')
      show({
        title: 'Invalid PIN',
        message: employee
          ? 'This employee does not have manager access.'
          : 'PIN does not match any employee.',
        type: 'error'
      })
    }
  }, [pin, show, shakeX])

  const handleConfirm = useCallback(async () => {
    if (!drawerId || !activeSession || !loggedInEmployee || !canSubmit) return
    setIsSubmitting(true)

    await recordDrawerOperation(supabase, {
      cashDrawerId: drawerId,
      sessionId: activeSession.id,
      operationType: mode,
      amount: parsedAmount,
      performedBy: loggedInEmployee.profileId,
      reason: reason || undefined,
      vendorId: selectedVendorId || undefined,
      approvedBy: approvedBy || undefined
    })

    // Open physical drawer for pay_in/pay_out (not cash_drop — goes to safe).
    // The money movement is recorded regardless; a failed kick is surfaced as a
    // SEPARATE toast below so the two facts aren't conflated.
    const kick =
      mode !== 'cash_drop'
        ? await PrinterService.openCashDrawer({ trigger: mode })
        : null

    show({
      title: MODE_TITLES[mode],
      message: `${MODE_TITLES[mode]} of ${formatCurrency(
        parsedAmount
      )} recorded.`,
      type: 'success'
    })

    if (kick) {
      const outcome = classifyKickOutcome(kick)
      if (outcome === 'failed') {
        show({
          title: 'Drawer Did Not Open',
          message: describeCashDrawerKickError(kick),
          type: 'error'
        })
      } else if (outcome === 'unconfirmed') {
        show({
          title: 'Check the Drawer',
          message: DRAWER_UNCONFIRMED_MESSAGE,
          type: 'warning'
        })
      }
    }

    setIsSubmitting(false)
    resetState()
    onClose()
  }, [
    drawerId,
    activeSession,
    loggedInEmployee,
    canSubmit,
    parsedAmount,
    reason,
    approvedBy,
    mode,
    supabase,
    show,
    onClose
  ])

  const resetState = () => {
    setAmount('')
    setSelectedReason(mode === 'cash_drop' ? 'Safe Drop' : null)
    setCustomReason('')
    setSelectedVendorId(null)
    setPin('')
    setApprovedBy(null)
    setApprovedByName(null)
    setStep(1)
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const appendAmountInput = (value: string) => {
    setAmount(prev => {
      if (value === '.') {
        if (prev.includes('.')) return prev
        return prev.length === 0 ? '0.' : prev + '.'
      }

      if (prev === '0' && value !== '.') return value

      if (prev.includes('.')) {
        const decimals = prev.split('.')[1] ?? ''
        if (decimals.length >= 2) return prev
      }

      return prev + value
    })
  }

  const removeAmountInput = () => {
    setAmount(prev => prev.slice(0, -1))
  }

  const clearAmountInput = () => {
    setAmount('')
  }

  const chips = REASON_CHIPS[mode] || []
  const accentColor = MODE_ACCENTS[mode]
  const modeSubtitle = MODE_SUBTITLES[mode]
  const actionLabel =
    mode === 'cash_drop' ? 'Record Drop' : `Record ${MODE_TITLES[mode]}`
  const canContinueToVendor = isValidAmount && hasReason
  const totalSteps = requiresVendorSelection ? 3 : 2
  const handlePrimaryContinue = () => {
    if (requiresVendorSelection) {
      setStep(2)
      return
    }
    setStep(3)
  }

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType='fade'
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: s(20)
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            width: '100%',
            maxWidth: s(720),
            maxHeight: '92%',
            alignSelf: 'center'
          }}
        >
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(16),
              overflow: 'hidden',
              flexDirection: 'column'
            }}
          >
            <View
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(8),
                backgroundColor: accentColor + '12',
                borderBottomWidth: 1,
                borderBottomColor: accentColor + '35'
              }}
            >
              <Text
                style={{
                  fontSize: s(16),
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {MODE_TITLES[mode]}
              </Text>
              <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(1) }}>
                {modeSubtitle}
              </Text>
              <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(2) }}>
                Step {step} of {totalSteps}
              </Text>
            </View>

            <ScrollView
              scrollEnabled={true}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: s(12), paddingVertical: s(10) }}
            >
              {step === 1 ? (
                <View style={{ flexDirection: 'row', gap: s(12) }}>
                  {/* Left column: amount display + numpad */}
                  <View style={{ flex: 1, gap: s(6) }}>
                    <View
                      style={{
                        borderRadius: s(9),
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.screen,
                        overflow: 'hidden'
                      }}
                    >
                      <View
                        style={{
                          minHeight: s(40),
                          paddingHorizontal: s(10),
                          paddingVertical: s(4),
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(22),
                            lineHeight: s(26),
                            fontWeight: '800',
                            color: colors.heading
                          }}
                        >
                          ${displayAmount}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: s(6),
                          paddingVertical: s(6),
                          gap: s(4)
                        }}
                      >
                        <PinNumpad
                          showDecimalKey
                          onDecimalPress={() => appendAmountInput('.')}
                          onKeyPress={input => {
                            if (typeof input === 'number') {
                              appendAmountInput(input.toString())
                            } else if (input === 'backspace') {
                              removeAmountInput()
                            } else {
                              clearAmountInput()
                            }
                          }}
                        />
                        <TouchableOpacity
                          onPress={clearAmountInput}
                          style={{
                            alignSelf: 'center',
                            minWidth: s(120),
                            minHeight: s(30),
                            borderRadius: s(8),
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.panel,
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text
                            style={{
                              fontSize: s(11),
                              fontWeight: '700',
                              color: colors.label
                            }}
                          >
                            Clear Amount
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Right column: balance + reason + continue */}
                  <View style={{ flex: 1, gap: s(6) }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: s(10),
                        paddingVertical: s(8),
                        backgroundColor: colors.screen,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: s(8)
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(11),
                          fontWeight: '600',
                          color: colors.label
                        }}
                      >
                        Drawer Balance
                      </Text>
                      <Text
                        style={{
                          fontSize: s(15),
                          fontWeight: '700',
                          color: colors.teal
                        }}
                      >
                        {formatCurrency(balance)}
                      </Text>
                    </View>

                    {showBalanceWarning && (
                      <View
                        style={{
                          paddingHorizontal: s(8),
                          paddingVertical: s(5),
                          backgroundColor: colors.warning + '18',
                          borderWidth: 1,
                          borderColor: colors.warning + '50',
                          borderRadius: s(8)
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(10),
                            color: colors.warning,
                            fontWeight: '600'
                          }}
                        >
                          Amount exceeds current drawer balance.
                        </Text>
                      </View>
                    )}

                    {mode !== 'cash_drop' && (
                      <>
                        <Text
                          style={{
                            fontSize: s(11),
                            fontWeight: '600',
                            color: colors.label
                          }}
                        >
                          Reason
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: s(6)
                          }}
                        >
                          {chips.map(chip => (
                            <TouchableOpacity
                              key={chip}
                              onPress={() => setSelectedReason(chip)}
                              style={{
                                paddingHorizontal: s(10),
                                paddingVertical: s(7),
                                borderRadius: s(8),
                                borderWidth: 1,
                                backgroundColor:
                                  selectedReason === chip
                                    ? accentColor + '20'
                                    : colors.screen,
                                borderColor:
                                  selectedReason === chip
                                    ? accentColor + '55'
                                    : colors.border
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: s(11),
                                  color:
                                    selectedReason === chip
                                      ? accentColor
                                      : colors.label,
                                  fontWeight:
                                    selectedReason === chip ? '700' : '500'
                                }}
                              >
                                {chip}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    {selectedReason === 'Other' && (
                      <TextInput
                        value={customReason}
                        onChangeText={setCustomReason}
                        placeholder='Enter reason...'
                        placeholderTextColor={colors.muted}
                        style={{
                          height: s(38),
                          paddingHorizontal: s(10),
                          backgroundColor: colors.screen,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: s(8),
                          color: colors.heading,
                          fontSize: s(12)
                        }}
                      />
                    )}

                    <TouchableOpacity
                      onPress={handlePrimaryContinue}
                      disabled={!canContinueToVendor}
                      style={{
                        marginTop: 'auto',
                        paddingVertical: s(11),
                        borderRadius: s(9),
                        alignItems: 'center',
                        backgroundColor: canContinueToVendor
                          ? accentColor
                          : colors.muted,
                        opacity: canContinueToVendor ? 1 : 0.7
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(12),
                          fontWeight: '700',
                          color: colors.onSolid
                        }}
                      >
                        {requiresVendorSelection
                          ? 'Continue to Vendor'
                          : 'Continue to Manager PIN'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : step === 2 ? (
                <View style={{ gap: s(4) }}>
                  <View
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: s(8),
                      paddingHorizontal: s(8),
                      paddingVertical: s(5),
                      gap: s(2)
                    }}
                  >
                    <Text style={{ fontSize: s(9), color: colors.muted }}>
                      Vendor
                    </Text>
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: '700',
                        color: selectedVendor ? accentColor : colors.heading
                      }}
                    >
                      {selectedVendor?.name || 'Select vendor'}
                    </Text>
                  </View>

                  <View
                    style={{
                      maxHeight: s(120),
                      borderRadius: s(10),
                      overflow: 'hidden'
                    }}
                  >
                    <ScrollView
                      nestedScrollEnabled
                      keyboardShouldPersistTaps='handled'
                      showsVerticalScrollIndicator={false}
                    >
                    <View style={{ gap: s(4) }}>
                    {sortedVendors.length > 0 ? (
                      sortedVendors.map(vendor => {
                        const isSelected = selectedVendorId === vendor.id
                        return (
                          <TouchableOpacity
                            key={vendor.id}
                            onPress={() => setSelectedVendorId(vendor.id)}
                            style={{
                              paddingHorizontal: s(10),
                              paddingVertical: s(8),
                              borderRadius: s(10),
                              borderWidth: 1,
                              borderColor: isSelected
                                ? accentColor + '55'
                                : colors.border,
                              backgroundColor: isSelected
                                ? accentColor + '18'
                                : colors.screen
                            }}
                          >
                            <Text
                              style={{
                                fontSize: s(12),
                                fontWeight: isSelected ? '700' : '600',
                                color: isSelected ? accentColor : colors.heading
                              }}
                            >
                              {vendor.name}
                            </Text>
                            {!!vendor.contactName && (
                              <Text
                                style={{
                                  fontSize: s(10),
                                  color: colors.muted,
                                  marginTop: s(2)
                                }}
                              >
                                {vendor.contactName}
                              </Text>
                            )}
                          </TouchableOpacity>
                        )
                      })
                    ) : (
                      <View
                        style={{
                          paddingHorizontal: s(12),
                          paddingVertical: s(14),
                          borderRadius: s(10),
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.screen
                        }}
                      >
                        <Text style={{ fontSize: s(11), color: colors.muted }}>
                          No vendors available.
                        </Text>
                      </View>
                    )}
                  </View>
                    </ScrollView>
                  </View>

                  <View style={{ flexDirection: 'row', gap: s(4) }}>
                    <TouchableOpacity
                      onPress={() => setStep(1)}
                      style={{
                        flex: 1,
                        paddingVertical: s(7),
                        borderRadius: s(8),
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.panel
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(10),
                          fontWeight: '600',
                          color: colors.label
                        }}
                      >
                        Back
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setStep(3)}
                      style={{
                        flex: 1,
                        paddingVertical: s(7),
                        borderRadius: s(8),
                        alignItems: 'center',
                        backgroundColor: accentColor
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(10),
                          fontWeight: '700',
                          color: colors.onSolid
                        }}
                      >
                        Next
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: s(12) }}>
                  {/* Left column: summary + approval status + actions */}
                  <View style={{ flex: 1, gap: s(8) }}>
                    <View
                      style={{
                        backgroundColor: colors.screen,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: s(8),
                        paddingHorizontal: s(10),
                        paddingVertical: s(8),
                        gap: s(2)
                      }}
                    >
                      <Text style={{ fontSize: s(10), color: colors.muted }}>
                        Amount
                      </Text>
                      <Text
                        style={{
                          fontSize: s(18),
                          fontWeight: '800',
                          color: colors.heading
                        }}
                      >
                        {formatCurrency(parsedAmount || 0)}
                      </Text>
                      <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(2) }}>
                        Reason: {reason}
                      </Text>
                      {selectedVendor && (
                        <Text style={{ fontSize: s(10), color: colors.muted }}>
                          Vendor: {selectedVendor.name}
                        </Text>
                      )}
                    </View>

                    {approvedBy && (
                      <View
                        style={{
                          paddingHorizontal: s(8),
                          paddingVertical: s(8),
                          backgroundColor: colors.teal + '15',
                          borderWidth: 1,
                          borderColor: colors.teal + '45',
                          borderRadius: s(8)
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(11),
                            color: colors.teal,
                            textAlign: 'center',
                            fontWeight: '600'
                          }}
                        >
                          ✓ Approved by {approvedByName}
                        </Text>
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', gap: s(6), marginTop: 'auto' }}>
                      <TouchableOpacity
                        onPress={() => setStep(requiresVendorSelection ? 2 : 1)}
                        style={{
                          flex: 1,
                          paddingVertical: s(11),
                          borderRadius: s(9),
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.panel
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(12),
                            fontWeight: '600',
                            color: colors.label
                          }}
                        >
                          Back
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleConfirm}
                        disabled={!canSubmit || isSubmitting}
                        style={{
                          flex: 1,
                          paddingVertical: s(11),
                          borderRadius: s(9),
                          alignItems: 'center',
                          backgroundColor:
                            canSubmit && !isSubmitting
                              ? accentColor
                              : colors.muted,
                          opacity: canSubmit && !isSubmitting ? 1 : 0.7
                        }}
                      >
                        <Text
                          style={{
                            textAlign: 'center',
                            fontSize: s(12),
                            fontWeight: '700',
                            color: colors.onSolid
                          }}
                        >
                          {isSubmitting ? 'Submitting...' : 'Confirm'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Right column: manager PIN entry */}
                  {!approvedBy && (
                    <Animated.View
                      style={[
                        shakeStyle,
                        {
                          flex: 1,
                          paddingHorizontal: s(8),
                          paddingVertical: s(8),
                          backgroundColor: colors.screen,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: s(8),
                          gap: s(6)
                        }
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: s(11),
                          fontWeight: '600',
                          color: colors.label
                        }}
                      >
                        Manager PIN
                      </Text>
                      <View style={{ alignItems: 'center', marginVertical: s(2) }}>
                        <PinDisplay pinLength={pin.length} maxLength={4} />
                      </View>
                      <PinNumpad
                        onKeyPress={input => {
                          if (typeof input === 'number') {
                            if (pin.length < 4) setPin(pin + input.toString())
                          } else if (input === 'clear') {
                            setPin('')
                          } else {
                            setPin(pin.slice(0, -1))
                          }
                        }}
                      />
                      <TouchableOpacity
                        onPress={handlePinSubmit}
                        style={{
                          paddingVertical: s(9),
                          borderRadius: s(8),
                          backgroundColor: accentColor
                        }}
                      >
                        <Text
                          style={{
                            textAlign: 'center',
                            fontSize: s(12),
                            fontWeight: '700',
                            color: colors.onSolid
                          }}
                        >
                          Verify PIN
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                </View>
              )}

            </ScrollView>

            <TouchableOpacity
              onPress={handleClose}
              style={{
                paddingHorizontal: s(10),
                paddingVertical: s(6),
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.panel,
                alignItems: 'center'
              }}
            >
              <Text
                style={{
                  fontSize: s(10),
                  fontWeight: '600',
                  color: colors.label
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

export default PayInOutModal
