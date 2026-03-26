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
import { colors } from '@/lib/theme'
import type { MerchantRole } from '@/lib/types'
import { recordDrawerOperation } from '@/services/cashDrawerService'
import { PrinterService } from '@/services/printing/PrinterService'
import { useCashDrawerStore } from '@/stores/useCashDrawerStore'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { formatCurrency } from '@/utils/currency'
import React, { useCallback, useState } from 'react'
import {
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native'
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
  const { show } = useToast()

  const drawerId = useCashDrawerStore(s => s.drawerId)
  const activeSession = useCashDrawerStore(s => s.activeSession)
  const getRunningBalance = useCashDrawerStore(s => s.getRunningBalance)

  const loggedInEmployee = useEmployeeStore(s => s.loggedInEmployee)

  const [amount, setAmount] = useState('')
  const [selectedReason, setSelectedReason] = useState<string | null>(
    mode === 'cash_drop' ? 'Safe Drop' : null
  )
  const [customReason, setCustomReason] = useState('')
  const [pin, setPin] = useState('')
  const [approvedBy, setApprovedBy] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const shakeX = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }]
  }))

  const parsedAmount = parseFloat(amount)
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0
  const reason = selectedReason === 'Other' ? customReason : selectedReason
  const balance = getRunningBalance()
  const showBalanceWarning =
    (mode === 'pay_out' || mode === 'cash_drop') &&
    isValidAmount &&
    parsedAmount > balance

  const canSubmit = isValidAmount && approvedBy && reason

  const handlePinSubmit = useCallback(() => {
    const employee = useEmployeeStore.getState().findEmployeeByPin(pin)
    const isManager = employee && MANAGER_ROLES.includes(employee.role)

    if (isManager) {
      setApprovedBy(employee.displayName || employee.id)
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
      approvedBy: approvedBy || undefined
    })

    // Open physical drawer for pay_in/pay_out (not cash_drop — goes to safe)
    if (mode !== 'cash_drop') {
      try {
        await PrinterService.openCashDrawer()
      } catch {
        // Non-blocking
      }
    }

    show({
      title: MODE_TITLES[mode],
      message: `${MODE_TITLES[mode]} of ${formatCurrency(
        parsedAmount
      )} recorded.`,
      type: 'success'
    })

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
    setPin('')
    setApprovedBy(null)
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const chips = REASON_CHIPS[mode] || []
  const accentColor = MODE_ACCENTS[mode]
  const modeSubtitle = MODE_SUBTITLES[mode]
  const actionLabel =
    mode === 'cash_drop' ? 'Record Drop' : `Record ${MODE_TITLES[mode]}`
  const { width: screenWidth } = useWindowDimensions()
  const isTwoColumn = screenWidth >= 860

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
          paddingHorizontal: 20
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            width: '100%',
            maxWidth: isTwoColumn ? 860 : 430,
            alignSelf: 'center'
          }}
        >
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 11,
                backgroundColor: accentColor + '12',
                borderBottomWidth: 1,
                borderBottomColor: accentColor + '35'
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {MODE_TITLES[mode]}
              </Text>
              <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
                {modeSubtitle}
              </Text>
            </View>

            <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              <View
                style={{
                  flexDirection: isTwoColumn ? 'row' : 'column',
                  gap: 12
                }}
              >
                <View style={{ flex: 1 }}>
                  {/* Current Balance */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 9
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.label
                      }}
                    >
                      Drawer Balance
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '700',
                        color: colors.teal
                      }}
                    >
                      {formatCurrency(balance)}
                    </Text>
                  </View>

                  {/* Amount Input */}
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: colors.label,
                      marginBottom: 4
                    }}
                  >
                    Amount
                  </Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder='0.00'
                    placeholderTextColor={colors.muted}
                    keyboardType='decimal-pad'
                    style={{
                      height: 44,
                      paddingHorizontal: 12,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 9,
                      color: colors.heading,
                      fontSize: 19,
                      fontWeight: '700',
                      marginBottom: 10
                    }}
                  />

                  {/* Balance Warning */}
                  {showBalanceWarning && (
                    <View
                      style={{
                        marginBottom: 10,
                        paddingHorizontal: 9,
                        paddingVertical: 6,
                        backgroundColor: colors.warning + '18',
                        borderWidth: 1,
                        borderColor: colors.warning + '50',
                        borderRadius: 9
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.warning,
                          fontWeight: '600'
                        }}
                      >
                        Amount exceeds current drawer balance.
                      </Text>
                    </View>
                  )}

                  {/* Reason Chips */}
                  {mode !== 'cash_drop' && (
                    <>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: colors.label,
                          marginBottom: 4
                        }}
                      >
                        Reason
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: 6,
                          marginBottom: 8
                        }}
                      >
                        {chips.map(chip => (
                          <TouchableOpacity
                            key={chip}
                            onPress={() => setSelectedReason(chip)}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                              borderRadius: 8,
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
                                fontSize: 11,
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
                        height: 40,
                        paddingHorizontal: 12,
                        backgroundColor: colors.screen,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 9,
                        color: colors.heading,
                        fontSize: 12,
                        marginBottom: 8
                      }}
                    />
                  )}
                </View>

                <View style={{ width: isTwoColumn ? 380 : '100%' }}>
                  {!approvedBy ? (
                    <Animated.View
                      style={[
                        shakeStyle,
                        {
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          backgroundColor: colors.screen,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 9
                        }
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: colors.label,
                          marginBottom: 6
                        }}
                      >
                        Manager PIN Required
                      </Text>
                      <PinDisplay pinLength={pin.length} maxLength={4} />
                      <PinNumpad
                        onKeyPress={input => {
                          if (typeof input === 'number') {
                            if (pin.length < 4) setPin(pin + input.toString())
                          } else if (input === 'clear') {
                            setPin('')
                          } else if (input === 'backspace') {
                            setPin(pin.slice(0, -1))
                          }
                        }}
                      />
                      <TouchableOpacity
                        onPress={handlePinSubmit}
                        style={{
                          marginTop: 8,
                          paddingVertical: 8,
                          borderRadius: 8,
                          backgroundColor: accentColor
                        }}
                      >
                        <Text
                          style={{
                            textAlign: 'center',
                            fontSize: 12,
                            fontWeight: '700',
                            color: colors.onSolid
                          }}
                        >
                          Verify
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>
                  ) : (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: colors.teal + '15',
                        borderWidth: 1,
                        borderColor: colors.teal + '45',
                        borderRadius: 9
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.teal,
                          textAlign: 'center',
                          fontWeight: '600'
                        }}
                      >
                        Approved by: {approvedBy}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Confirm */}
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={!canSubmit || isSubmitting}
                style={{
                  marginTop: 8,
                  paddingVertical: 10,
                  borderRadius: 9,
                  alignItems: 'center',
                  backgroundColor:
                    canSubmit && !isSubmitting ? accentColor : colors.muted,
                  opacity: canSubmit && !isSubmitting ? 1 : 0.7
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.onSolid
                  }}
                >
                  {isSubmitting
                    ? 'Processing...'
                    : `${actionLabel}${
                        isValidAmount
                          ? ` (${formatCurrency(parsedAmount)})`
                          : ''
                      }`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleClose}
                style={{
                  marginTop: 6,
                  paddingVertical: 9,
                  borderRadius: 9,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panel
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.label
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

export default PayInOutModal
