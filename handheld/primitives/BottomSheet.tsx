import { colors } from "@/lib/theme";
import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Slide-in duration. Well under the 150 ms open budget. */
const OPEN_MS = 120;

/**
 * Bottom-anchored sheet on a plain RN Modal: no gesture handler, no reanimated
 * worklets, so it is cheap to mount on a 2GB device. Opens with a 120 ms
 * native-driver slide; closes instantly. `footer` is for a StickyActionBar,
 * which then sits in the thumb zone above the safe-area inset.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [48, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Animated.View
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", opacity: progress }}
        >
          <Pressable
            className="flex-1"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        <Animated.View
          className="rounded-t-2xl"
          style={{
            maxHeight: "85%",
            backgroundColor: colors.panel,
            paddingBottom: insets.bottom,
            transform: [{ translateY }],
          }}
        >
          <View className="items-center pb-1 pt-2">
            <View
              className="h-1 w-10 rounded-full"
              style={{ backgroundColor: colors.border }}
            />
          </View>
          {title ? (
            <View className="min-h-12 justify-center px-4 pb-2">
              <Text
                className="text-lg font-bold"
                style={{ color: colors.heading }}
                numberOfLines={1}
              >
                {title}
              </Text>
            </View>
          ) : null}
          <ScrollView className="shrink" bounces={false}>
            {children}
          </ScrollView>
          {footer}
        </Animated.View>
      </View>
    </Modal>
  );
}
