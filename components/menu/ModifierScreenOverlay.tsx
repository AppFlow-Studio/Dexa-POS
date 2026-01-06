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
 * Benefits:
 * - MenuSection never re-renders when modifier opens
 * - FlatList stays mounted (preserves scroll position)
 * - Smooth native-driver animation
 * - Zero coupling between components
 * - Uses granular selectors for minimal re-renders
 *
 * OPTIMIZED:
 * - Faster spring animation (tension: 300, friction: 25) for instant feel
 * - Touch enabled immediately via isOpen (not animation completion)
 * - Faster close animation (150ms instead of 300ms)
 */
const ModifierScreenOverlay: React.FC = () => {
  // Use combined selector for single subscription - minimizes re-renders
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen);
  // OPTIMIZATION: Enable touch immediately when store says open, not when animation completes
  const isOpen = useModifierSidebarStore((s) => s.isOpen);

  // Animation value for slide-down effect
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (isFullscreen) {
      // OPTIMIZED: Faster spring for instant response
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 300,  // Increased from 120 - faster animation
        friction: 25,  // Increased from 14 - less bounce, faster settle
      }).start();
    } else {
      // OPTIMIZED: Faster close animation (150ms instead of 300ms)
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 150,  // Reduced from 300ms
        useNativeDriver: true,
      }).start();
    }
  }, [isFullscreen, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.overlay,
        { transform: [{ translateY: slideAnim }] },
        !isFullscreen ? { opacity: 0 } : null,
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
