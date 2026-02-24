import {
  selectIsFullscreen,
  useModifierSidebarStore
} from "@/stores/useModifierSidebarStore";
import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet } from "react-native";
import ModifierScreen from "./ModifierScreen";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * ModifierScreenOverlay - An overlay component that slides down from the top
 *
 * This architectural pattern decouples the modifier screen from MenuSection,
 * preventing MenuSection re-renders when the modifier opens/closes.
 *
 * PERFORMANCE CRITICAL - PRE-MOUNTED ARCHITECTURE:
 * - ALWAYS renders (never unmounts) - eliminates 10-20ms mount overhead
 * - Visibility controlled via translateY/opacity animations
 * - MenuSection never re-renders when modifier opens
 * - FlatList stays mounted (preserves scroll position)
 * - Smooth native-driver animation
 * - Zero coupling between components
 * - Uses granular selectors for minimal re-renders
 *
 * OPTIMIZED:
 * - Faster spring animation (tension: 400, friction: 28) for instant feel
 * - Touch enabled immediately via isOpen (not animation completion)
 * - Faster close animation (80ms instead of 150ms)
 */
const ModifierScreenOverlay: React.FC = () => {
  // Use combined selector for single subscription - minimizes re-renders
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen);
  // OPTIMIZATION: Enable touch immediately when store says open, not when animation completes
  const isOpen = useModifierSidebarStore((s) => s.isOpen);

  // Animation values for slide-down effect - START in hidden position
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFullscreen) {
      // Stop any in-flight animations before starting new ones
      slideAnim.stopAnimation();
      opacityAnim.stopAnimation();
      // OPTIMIZED: Faster spring for instant response
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 400,  // Very fast
          friction: 28,  // Less bounce
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 60,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Stop any in-flight animations before starting new ones
      slideAnim.stopAnimation();
      opacityAnim.stopAnimation();
      // OPTIMIZED: Faster close animation (80ms)
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isFullscreen, slideAnim, opacityAnim]);

  // Safety reset: force animation values to hidden state after close animation should have completed
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        slideAnim.setValue(SCREEN_HEIGHT);
        opacityAnim.setValue(0);
      }, 120); // 120ms > 80ms close animation
      return () => clearTimeout(timer);
    }
  }, [isOpen, slideAnim, opacityAnim]);

  // ALWAYS RENDER - visibility controlled by animation values
  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      // OPTIMIZATION: Enable touches as soon as store says open (not animation completion)
      pointerEvents={isOpen ? "auto" : "none"}
    >
      <ModifierScreen />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#212121",
    zIndex: 9999,
    elevation: 100, // Android shadow/layering
  },
});

export default React.memo(ModifierScreenOverlay);
