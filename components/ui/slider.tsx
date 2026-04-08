import { colors } from '@/lib/theme'
import React, { useRef } from 'react'
import { PanResponder, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue
} from 'react-native-reanimated'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (value: number) => void
  width?: number
}

const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  width = 200
}) => {
  const trackWidth = width
  const thumbWidth = 20
  const maxTranslate = trackWidth - thumbWidth

  const getTranslateFromValue = (v: number) => {
    return ((v - min) / (max - min)) * maxTranslate
  }

  const getValueFromTranslate = (t: number) => {
    const rawValue = (t / maxTranslate) * (max - min) + min
    const steppedValue = Math.round(rawValue / step) * step
    return Math.max(min, Math.min(max, steppedValue))
  }

  const translateX = useSharedValue(getTranslateFromValue(value))

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        let newX = getTranslateFromValue(value) + gestureState.dx
        newX = Math.max(0, Math.min(maxTranslate, newX))
        translateX.value = newX
        const newValue = getValueFromTranslate(newX)
        runOnJS(onValueChange)(newValue)
      },
      onPanResponderRelease: () => {
        // Optional: snap to step visually if desired
      }
    })
  ).current

  // Sync external value changes
  React.useEffect(() => {
    translateX.value = getTranslateFromValue(value)
  }, [value])

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }))

  const filledTrackStyle = useAnimatedStyle(() => ({
    width: translateX.value + thumbWidth / 2
  }))

  return (
    <View
      style={{ width: trackWidth, height: 40, justifyContent: 'center' }}
      {...panResponder.panHandlers}
    >
      {/* Track Background */}
      <View
        style={{
          position: 'absolute',
          width: '100%',
          height: 4,
          borderRadius: 999,
          backgroundColor: colors.border
        }}
      />

      {/* Filled Track */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            height: 4,
            borderRadius: 999,
            backgroundColor: colors.teal
          },
          filledTrackStyle
        ]}
      />

      {/* Thumb */}
      <Animated.View
        style={[
          {
            width: thumbWidth,
            height: thumbWidth,
            borderRadius: thumbWidth / 2,
            position: 'absolute',
            backgroundColor: colors.heading,
            borderWidth: 1,
            borderColor: colors.teal
          },
          thumbStyle
        ]}
      />
    </View>
  )
}

export default Slider
