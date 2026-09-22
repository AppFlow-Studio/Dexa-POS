import { colors } from "@/lib/theme";
import { ChevronRight } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { metrics, tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/**
 * The artifact's `.op` on screen 6: an 84dp card with a 52dp `.ti` tile, a
 * title over a muted line, and a chevron. `primary` is `.op.pri` — the
 * accent-filled variant the artifact gives the first (Card) row.
 *
 * Not a `ListRow`: that primitive is the 76dp `.row` with a 48dp tile and an
 * inset divider, and these are free-standing 24dp cards with a 10dp gutter.
 */
export function MethodRow({
  title,
  detail,
  icon,
  onPress,
  primary = false,
  disabled = false,
  testID,
}: {
  title: string;
  detail: string;
  /** Rendered inside the tile; the caller picks the colour to match `primary`. */
  icon: React.ReactNode;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const fg = disabled
    ? colors.muted
    : primary
      ? colors.onSolid
      : colors.heading;
  const detailFg = disabled
    ? colors.muted
    : primary
      ? "rgba(12,15,26,0.7)"
      : colors.label;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`${title}. ${detail}`}
      className="flex-row items-center"
      style={{
        minHeight: metrics.optionRow,
        borderRadius: metrics.optionRadius,
        backgroundColor: disabled
          ? colors.panel
          : primary
            ? colors.teal
            : colors.card,
        paddingLeft: metrics.px,
        paddingRight: 18,
        gap: metrics.gap + 2,
      }}
    >
      <View
        className="items-center justify-center"
        style={{
          width: metrics.optionTile,
          height: metrics.optionTile,
          borderRadius: metrics.optionTileRadius,
          backgroundColor: primary && !disabled ? "rgba(12,15,26,0.12)" : tint.accentSoft,
        }}
      >
        {icon}
      </View>
      <View className="min-w-0 flex-1">
        <Text style={[type.optionTitle, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5" style={[type.detail, { color: detailFg }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <ChevronRight size={22} color={disabled ? colors.muted : primary ? colors.onSolid : colors.muted} />
    </Pressable>
  );
}
