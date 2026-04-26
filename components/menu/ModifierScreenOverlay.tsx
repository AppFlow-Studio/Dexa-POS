import { colors } from '@/lib/theme'
import {
  selectIsFullscreen,
  useModifierSidebarStore
} from '@/stores/useModifierSidebarStore'
import React, { useEffect, useState } from 'react'
import { Dimensions, StyleSheet } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import ModifierScreen from './ModifierScreen'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

/**
 * ModifierScreenOverlay - Slides up from the bottom.
 *
 * PERFORMANCE: ModifierScreen mounts immediately when isOpen becomes true
 * (hidden via translateY), giving React the full animation window (~150ms)
 * to render the component tree. By the time the slide completes, ModifierScreen
 * is already painted — no post-animation mount lag.
 */
const ModifierScreenOverlay: React.FC = () => {
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen)
  const isOpen = useModifierSidebarStore(s => s.isOpen)
  const [hasBeenShown, setHasBeenShown] = useState(false)
  const [isPrimed, setIsPrimed] = useState(false)

  const translateY = useSharedValue(SCREEN_HEIGHT)
  const opacity = useSharedValue(0)

  useEffect(() => {
    if (isOpen) setHasBeenShown(true)
  }, [isOpen])

  useEffect(() => {
    // Prime the heavy modifier tree shortly after mount so first open feels instant.
    const timer = setTimeout(() => setIsPrimed(true), 250)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (isFullscreen) {
      cancelAnimation(translateY)
      cancelAnimation(opacity)
      translateY.value = withTiming(0, {
        duration: 70,
        easing: Easing.out(Easing.cubic)
      })
      opacity.value = withTiming(1, {
        duration: 70,
        easing: Easing.out(Easing.cubic)
      })
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, {
        duration: 60,
        easing: Easing.in(Easing.cubic)
      })
      opacity.value = withTiming(0, {
        duration: 60,
        easing: Easing.in(Easing.cubic)
      })
    }
  }, [isFullscreen, translateY, opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value
  }))

  // Keep mounted after first show so the heavy ModifierScreen tree is not
  // remounted on every open/close cycle.
  if (!hasBeenShown && !isPrimed) return null

  return (
    <Animated.View
      style={[styles.overlay, animatedStyle]}
      pointerEvents={isOpen && isFullscreen ? 'auto' : 'none'}
    >
      <ModifierScreen />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.card,
    zIndex: 9999,
    elevation: 100
  }
})

export default ModifierScreenOverlay
