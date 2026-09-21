import React from "react";
import { Pressable, View } from "react-native";
import { tint } from "../lib/tokens";

/**
 * The artifact's `.ib`: a 48dp round icon target. Press feedback is a tinted
 * circle rather than an Android ripple, which clips to a square inside
 * flex parents.
 */
export function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      {({ pressed }) => (
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: pressed ? tint.accentSoft : "transparent" }}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
}
