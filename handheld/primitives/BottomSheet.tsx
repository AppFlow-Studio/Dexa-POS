import { colors } from "@/lib/theme";
import { X } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { metrics, tint } from "../lib/tokens";
import { type } from "../lib/type";
import { IconButton } from "./IconButton";

/** Slide-in duration. Well under the 150 ms open budget. */
const OPEN_MS = 120;

/**
 * The artifact's `.sheet`: panel colour, 28dp top radius, a grab handle, a
 * 24/600 title with a 15dp description and a 48dp close button, then the
 * body. On a plain RN Modal — no gesture handler or reanimated worklets, so
 * it is cheap on a 2GB device. Opens with a 120 ms native-driver slide.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
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
          style={{ backgroundColor: tint.scrim, opacity: progress }}
        >
          <Pressable
            className="flex-1"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        <Animated.View
          style={{
            maxHeight: "88%",
            backgroundColor: colors.panel,
            borderTopLeftRadius: metrics.sheetRadius,
            borderTopRightRadius: metrics.sheetRadius,
            // System bars are hidden (HandheldFrame); no inset to clear.
            paddingBottom: 8,
            transform: [{ translateY }],
          }}
        >
          <View className="items-center pb-1 pt-3.5">
            <View
              className="h-1 w-9 rounded-full"
              style={{ backgroundColor: colors.muted, opacity: 0.7 }}
            />
          </View>
          {title ? (
            <View className="flex-row items-start gap-2 pb-4 pl-5 pr-2 pt-2.5">
              <View className="min-w-0 flex-1 pt-1">
                <Text style={[type.sheetTitle, { color: colors.heading }]} numberOfLines={2}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text
                    className="mt-1"
                    style={[type.sheetDesc, { color: colors.label }]}
                    numberOfLines={1}
                  >
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <IconButton label="Close" onPress={onClose}>
                <X size={24} color={colors.heading} />
              </IconButton>
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
