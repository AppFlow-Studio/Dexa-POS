import { colors } from "@/lib/theme";
import {
    selectIsFullscreen,
    useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import React, { useEffect, useState } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import ModifierScreen from "./ModifierScreen";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * ModifierScreenOverlay - Slides up from the bottom.
 *
 * PERFORMANCE: ModifierScreen mounts immediately when isOpen becomes true
 * (hidden via translateY), giving React the full animation window (~150ms)
 * to render the component tree. By the time the slide completes, ModifierScreen
 * is already painted — no post-animation mount lag.
 */
const ModifierScreenOverlay: React.FC = () => {
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen);
  const isOpen = useModifierSidebarStore((s) => s.isOpen);
  const [hasBeenShown, setHasBeenShown] = useState(false);
  const [isPrimed, setIsPrimed] = useState(false);
  const [keepScreenPainted, setKeepScreenPainted] = useState(false);

  const translateY = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    if (isOpen) setHasBeenShown(true);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen || isFullscreen) {
      setKeepScreenPainted(true);
      return;
    }

    const timeoutId = setTimeout(() => {
      setKeepScreenPainted(false);
    }, 160);

    return () => clearTimeout(timeoutId);
  }, [isOpen, isFullscreen]);

  useEffect(() => {
    // Prime the heavy modifier tree shortly after mount so first open feels instant.
    const timer = setTimeout(() => setIsPrimed(true), 250);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      cancelAnimation(translateY);
      translateY.value = withSpring(0, {
        damping: 24,
        stiffness: 260,
        mass: 0.75,
      });
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, {
        duration: 120,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [isFullscreen, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Keep mounted after first show so the heavy ModifierScreen tree is not
  // remounted on every open/close cycle.
  if (!hasBeenShown && !isPrimed) return null;

  return (
    <Animated.View
      style={[styles.overlay, animatedStyle]}
      pointerEvents={isOpen && isFullscreen ? "auto" : "none"}
    >
      <ModifierScreen keepMountedDuringClose={keepScreenPainted && !isOpen} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.card,
    zIndex: 9999,
    elevation: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
});

export default ModifierScreenOverlay;
