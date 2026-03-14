import { colors } from "@/lib/theme";
import {
  selectIsFullscreen,
  useModifierSidebarStore
} from "@/stores/useModifierSidebarStore";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
} from "react-native";
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
 * - Easing curves (out cubic open, in cubic close) for smooth transitions
 * - Touch enabled immediately via isOpen (not animation completion)
 */
const ModifierScreenOverlay: React.FC = () => {
  // Use combined selector for single subscription - minimizes re-renders
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen);
  // OPTIMIZATION: Enable touch immediately when store says open, not when animation completes
  const isOpen = useModifierSidebarStore((s) => s.isOpen);
  // Session key for ModifierScreen remount — correct initial state on first render, no INITIALIZE effect
  const sessionKey = useModifierSidebarStore((s) =>
    !s.isOpen ? "closed" : `${s.cartItem?.id ?? ""}_${s.menuItem?.id ?? ""}_${s.mode}`
  );

  // Animation values for slide-down effect - START in hidden position
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFullscreen) {
      // Stop any in-flight animations before starting new ones
      slideAnim.stopAnimation();
      opacityAnim.stopAnimation();
      // Smooth open: out cubic easing, 100ms
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Stop any in-flight animations before starting new ones
      slideAnim.stopAnimation();
      opacityAnim.stopAnimation();
      // Smooth close: in cubic easing, 100ms
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 100,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 100,
          easing: Easing.in(Easing.cubic),
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
      }, 150); // 150ms > 100ms close animation
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
      <ModifierScreen key={sessionKey} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.card,
    zIndex: 9999,
    elevation: 100, // Android shadow/layering
  },
});

export default React.memo(ModifierScreenOverlay);
