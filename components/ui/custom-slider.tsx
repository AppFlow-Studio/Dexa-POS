import { colors } from '@/lib/theme'
import { cn } from '@/lib/utils'
import React, { useEffect, useRef, useState } from 'react'
import { LayoutChangeEvent, PanResponder, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue
} from 'react-native-reanimated'

interface CustomSliderProps {
  value: number
  onValueChange: (val: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  disabled?: boolean
}

const CustomSlider: React.FC<CustomSliderProps> = ({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className,
  disabled = false
}) => {
  const [width, setWidth] = useState(0)
  const translateX = useSharedValue(0)

  // Refs to hold latest values (fixes Stale Closures in PanResponder)
  const widthRef = useRef(0)
  const minRef = useRef(min)
  const maxRef = useRef(max)
  const stepRef = useRef(step)
  const onValueChangeRef = useRef(onValueChange)
  const isScrubbing = useRef(false)
  const gestureStartX = useRef(0)

  // Update refs whenever props change
  useEffect(() => {
    widthRef.current = width
    minRef.current = min
    maxRef.current = max
    stepRef.current = step
    onValueChangeRef.current = onValueChange
  }, [width, min, max, step, onValueChange])

  // Helper: Calculate pixels from value
  // We pass currentWidth explicitly to ensure accuracy
  const getTranslateFromValue = (v: number, currentWidth: number) => {
    if (currentWidth === 0) return 0
    const percentage = (v - min) / (max - min)
    return percentage * currentWidth
  }

  // Helper: Calculate value from pixels
  // We pass currentWidth/min/max explicitly to avoid using stale state
  const getValueFromTranslate = (
    t: number,
    currentWidth: number,
    currentMin: number,
    currentMax: number,
    currentStep: number
  ) => {
    if (currentWidth === 0) return currentMin

    const percentage = Math.min(Math.max(t / currentWidth, 0), 1)
    let newValue = currentMin + percentage * (currentMax - currentMin)

    if (currentStep > 0) {
      newValue = Math.round(newValue / currentStep) * currentStep
    }

    // Floating point correction (e.g. 5.00000001 -> 5)
    newValue = parseFloat(newValue.toFixed(2))

    return Math.min(Math.max(newValue, currentMin), currentMax)
  }

  // Sync visual thumb with external value prop
  // Only runs when NOT dragging
  useEffect(() => {
    if (width > 0 && !isScrubbing.current) {
      translateX.value = getTranslateFromValue(value, width)
    }
  }, [value, width, min, max])

  const pr = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt, gestureState) => {
        isScrubbing.current = true
        gestureStartX.current = translateX.value
      },

      onPanResponderMove: (evt, gestureState) => {
        const currentWidth = widthRef.current
        const currentMin = minRef.current
        const currentMax = maxRef.current
        const currentStep = stepRef.current

        if (currentWidth === 0) return

        // 1. Calculate new pixel position
        let newX = gestureStartX.current + gestureState.dx

        // 2. Clamp visually
        newX = Math.min(Math.max(newX, 0), currentWidth)

        // 3. Update SharedValue (UI Thread)
        translateX.value = newX

        // 4. Calculate Logic Value
        const newValue = getValueFromTranslate(
          newX,
          currentWidth,
          currentMin,
          currentMax,
          currentStep
        )

        // 5. Call Parent
        onValueChangeRef.current(newValue)
      },

      onPanResponderRelease: () => {
        isScrubbing.current = false
      }
    })
  ).current

  const activeTrackStyle = useAnimatedStyle(() => ({
    width: translateX.value
  }))

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value - 12 }] // Center 24px thumb
  }))

  return (
    <View
      className={cn('h-10 justify-center', className)}
      onLayout={(e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width
        setWidth(w)
        widthRef.current = w // Update ref immediately
      }}
      {...pr.panHandlers}
    >
      {/* Background Track */}
      <View
        className='h-2 rounded-full w-full overflow-hidden pointer-events-none'
        style={{ backgroundColor: colors.border }}
      >
        <Animated.View
          className='h-full'
          style={[{ backgroundColor: colors.teal }, activeTrackStyle]}
        />
      </View>

      {/* Thumb */}
      <Animated.View
        className='absolute w-6 h-6 rounded-full shadow-md border'
        style={[
          {
            left: 0,
            backgroundColor: colors.heading,
            borderColor: colors.teal
          },
          thumbStyle
        ]}
      />
    </View>
  )
}

export default CustomSlider
