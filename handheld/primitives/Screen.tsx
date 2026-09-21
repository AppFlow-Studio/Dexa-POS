import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";
import { OfflineBanner } from "../components/OfflineBanner";
import { metrics } from "../lib/tokens";
import { type } from "../lib/type";

/**
 * Root header from the artifact (`.top`): 80dp, a 30/700 title with a 14dp
 * subtitle under it, and a right slot for the avatar / icon buttons. The
 * offline card sits directly under it, where the artifact draws it. Flex
 * only; the height is a minimum so font scale 1.3 still fits two lines.
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
      <View
        className="flex-row items-center pl-4 pr-3"
        style={{ minHeight: metrics.header }}
      >
        <View className="min-w-0 flex-1">
          <Text style={[type.title, { color: colors.heading }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="mt-0.5"
              style={[type.detail, { color: colors.label }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View className="flex-row items-center gap-1">{right}</View> : null}
      </View>
      <OfflineBanner />
      <View className="flex-1">{children}</View>
    </View>
  );
}
