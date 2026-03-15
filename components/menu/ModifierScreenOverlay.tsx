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

  const [animationComplete, setAnimationComplete] = useState(false);

  // Track previous isFullscreen to detect item-switch while already open
  const prevIsFullscreenRef = useRef(false);
  const prevSessionKeyRef = useRef(sessionKey);

  // Reanimated shared values
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const opacity = useSharedValue(0);

  const setAnimationCompleteIfOpen = useCallback(() => {
    if (useModifierSidebarStore.getState().isOpen) {
      setAnimationComplete(true);
    }
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      const wasAlreadyOpen = prevIsFullscreenRef.current;
      const sessionChanged = prevSessionKeyRef.current !== sessionKey;

      if (wasAlreadyOpen && sessionChanged) {
        // Already open, switching items — skip animation, show content immediately
        setAnimationComplete(true);
      } else {
        // Fresh open — show skeleton, animate, then mount content
        setAnimationComplete(false);

        // Cancel any in-flight close animation and reset to start position
        cancelAnimation(translateY);
        cancelAnimation(opacity);
        translateY.value = SCREEN_HEIGHT;
        opacity.value = 0;

        const timingConfig = {
          duration: 120,
          easing: Easing.out(Easing.cubic),
        };

        translateY.value = withTiming(0, timingConfig);
        opacity.value = withTiming(1, timingConfig, (finished) => {
          if (finished) {
            runOnJS(setAnimationCompleteIfOpen)();
          }
        });
      }
    } else {
      // Close — reset animationComplete, animate out
      setAnimationComplete(false);

      const timingConfig = {
        duration: 100,
        easing: Easing.in(Easing.cubic),
      };

      translateY.value = withTiming(SCREEN_HEIGHT, timingConfig);
      opacity.value = withTiming(0, timingConfig);
    }

    prevIsFullscreenRef.current = isFullscreen;
    prevSessionKeyRef.current = sessionKey;
  }, [isFullscreen, sessionKey, translateY, opacity, setAnimationCompleteIfOpen]);

  // Safety reset: force to hidden state after close
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        translateY.value = SCREEN_HEIGHT;
        opacity.value = 0;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.overlay, animatedStyle]}
      pointerEvents={isOpen ? "auto" : "none"}
    >
      {isOpen && !animationComplete && <ModifierScreenSkeleton />}
      {animationComplete && <ModifierScreen key={sessionKey} />}
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

export default React.memo(ModifierScreenOverlay);
