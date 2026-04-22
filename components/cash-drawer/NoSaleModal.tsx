/**
 * NoSaleModal
 *
 * Dialog for performing a No Sale (open drawer without transaction).
 * Supports reason selection, optional manager PIN approval, and receipt printing.
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
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import React, { useCallback, useState } from 'react'
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming
} from 'react-native-reanimated'

interface NoSaleModalProps {
  isOpen: boolean
  onClose: () => void
}

const REASON_CHIPS = [
  'Making Change',
  'Checking Bills',
  'Manager Request',
  'Other'
]
const MANAGER_ROLES: MerchantRole[] = [
  'merchant.manager',
  'merchant.admin',
  'merchant.owner'
]

const NoSaleModal: React.FC<NoSaleModalProps> = ({ isOpen, onClose }) => {
  const supabase = useSupabaseClient()
  const { show } = useToast()

  const drawerId = useCashDrawerStore(s => s.drawerId)
  const drawerName = useCashDrawerStore(s => s.drawerName)
  const activeSession = useCashDrawerStore(s => s.activeSession)
  const getNoSaleCount = useCashDrawerStore(s => s.getNoSaleCount)

  const loggedInEmployee = useEmployeeStore(s => s.loggedInEmployee)

  const cashDrawerSettings = useLocationConfigStore((s) => s.config.cashDrawer)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)

  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const [customReason, setCustomReason] = useState('')
  const [pin, setPin] = useState('')
  const [approvedBy, setApprovedBy] = useState<string | null>(null)
  const [approvedByName, setApprovedByName] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const shakeX = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }]
  }))

  const reason = selectedReason === 'Other' ? customReason : selectedReason
  const requiresApproval = cashDrawerSettings.requireNoSaleApproval
  const requiresReason = cashDrawerSettings.requireNoSaleReason

  const canSubmit =
    !!drawerId &&
    !!activeSession &&
    !!loggedInEmployee &&
    (!requiresReason || (reason && reason.trim().length > 0)) &&
    (!requiresApproval || approvedBy)

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

    try {
      await recordDrawerOperation(supabase, {
        cashDrawerId: drawerId,
        sessionId: activeSession.id,
        operationType: 'no_sale',
        amount: 0,
        performedBy: loggedInEmployee.profileId,
        reason: reason || undefined,
        approvedBy: approvedBy || undefined
      })

      // Open the physical cash drawer
      try {
        await PrinterService.openCashDrawer()
      } catch {
        // Non-blocking — drawer open is best-effort
      }

      show({
        title: 'No Sale',
        message: 'Cash drawer opened.',
        type: 'success'
      })

      // Check no-sale threshold after recording
      const noSaleCount = getNoSaleCount()
      const threshold = cashDrawerSettings.noSaleAlertThreshold
      if (threshold > 0 && noSaleCount >= threshold) {
        show({
          title: 'No-Sale Alert',
          message: `${noSaleCount} no-sale operations this session (threshold: ${threshold}). This will be flagged in the EOD audit.`,
          type: 'warning'
        })
      }

      // Print receipt if configured
      if (cashDrawerSettings.autoPrintNoSaleReceipt) {
        try {
          await PrinterService.printNoSaleReceipt({
            storeName: selectedStore?.name || 'Store',
            storeAddress: selectedStore?.address_line1 || undefined,
            drawerName: drawerName || 'Drawer',
            stationName: selectedStation?.station_name || 'Station',
            employeeName: loggedInEmployee.displayName || 'Employee',
            reason: reason || 'No reason',
            approvedBy: approvedBy || undefined,
            timestamp: new Date().toISOString(),
            locationId: selectedStore?.id || ''
          })
        } catch {
          // Non-blocking
        }
      }

      resetState()
      onClose()
    } catch (err) {
      console.error('[NoSaleModal] Failed:', err)
      show({
        title: 'Error',
        message: 'Failed to open drawer. Please try again.',
        type: 'error'
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    drawerId,
    activeSession,
    loggedInEmployee,
    canSubmit,
    reason,
    approvedBy,
    supabase,
    cashDrawerSettings,
    selectedStore,
    selectedStation,
    drawerName,
    show,
    onClose
  ])

  const resetState = () => {
    setSelectedReason(null)
    setCustomReason('')
    setPin('')
    setApprovedBy(null)
    setApprovedByName(null)
  }

  const handleClose = () => {
    resetState()
    onClose()
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
          paddingHorizontal: 20
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{ width: '100%', maxWidth: 440 }}
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
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: colors.teal + '12',
                borderBottomWidth: 1,
                borderBottomColor: colors.teal + '35'
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                No Sale
              </Text>
              <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
                Open drawer without a payment transaction
              </Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps='handled'
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingVertical: 12
              }}
            >
              <View
                style={{
                  marginBottom: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10
                }}
              >
                <Text style={{ fontSize: 11, color: colors.label }}>
                  Reason {requiresReason ? '(required)' : '(optional)'}
                </Text>
              </View>

              {/* Reason Chips */}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 10
                }}
              >
                {REASON_CHIPS.map(chip => (
                  <TouchableOpacity
                    key={chip}
                    onPress={() => setSelectedReason(chip)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 9,
                      borderWidth: 1,
                      backgroundColor:
                        selectedReason === chip
                          ? colors.teal + '20'
                          : colors.screen,
                      borderColor:
                        selectedReason === chip
                          ? colors.teal + '55'
                          : colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: selectedReason === chip ? '700' : '500',
                        color:
                          selectedReason === chip ? colors.teal : colors.label
                      }}
                    >
                      {chip}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {selectedReason === 'Other' && (
                <TextInput
                  value={customReason}
                  onChangeText={setCustomReason}
                  placeholder='Enter reason...'
                  placeholderTextColor={colors.muted}
                  style={{
                    height: 42,
                    paddingHorizontal: 12,
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    color: colors.heading,
                    fontSize: 13,
                    marginBottom: 10
                  }}
                />
              )}

              {/* Manager PIN Approval */}
              {requiresApproval && !approvedBy && (
                <Animated.View
                  style={[
                    shakeStyle,
                    {
                      marginTop: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10
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
                    Manager Approval Required
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
                      paddingVertical: 9,
                      borderRadius: 9,
                      backgroundColor: colors.teal
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
              )}

              {approvedBy && (
                <View
                  style={{
                    marginTop: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: colors.teal + '15',
                    borderWidth: 1,
                    borderColor: colors.teal + '45',
                    borderRadius: 10
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
                    Approved by: {approvedByName}
                  </Text>
                </View>
              )}

              {/* No-sale threshold warning */}
              {cashDrawerSettings.noSaleAlertThreshold > 0 &&
                getNoSaleCount() >= cashDrawerSettings.noSaleAlertThreshold && (
                <View
                  style={{
                    marginTop: 4,
                    marginBottom: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: colors.danger + '15',
                    borderWidth: 1,
                    borderColor: colors.danger + '45',
                    borderRadius: 10
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.danger,
                      textAlign: 'center',
                      fontWeight: '600'
                    }}
                  >
                    {getNoSaleCount()} no-sale ops this session (threshold: {cashDrawerSettings.noSaleAlertThreshold})
                  </Text>
                </View>
              )}

              {/* Confirm */}
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={!canSubmit || isSubmitting}
                style={{
                  marginTop: 12,
                  paddingVertical: 11,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor:
                    canSubmit && !isSubmitting ? colors.teal : colors.muted,
                  opacity: canSubmit && !isSubmitting ? 1 : 0.7
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: '700',
                    color: colors.onSolid
                  }}
                >
                  {isSubmitting ? 'Opening...' : 'Open Drawer'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleClose}
                style={{
                  marginTop: 8,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panel
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.label
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              {(!drawerId || !activeSession) && (
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.danger,
                    textAlign: 'center',
                    marginTop: 8
                  }}
                >
                  No active drawer session. Open the drawer first.
                </Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

export default NoSaleModal
