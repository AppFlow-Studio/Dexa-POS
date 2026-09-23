import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { usePinEntry } from '@/hooks/usePinEntry'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming
} from 'react-native-reanimated'
import PinDisplay from '../auth/PinDisplay'
import PinNumpad from '../auth/PinNumpad'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'

interface PinInputModalProps {
  isOpen: boolean
  title: string
  subtitle?: string
  onConfirm: (pin: string) => void
  onCancel: () => void
  /** Render into a named PortalHost (e.g. when shown above a fullScreen Modal). */
  portalHost?: string
}

const PinInputModal: React.FC<PinInputModalProps> = ({
  isOpen,
  title,
  subtitle,
  onConfirm,
  onCancel,
  portalHost
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  // No auto-submit: a modal that shows a Confirm button waits for it.
  const { pin, setPin, onKeyPress } = usePinEntry({ length: 4 })

  // Animation values for shake effect
  const shakeX = useSharedValue(0)

  const handleConfirm = () => {
    if (pin.length < 4) {
      // Trigger shake animation
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      )
      return
    }
    onConfirm(pin)
    setPin('')
  }

  const handleCancel = () => {
    setPin('')
    onCancel()
  }

  // Animated style for shake effect
  const shakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeX.value }]
    }
  })

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent
        portalHost={portalHost}
        className='h-fit p-6'
        style={{
          width: s(350),
          backgroundColor: colors.panel,
          borderColor: colors.border
        }}
      >
        <DialogHeader>
          <DialogTitle
            className='text-center text-2xl font-semibold'
            style={{ color: colors.heading }}
          >
            {title}
          </DialogTitle>
        </DialogHeader>
        <Animated.View style={shakeStyle} className='py-4'>
          {subtitle && (
            <Text
              className='text-center text-lg mb-4'
              style={{ color: colors.label }}
            >
              {subtitle}
            </Text>
          )}
          <PinDisplay pinLength={pin.length} maxLength={4} />
          <PinNumpad onKeyPress={onKeyPress} />
          <View className='flex-row gap-3 mt-4'>
            <TouchableOpacity
              onPress={handleCancel}
              className='flex-1 py-3 rounded-lg'
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Text
                className='text-center text-lg font-bold'
                style={{ color: colors.heading }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              className='flex-1 py-3 rounded-lg'
              style={{ backgroundColor: colors.teal }}
            >
              <Text
                className='text-center text-lg font-bold'
                style={{ color: colors.onSolid }}
              >
                Confirm
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </DialogContent>
    </Dialog>
  )
}

export default PinInputModal
