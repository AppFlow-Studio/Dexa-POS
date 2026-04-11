import { colors } from '@/lib/theme'
import type { MerchantRole } from '@/lib/types'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useMenuStore } from '@/stores/useMenuStore'
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
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }))

  return (
    <Animated.View style={[{ flexDirection: 'row', gap: 18, justifyContent: 'center', marginBottom: 28 }, animStyle]}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i < length ? 18 : 14,
            height: i < length ? 18 : 14,
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
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={variant === 'empty' ? 1 : 0.6}
    disabled={variant === 'empty'}
    style={{
      width: 80,
      height: 64,
      borderRadius: 14,
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
      <Text style={{ fontSize: 22, fontWeight: '600', color: colors.heading }}>{label}</Text>
    ) : (
      label
    )}
  </TouchableOpacity>
)

// ─── Main component ───────────────────────────────────────────────────────────

const ManagerPinModal = () => {
  const { isPinModalOpen, closePinModal, actionToPerform, setUnlocked } = usePinOverrideStore()
  const addTemporaryMenuAccess = useMenuStore(s => s.addTemporaryMenuAccess)
  const addTemporaryCategoryAccess = useMenuStore(s => s.addTemporaryCategoryAccess)
  const timeoutMinutes = useStoreSettingsStore(s => s.managerOverrideTimeoutMinutes)

  const [pin, setPin] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const shakeX = useSharedValue(0)
  // ref to avoid stale closure inside auto-submit effect
  const pinRef = useRef(pin)
  pinRef.current = pin

  // Reset state whenever modal opens
  useEffect(() => {
    if (isPinModalOpen) {
      setPin('')
      setErrorMsg(null)
    }
  }, [isPinModalOpen])

  // Auto-submit when PIN_LENGTH digits are entered
  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      submitPin(pin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const submitPin = (currentPin: string) => {
    const employee = useEmployeeStore.getState().findEmployeeByPin(currentPin)
    const isManager = employee && MANAGER_ROLES.includes(employee.role)

    if (isManager) {
      // Grant access
      if (actionToPerform?.type === 'select_menu') {
        addTemporaryMenuAccess(actionToPerform.payload.menuName)
      } else if (actionToPerform?.type === 'select_category') {
        addTemporaryCategoryAccess(actionToPerform.payload.categoryName)
      }
      // Start unlock session if timeout > 0
      setUnlocked(timeoutMinutes)
      closePinModal()
    } else {
      // Shake + show error
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
    }
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
            width: 340,
            backgroundColor: colors.panel,
            borderRadius: 20,
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

          <View style={{ padding: 24, alignItems: 'center' }}>
            {/* Close button */}
            <TouchableOpacity
              onPress={closePinModal}
              style={{ position: 'absolute', top: 14, right: 14, padding: 4 }}
            >
              <X size={18} color={colors.muted} />
            </TouchableOpacity>

            {/* Lock icon */}
            <View style={{
              width: 52, height: 52, borderRadius: 14,
              backgroundColor: colors.teal + '18',
              borderWidth: 1, borderColor: colors.teal + '40',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
            }}>
              <Lock size={24} color={colors.teal} />
            </View>

            {/* Context label */}
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading, textAlign: 'center', marginBottom: 4 }}>
              {contextLabel}
            </Text>
            <Text style={{ fontSize: 12, color: colors.label, textAlign: 'center', marginBottom: 20 }}>
              Enter manager PIN to continue
            </Text>

            {/* PIN dots */}
            <PinDots length={pin.length} shake={shakeX} />

            {/* Error */}
            {errorMsg && (
              <Text style={{ fontSize: 11, color: colors.danger, textAlign: 'center', marginBottom: 12, marginTop: -16 }}>
                {errorMsg}
              </Text>
            )}

            {/* Numpad */}
            <View style={{ gap: 10 }}>
              {rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
                  {row.map(d => (
                    <KeyButton key={d} label={d} onPress={() => handleKey(d)} />
                  ))}
                </View>
              ))}
              {/* Bottom row: clear | 0 | backspace */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <KeyButton
                  variant='action'
                  label={<X size={18} color={colors.muted} />}
                  onPress={handleClear}
                />
                <KeyButton label='0' onPress={() => handleKey('0')} />
                <KeyButton
                  variant='action'
                  label={<Delete size={18} color={colors.label} />}
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
                marginTop: 16,
                width: '100%',
                height: 48,
                borderRadius: 14,
                backgroundColor: pin.length === 0 ? colors.teal + '15' : colors.teal + '20',
                borderWidth: 1,
                borderColor: pin.length === 0 ? colors.teal + '20' : colors.teal + '60',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: pin.length === 0 ? colors.muted : colors.teal }}>
                Submit
              </Text>
            </TouchableOpacity>

            {/* Timeout hint */}
            {timeoutMinutes > 0 && (
              <Text style={{ fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
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
