import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { PillLayer } from "./PillLayer";

/**
 * The artifact's `.ib`: a 48dp round icon target. Press feedback is a tinted
 * circle rather than an Android ripple, which clips to a square inside
 * flex parents. The circle is a PillLayer: a background toggled from
 * "transparent" loses its radius on Android and draws as a box.
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
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
    >
      <View className="h-12 w-12 items-center justify-center">
        <PillLayer opacity={pressed ? 1 : 0} />
        {children}
      </View>
    </Pressable>
  );
}
