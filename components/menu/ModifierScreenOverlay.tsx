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
 */
const ModifierScreenOverlay: React.FC = () => {
  // Use combined selector for single subscription - minimizes re-renders
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen);

  // Animation value for slide-down effect
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (isFullscreen) {
      // Slide to top from bottom with spring animation
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 14,
      }).start();
    } else {
      // Slide back down with timing animation (faster close)
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isFullscreen, slideAnim]);

  // Early return when not fullscreen - avoids rendering when closed
  if (!isFullscreen) return null;
  return (
    // <View className="absolute inset-0 z-50">
    //   <TouchableOpacity
    //     className="flex-1 bg-black/50"
    //     onPress={() => { }}
    //     activeOpacity={1}
    //   />
    //   <View className="absolute bottom-0 left-0 right-0 w-[85% h-[100%] bg-[#212121] rounded-tr-3xl p-4 border-t border-gray-700">
    //     <ModifierScreen />
    //   </View>
    // </View>
    <Animated.View
      style={[
        styles.overlay,
        { transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents={isFullscreen ? "auto" : "none"}
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
