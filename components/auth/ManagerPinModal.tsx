import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { toastService } from '@/lib/toastService'
import type { MerchantRole } from '@/lib/types'
import { OrderService } from '@/services/orderService'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useMenuStore } from '@/stores/useMenuStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePinOverrideStore } from '@/stores/usePinOverrideStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { Delete, Lock, X } from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

const MANAGER_ROLES: MerchantRole[] = [
  'merchant.manager',
  'merchant.admin',
  'merchant.owner',
]

const PIN_LENGTH = 4

// ─── PIN dots ────────────────────────────────────────────────────────────────

const PinDots = ({ length, shake }: { length: number; shake: Animated.SharedValue<number> }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }))

  return (
    <Animated.View style={[{ flexDirection: 'row', gap: s(18), justifyContent: 'center', marginBottom: s(28) }, animStyle]}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i < length ? s(18) : s(14),
            height: i < length ? s(18) : s(14),
            borderRadius: 999,
            backgroundColor: i < length ? colors.teal : colors.border,
            // Align centres so filled/empty dots don't jump
            alignSelf: 'center',
          }}
        />
      ))}
    </Animated.View>
  )
}

// ─── Numpad button ───────────────────────────────────────────────────────────

const KeyButton = ({
  label,
  onPress,
  variant = 'digit',
}: {
  label: React.ReactNode
  onPress: () => void
  variant?: 'digit' | 'action' | 'empty'
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={variant === 'empty' ? 1 : 0.6}
    disabled={variant === 'empty'}
    style={{
      width: s(80),
      height: s(64),
      borderRadius: s(14),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor:
        variant === 'digit' ? colors.card
        : variant === 'action' ? colors.screen
        : 'transparent',
      borderWidth: variant === 'digit' ? 1 : 0,
      borderColor: colors.border,
    }}
  >
    {typeof label === 'string' ? (
      <Text style={{ fontSize: s(22), fontWeight: '600', color: colors.heading }}>{label}</Text>
    ) : (
      label
    )}
  </TouchableOpacity>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const ManagerPinModal = () => {
  const { isPinModalOpen, closePinModal, actionToPerform, setUnlocked } = usePinOverrideStore()
  const addTemporaryMenuAccess = useMenuStore(s => s.addTemporaryMenuAccess)
  const addTemporaryCategoryAccess = useMenuStore(s => s.addTemporaryCategoryAccess)
  const timeoutMinutes = useStoreSettingsStore(s => s.managerOverrideTimeoutMinutes)
  const supabase = useSupabaseClient()
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const [pin, setPin] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const shakeX = useSharedValue(0)
  // ref to avoid stale closure inside auto-submit effect
  const pinRef = useRef(pin)
  pinRef.current = pin
  // Track open state synchronously so post-RPC effects (toast / setUnlocked /
  // closePinModal) can bail when the cashier cancelled mid-request.
  const isOpenRef = useRef(isPinModalOpen)
  isOpenRef.current = isPinModalOpen

  // Reset state whenever modal opens
  useEffect(() => {
    if (isPinModalOpen) {
      setPin('')
      setErrorMsg(null)
    }
  }, [isPinModalOpen])

  // Auto-submit when PIN_LENGTH digits are entered. isSubmitting must be in
  // deps AND the guard so a digit that lands while an earlier submit is still
  // in flight doesn't double-fire.
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !isSubmitting) {
      submitPin(pin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, isSubmitting])

  const submitPin = async (currentPin: string) => {
    const employee = useEmployeeStore.getState().findEmployeeByPin(currentPin)
    const isManager = employee && MANAGER_ROLES.includes(employee.role)

    if (!isManager) {
      shakeX.value = withSequence(
        withTiming(-12, { duration: 70 }),
        withTiming(12, { duration: 70 }),
        withTiming(-12, { duration: 70 }),
        withTiming(12, { duration: 70 }),
        withTiming(0, { duration: 70 }),
      )
      setErrorMsg(
        employee
          ? 'This employee does not have manager access.'
          : 'Incorrect PIN. Please try again.'
      )
      setPin('')
      return
    }

    // PIN accepted. Dispatch the action. Async actions (RPC-backed) hold the
    // modal open until the server responds so failures keep the cashier here
    // with a toast instead of dumping them back to the floor unsure if it
    // worked.
    if (actionToPerform?.type === 'select_menu') {
      addTemporaryMenuAccess(actionToPerform.payload.menuName)
      setUnlocked(timeoutMinutes)
      closePinModal()
      return
    }
    if (actionToPerform?.type === 'select_category') {
      addTemporaryCategoryAccess(actionToPerform.payload.categoryName)
      setUnlocked(timeoutMinutes)
      closePinModal()
      return
    }
    if (
      actionToPerform?.type === 'edit_service_charge' ||
      actionToPerform?.type === 'remove_service_charge'
    ) {
      const localOrderId = actionToPerform.payload.orderId
      const order = useOrderStore.getState().ordersById[localOrderId]
      const dbOrderId = order?.db_order_id
      if (!dbOrderId) {
        // Order hasn't synced yet — block the override; this is an unrealistic
        // case (the sheet would be opened on a draft) but worth a clean error.
        toastService.show({
          title: 'Cannot override yet',
          message: 'Order has not synced to the server.',
          type: 'error',
        })
        return
      }
      const isEdit = actionToPerform.type === 'edit_service_charge'
      const newAmount = isEdit ? actionToPerform.payload.newAmount : 0
      const overrideMode = isEdit ? (actionToPerform.payload.mode ?? 'amount') : 'amount'
      const overrideRate = isEdit ? (actionToPerform.payload.rate ?? null) : null
      // Edit: explicit taxable choice from the override sheet. Remove: leave
      // taxability untouched (null = server carries over prior value).
      const overrideIsTaxable = isEdit ? actionToPerform.payload.isTaxable : null
      const stationId =
        useStoreSettingsStore.getState().selectedStation?.id ?? null
      setIsSubmitting(true)
      const { data, error } = await OrderService.overrideServiceCharge(
        supabase,
        {
          p_order_id:   dbOrderId,
          p_manager_id: employee!.id,
          p_mode:       overrideMode,
          p_amount:     overrideMode === 'amount' ? newAmount : null,
          p_rate:       overrideMode === 'percent' ? overrideRate : null,
          p_reason:     actionToPerform.payload.reason ?? null,
          p_station_id: stationId,
          p_is_taxable: overrideIsTaxable,
        },
      )
      setIsSubmitting(false)
      // Cashier may have tapped X mid-RPC. Bail before toast/unlock/close so a
      // cancelled request can't grant a manager-session unlock after the user
      // already walked away.
      if (!isOpenRef.current) return
      if (error || !data?.success) {
        setErrorMsg(
          error?.message ??
            'Failed to update service charge. Please try again.'
        )
        toastService.show({
          title: 'Service charge override failed',
          message:
            error?.message ??
            'The server rejected the override (likely a payment exists on this order).',
          type: 'error',
        })
        setPin('')
        return
      }
      // Server is authoritative; fetch fresh order so amount_due / SC fields
      // in the local store match what the server just wrote. Uses the local
      // store key per useOrderStore convention.
      useOrderStore
        .getState()
        .syncOrderFromBackendComplete(localOrderId)
        .catch(() => {})
      toastService.show({
        title:
          actionToPerform.type === 'edit_service_charge'
            ? 'Service charge updated'
            : 'Service charge removed',
        message:
          actionToPerform.type === 'edit_service_charge'
            ? overrideMode === 'percent'
              ? `${overrideRate}% → $${newAmount.toFixed(2)}`
              : `New amount: $${newAmount.toFixed(2)}`
            : 'Service charge cleared from this order.',
        type: 'success',
      })
      setUnlocked(timeoutMinutes)
      closePinModal()
      return
    }

    // Unknown / unhandled action — still close (preserves prior behavior for
    // the generic "Manager Override" entry point).
    setUnlocked(timeoutMinutes)
    closePinModal()
  }

  const handleKey = (digit: string) => {
    if (pin.length < PIN_LENGTH) {
      setPin(p => p + digit)
      setErrorMsg(null)
    }
  }

  const handleBackspace = () => {
    setPin(p => p.slice(0, -1))
    setErrorMsg(null)
  }

  const handleClear = () => {
    setPin('')
    setErrorMsg(null)
  }

  // Context label
  const contextLabel =
    actionToPerform?.type === 'select_menu'
      ? `Unlock "${actionToPerform.payload.menuName}"`
      : actionToPerform?.type === 'select_category'
      ? `Unlock "${actionToPerform.payload.categoryName}" Category`
      : actionToPerform?.type === 'edit_service_charge'
      ? actionToPerform.payload.mode === 'percent'
        ? `Edit Service Charge — ${actionToPerform.payload.rate}% (≈ $${actionToPerform.payload.newAmount.toFixed(2)})`
        : `Edit Service Charge — $${actionToPerform.payload.newAmount.toFixed(2)}`
      : actionToPerform?.type === 'remove_service_charge'
      ? 'Remove Service Charge'
      : 'Manager Override'

  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ]

  return (
    <Modal
      visible={isPinModalOpen}
      transparent
      animationType='fade'
      onRequestClose={closePinModal}
      statusBarTranslucent
    >
      <Pressable
        onPress={closePinModal}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Card — stop propagation so tapping inside doesn't close */}
        <Pressable
          onPress={() => {}}
          style={{
            width: s(340),
            backgroundColor: colors.panel,
            borderRadius: s(20),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.5,
            shadowRadius: 24,
            elevation: 20,
          }}
        >
          {/* Teal accent bar */}
          <View style={{ height: 3, backgroundColor: colors.teal }} />

          <View style={{ padding: s(24), alignItems: 'center' }}>
            {/* Close button */}
            <TouchableOpacity
              onPress={closePinModal}
              style={{ position: 'absolute', top: s(14), right: s(14), padding: s(4) }}
            >
              <X size={s(18)} color={colors.muted} />
            </TouchableOpacity>

            {/* Lock icon */}
            <View style={{
              width: s(52), height: s(52), borderRadius: s(14),
              backgroundColor: colors.teal + '18',
              borderWidth: 1, borderColor: colors.teal + '40',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: s(12),
            }}>
              <Lock size={s(24)} color={colors.teal} />
            </View>

            {/* Context label */}
            <Text style={{ fontSize: s(15), fontWeight: '700', color: colors.heading, textAlign: 'center', marginBottom: s(4) }}>
              {contextLabel}
            </Text>
            <Text style={{ fontSize: s(12), color: colors.label, textAlign: 'center', marginBottom: s(20) }}>
              Enter manager PIN to continue
            </Text>

            {/* PIN dots */}
            <PinDots length={pin.length} shake={shakeX} />

            {/* Error */}
            {errorMsg && (
              <Text style={{ fontSize: s(11), color: colors.danger, textAlign: 'center', marginBottom: s(12), marginTop: s(-16) }}>
                {errorMsg}
              </Text>
            )}

            {/* Numpad */}
            <View style={{ gap: s(10) }}>
              {rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', gap: s(10) }}>
                  {row.map(d => (
                    <KeyButton key={d} label={d} onPress={() => handleKey(d)} />
                  ))}
                </View>
              ))}
              {/* Bottom row: clear | 0 | backspace */}
              <View style={{ flexDirection: 'row', gap: s(10) }}>
                <KeyButton
                  variant='action'
                  label={<X size={s(18)} color={colors.muted} />}
                  onPress={handleClear}
                />
                <KeyButton label='0' onPress={() => handleKey('0')} />
                <KeyButton
                  variant='action'
                  label={<Delete size={s(18)} color={colors.label} />}
                  onPress={handleBackspace}
                />
              </View>
            </View>

            {/* Submit button */}
            <TouchableOpacity
              onPress={() => pin.length > 0 && submitPin(pin)}
              disabled={pin.length === 0}
              activeOpacity={0.7}
              style={{
                marginTop: s(16),
                width: '100%',
                height: s(48),
                borderRadius: s(14),
                backgroundColor: pin.length === 0 ? colors.teal + '15' : colors.teal + '20',
                borderWidth: 1,
                borderColor: pin.length === 0 ? colors.teal + '20' : colors.teal + '60',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: s(14), fontWeight: '700', color: pin.length === 0 ? colors.muted : colors.teal }}>
                Submit
              </Text>
            </TouchableOpacity>

            {/* Timeout hint */}
            {timeoutMinutes > 0 && (
              <Text style={{ fontSize: s(10), color: colors.muted, textAlign: 'center', marginTop: s(12) }}>
                Access stays unlocked for {timeoutMinutes} min after verification
              </Text>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default ManagerPinModal
