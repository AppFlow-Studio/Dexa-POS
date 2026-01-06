import {
  selectClose,
  selectIsOpen,
  selectIsMenuBlocked,
  selectMode,
  selectSelectedItemPosition,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import React, { memo, useEffect, useState } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import ModifierScreen from "../menu/ModifierScreen";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Panel width - covers the menu area (50% for compact Figure POS-style)
const PANEL_WIDTH = SCREEN_WIDTH * 0.50;

/**
 * AttachedModifierPanel - Inline modifier panel for Figure POS-style interaction
 *
 * This component:
 * 1. Appears over the menu section (not fullscreen)
 * 2. Slides in from the left with spring animation (Reanimated)
 * 3. Visually "attaches" to the selected bill item with arrow indicator
 * 4. Keeps bill visible for context during editing
 *
 * PERFORMANCE CRITICAL - PRE-MOUNTED ARCHITECTURE:
 * - ALWAYS renders (never unmounts) - eliminates 20-30ms mount overhead
 * - Visibility controlled via opacity/transform animations
 * - Uses Reanimated 2/3 for 60fps animations on UI thread
 * - Granular selectors prevent unnecessary re-renders
 * - Native driver animations (worklets)
 * - Memoized component prevents parent re-renders
 */
const AttachedModifierPanel: React.FC = () => {
  // Granular selectors for minimal re-renders
  const isOpen = useModifierSidebarStore(selectIsOpen);
  const isMenuBlocked = useModifierSidebarStore(selectIsMenuBlocked);
  const mode = useModifierSidebarStore(selectMode);
  const selectedItemPosition = useModifierSidebarStore(selectSelectedItemPosition);
  const close = useModifierSidebarStore(selectClose);

  // Only show attached panel for non-fullscreen modes
  const shouldShowAttached = isOpen && mode !== "fullscreen";

  // Track if panel has ever been shown (for lazy content loading)
  const [hasBeenShown, setHasBeenShown] = useState(false);

  // Animation values (Reanimated shared values) - START in hidden position
  const translateX = useSharedValue(-PANEL_WIDTH);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);

  // Animated style for the panel (runs on UI thread)
  const panelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  // Connector indicator position (points to selected bill item)
  const connectorY = useSharedValue(100);

  const connectorAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: connectorY.value }],
  }));

  // Animate panel in/out
  useEffect(() => {
    if (shouldShowAttached) {
      // Track that panel has been shown at least once
      if (!hasBeenShown) setHasBeenShown(true);

      // OPTIMIZED: Faster spring for instant response
      translateX.value = withSpring(0, {
        damping: 25,
        stiffness: 400,
        mass: 0.6,
      });
      opacity.value = withTiming(1, { duration: 80 });
      scale.value = withSpring(1, {
        damping: 25,
        stiffness: 400,
      });

      // Position connector at selected item Y position
      if (selectedItemPosition?.absoluteY) {
        connectorY.value = withSpring(selectedItemPosition.absoluteY - 50, {
          damping: 25,
          stiffness: 250,
        });
      }
    } else {
      // OPTIMIZED: Faster close animation (80ms instead of 150ms)
      translateX.value = withTiming(-PANEL_WIDTH, { duration: 80 });
      opacity.value = withTiming(0, { duration: 80 });
      scale.value = withTiming(0.95, { duration: 80 });
    }
  }, [shouldShowAttached, selectedItemPosition?.absoluteY, hasBeenShown]);

  // ALWAYS RENDER - visibility controlled by animation values
  // pointerEvents controls touch interaction
  return (
    <Animated.View
      style={[styles.container, panelAnimatedStyle]}
      pointerEvents={shouldShowAttached ? "auto" : "none"}
    >
      {/* Connector indicator - visual arrow pointing to bill item */}
      <Animated.View style={[styles.connector, connectorAnimatedStyle]}>
        <View style={styles.connectorArrow} />
      </Animated.View>

      {/* Main panel content - only render ModifierScreen if panel has been shown */}
      <View style={styles.panelContent}>
        {hasBeenShown && <ModifierScreen />}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    left: 10,
    bottom: 60,
    width: PANEL_WIDTH,
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#3B82F6", // Blue accent border
    zIndex: 200,
    // Enhanced shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 15,
    overflow: "hidden",
  },
  panelContent: {
    flex: 1,
    borderRadius: 14, // Match container for clipping
    overflow: "hidden",
  },
  connector: {
    position: "absolute",
    right: -20,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 201,
  },
  connectorArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderLeftColor: "#3B82F6",
    borderTopWidth: 12,
    borderTopColor: "transparent",
    borderBottomWidth: 12,
    borderBottomColor: "transparent",
  },
});

export default memo(AttachedModifierPanel);
