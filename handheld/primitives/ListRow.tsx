import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { metrics, tint, type Tint } from "../lib/tokens";
import { type } from "../lib/type";

export interface RowTile extends Tint {
  /** Short text in the tile (a table number). Ignored when `icon` is set. */
  label?: string;
  /** A 24dp icon in the tile (order type). */
  icon?: React.ReactNode;
}

export interface ListRowProps {
  tile?: RowTile;
  title: string;
  /**
   * Detail line, e.g. "Served · ". `detailAccent` is appended in colour;
   * `bold` gives it the artifact's 500 weight (warn / ok / overtime only —
   * plain states like "Preparing 4m" stay 400).
   */
  detail?: string;
  detailAccent?: { text: string; color: string; bold?: boolean };
  /** Right-aligned value (a total). Ignored when `right` is set. */
  value?: string;
  right?: React.ReactNode;
  selected?: boolean;
  /** Draw the inset top divider (every row but the first in a group). */
  divider?: boolean;
  onPress?: () => void;
  testID?: string;
}

function Tile({ label, icon, bg, fg }: RowTile) {
  return (
    <View
      className="items-center justify-center"
      style={{
        width: metrics.tile,
        height: metrics.tile,
        borderRadius: metrics.tileRadius,
        backgroundColor: bg,
      }}
    >
      {icon ?? (
        <Text style={[type.tile, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </View>
  );
}

/**
 * The artifact's `.row`: 76dp, a 48dp tile, title + detail, value on the
 * right, inset divider. Memoised — parents pass primitives and a stable
 * `onPress`, so an unrelated store change never re-renders a row.
 */
export const ListRow = React.memo(function ListRow({
  tile,
  title,
  detail,
  detailAccent,
  value,
  right,
  selected = false,
  divider = false,
  onPress,
  testID,
}: ListRowProps) {
  const interactive = !!onPress;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!interactive}
      android_ripple={interactive ? { color: tint.accentSoft } : undefined}
      accessibilityRole={interactive ? "button" : undefined}
      className="flex-row items-center"
      style={{
        minHeight: metrics.row,
        paddingHorizontal: metrics.px,
        paddingVertical: 8,
        gap: metrics.gap,
        backgroundColor: selected ? tint.selectedRow : "transparent",
      }}
    >
      {divider && !selected ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: tile ? metrics.dividerInset : metrics.px,
            right: metrics.px,
            height: 1,
            backgroundColor: tint.divider,
          }}
        />
      ) : null}
      {tile ? <Tile {...tile} /> : null}
      <View className="min-w-0 flex-1">
        <Text style={[type.row, { color: colors.heading }]} numberOfLines={1}>
          {title}
        </Text>
        {detail || detailAccent ? (
          <Text
            className="mt-0.5"
            style={[type.detail, { color: colors.label }]}
            numberOfLines={1}
          >
            {detail}
            {detailAccent ? (
              <Text
                style={[detailAccent.bold ? type.label : type.detail, { color: detailAccent.color }]}
              >
                {detailAccent.text}
              </Text>
            ) : null}
          </Text>
        ) : null}
      </View>
      {right ??
        (value ? (
          <Text style={[type.value, { color: colors.heading }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null)}
    </Pressable>
  );
});
