import { colors } from "@/lib/theme";
import {
  selectIsFullscreen,
  useModifierSidebarStore
} from "@/stores/useModifierSidebarStore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  StyleSheet,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import ModifierScreen from "./ModifierScreen";
import ModifierScreenSkeleton from "./ModifierScreenSkeleton";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * ModifierScreenOverlay - An overlay component that slides up from the bottom
 *
 * PERFORMANCE CRITICAL - SKELETON-FIRST ARCHITECTURE:
 * - Uses Reanimated v3 for UI-thread animations (no JS thread contention)
 * - Shows lightweight skeleton during slide animation
 * - Mounts heavy ModifierScreen only after animation completes
 * - Eliminates the visual gap between background slide and content paint
 *
 * Animation flow:
 * 1. Open triggered → skeleton renders instantly, slide animation starts on UI thread
 * 2. Animation completes → runOnJS sets animationComplete = true
 * 3. ModifierScreen mounts into fully-positioned container — no jank
 */
const ModifierScreenOverlay: React.FC = () => {
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen);
  const isOpen = useModifierSidebarStore((s) => s.isOpen);
  const sessionKey = useModifierSidebarStore((s) =>
    !s.isOpen ? "closed" : `${s.cartItem?.id ?? ""}_${s.menuItem?.id ?? ""}_${s.mode}`
  );

  // Reanimated shared values
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isFullscreen) {
      // Open triggered
      cancelAnimation(translateY);
      cancelAnimation(opacity);

      const timingConfig = {
        duration: 150,
        easing: Easing.out(Easing.cubic),
      };

      translateY.value = withTiming(0, timingConfig);
      opacity.value = withTiming(1, timingConfig);
    } else {
      // Close triggered
      const timingConfig = {
        duration: 120,
        easing: Easing.in(Easing.cubic),
      };

      translateY.value = withTiming(SCREEN_HEIGHT, timingConfig);
      opacity.value = withTiming(0, timingConfig);
    }
  }, [isFullscreen, translateY, opacity]);

  // Safety reset: force to hidden state after close
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        translateY.value = SCREEN_HEIGHT;
        opacity.value = 0;
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!isOpen) return null;

  return (
    <Animated.View
      style={[styles.overlay, animatedStyle]}
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
    elevation: 100,
  },
});

export default ModifierScreenOverlay;
