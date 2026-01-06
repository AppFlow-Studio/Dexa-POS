import {
  selectClose,
  selectIsOpen,
  selectIsMenuBlocked,
  selectMode,
  selectSelectedItemPosition,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import React, { memo, useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import ModifierScreen from "../menu/ModifierScreen";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Panel width - covers the menu area (roughly 2/3 of screen)
const PANEL_WIDTH = SCREEN_WIDTH * 0.65;

/**
 * AttachedModifierPanel - Inline modifier panel for Figure POS-style interaction
 *
 * This component:
 * 1. Appears over the menu section (not fullscreen)
 * 2. Slides in from the left with spring animation (Reanimated)
 * 3. Visually "attaches" to the selected bill item
 * 4. Keeps bill visible for context during editing
 *
 * Performance optimizations:
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

  // Animation values (Reanimated shared values)
  const translateX = useSharedValue(-PANEL_WIDTH); // Start off-screen left
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
      // Animate in with spring for natural feel
      translateX.value = withSpring(0, {
        damping: 20,
        stiffness: 300,
        mass: 0.8,
      });
      opacity.value = withSpring(1, {
        damping: 20,
        stiffness: 300,
      });
      scale.value = withSpring(1, {
        damping: 20,
        stiffness: 300,
      });

      // Position connector at selected item Y position
      if (selectedItemPosition?.absoluteY) {
        connectorY.value = withSpring(selectedItemPosition.absoluteY - 50, {
          damping: 25,
          stiffness: 200,
        });
      }
    } else {
      // Animate out (faster)
      translateX.value = withTiming(-PANEL_WIDTH, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
      scale.value = withTiming(0.95, { duration: 150 });
    }
  }, [shouldShowAttached, selectedItemPosition?.absoluteY]);

  // Don't render anything if not in attached mode
  if (!shouldShowAttached) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.container, panelAnimatedStyle]}
      pointerEvents={isMenuBlocked ? "auto" : "none"}
    >
      {/* Connector indicator - visual link to bill item */}
      <Animated.View style={[styles.connector, connectorAnimatedStyle]}>
        <View style={styles.connectorArrow} />
      </Animated.View>

      {/* Main panel content */}
      <View style={styles.panelContent}>
        <ModifierScreen />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    backgroundColor: "#212121",
    borderRightWidth: 2,
    borderRightColor: "#3B82F6", // Blue accent border
    zIndex: 200,
    // Shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  panelContent: {
    flex: 1,
  },
  connector: {
    position: "absolute",
    right: -12,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 201,
  },
  connectorArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderLeftColor: "#3B82F6",
    borderTopWidth: 8,
    borderTopColor: "transparent",
    borderBottomWidth: 8,
    borderBottomColor: "transparent",
  },
});

export default memo(AttachedModifierPanel);
