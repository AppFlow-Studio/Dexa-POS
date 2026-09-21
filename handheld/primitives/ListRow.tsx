import { colors } from "@/lib/theme";
import { ChevronRight } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Right-aligned primary value (a total, a count, a status word). */
  value?: string;
  /** Right-aligned secondary line under `value`. */
  meta?: string;
  /** Status dot colour (a theme colour string). */
  dotColor?: string;
  /** Small pill after the title. */
  badge?: string;
  /** Solid pill background; omit for a neutral pill. */
  badgeColor?: string;
  onPress?: () => void;
  chevron?: boolean;
  testID?: string;
}

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/**
 * One list row, at least 64dp tall so it clears the 48dp touch target with
 * room for a two-line left column at font scale 1.3. Memoised: parents pass
 * primitives and a stable `onPress`, so an unrelated store change never
 * re-renders it.
 */
export const ListRow = React.memo(function ListRow({
  title,
  subtitle,
  value,
  meta,
  dotColor,
  badge,
  badgeColor,
  onPress,
  chevron = false,
  testID,
}: ListRowProps) {
  const interactive = !!onPress;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!interactive}
      android_ripple={interactive ? { color: colors.tealMuted } : undefined}
      accessibilityRole={interactive ? "button" : undefined}
      className="min-h-16 flex-row items-center px-4 py-2"
      style={{
        backgroundColor: colors.screen,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      {dotColor ? (
        <View
          className="mr-3 h-3 w-3 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      ) : null}
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center">
          <Text
            className="shrink text-base font-semibold"
            style={{ color: colors.heading }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {badge ? (
            <View
              className="ml-2 rounded-full px-2 py-0.5"
              style={{ backgroundColor: badgeColor ?? colors.inset }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: badgeColor ? colors.onSolid : colors.label }}
                numberOfLines={1}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text
            className="mt-0.5 text-sm"
            style={{ color: colors.muted }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value || meta ? (
        <View className="ml-3 items-end">
          {value ? (
            <Text
              className="text-base font-semibold"
              style={[{ color: colors.heading }, TABULAR]}
              numberOfLines={1}
            >
              {value}
            </Text>
          ) : null}
          {meta ? (
            <Text
              className="mt-0.5 text-xs"
              style={[{ color: colors.muted }, TABULAR]}
              numberOfLines={1}
            >
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}
      {chevron && interactive ? (
        <ChevronRight size={18} color={colors.muted} style={{ marginLeft: 8 }} />
      ) : null}
    </Pressable>
  );
});
