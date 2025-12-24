import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
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
 */
const ModifierScreenOverlay: React.FC = () => {
  // Selective subscriptions - only re-render when these specific values change
  const isOpen = useModifierSidebarStore((state) => state.isOpen);

  const mode = useModifierSidebarStore((state) => state.mode);

  // Animation value for slide-down effect
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const isFullscreen = isOpen && mode === "fullscreen";

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

  // Always render the component but position off-screen when closed
  // This avoids mount/unmount overhead and enables smooth animations
  if (!isOpen) return null;
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
