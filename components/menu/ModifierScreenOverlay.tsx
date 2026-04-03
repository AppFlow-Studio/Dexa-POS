import { colors } from "@/lib/theme";
import {
  selectIsFullscreen,
  useModifierSidebarStore
} from "@/stores/useModifierSidebarStore";
import React, { useEffect } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
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

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isFullscreen) {
      cancelAnimation(translateY);
      cancelAnimation(opacity);
      translateY.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 120, easing: Easing.in(Easing.cubic) });
      opacity.value = withTiming(0, { duration: 120, easing: Easing.in(Easing.cubic) });
    }
  }, [isFullscreen, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // Keep mounted while open so ModifierScreen renders during the slide animation.
  // pointerEvents blocks touches when visually hidden (translateY = SCREEN_HEIGHT).
  if (!isOpen) return null;

  return (
    <Animated.View
      style={[styles.overlay, animatedStyle]}
      pointerEvents={isOpen ? "auto" : "none"}
    >
      <ModifierScreen />
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
