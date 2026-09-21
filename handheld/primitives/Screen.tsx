import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";

/**
 * Page frame: a title row (with an optional right slot) over a flex body.
 * Flex + dp utilities only; nothing here has a fixed width.
 */
export function Screen({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <View className="min-h-14 flex-row items-end justify-between px-4 pb-2 pt-3">
        <View className="min-w-0 flex-1">
          <Text
            className="text-2xl font-bold"
            style={{ color: colors.heading }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="text-sm"
              style={{ color: colors.muted }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View className="ml-3">{right}</View> : null}
      </View>
      <View className="flex-1">{children}</View>
    </View>
  );
}
