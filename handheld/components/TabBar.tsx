import { colors } from "@/lib/theme";
import { LayoutGrid, Receipt, User, type LucideIcon } from "@/lib/icons";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { metrics } from "../lib/tokens";
import { type } from "../lib/type";
import { PillLayer } from "../primitives";
import type { HandheldTab } from "../types";

const TABS: readonly { key: HandheldTab; label: string; Icon: LucideIcon }[] = [
  { key: "tables", label: "Tables", Icon: LayoutGrid },
  { key: "checks", label: "Checks", Icon: Receipt },
  { key: "me", label: "Me", Icon: User },
];

/** The artifact's `.bd`: an error-red count pill riding the indicator. */
function Badge({ count }: { count: number }) {
  return (
    <View
      className="absolute items-center justify-center rounded-full px-1.5"
      style={{ top: -2, left: "50%", marginLeft: 4, minWidth: 18, height: 18, backgroundColor: colors.danger }}
      accessibilityLabel={`${count} need attention`}
    >
      <Text style={[type.badge, { color: colors.onSolid }]}>{count}</Text>
    </View>
  );
}

function Tab({
  label,
  Icon,
  active,
  badge,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  active: boolean;
  badge?: number;
  onPress: () => void;
}) {
  // No android_ripple here: a ripple is clipped to the Pressable's rectangle,
  // so on a flex-1 tab it flashed as a square. Material 3 puts the state
  // layer on the pill instead, so the pill tints while pressed.
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      className="flex-1 items-center gap-1"
    >
      <View className="h-8 w-16 items-center justify-center">
        <PillLayer opacity={active ? 1 : pressed ? 0.6 : 0} />
        <Icon size={24} color={active ? colors.teal : colors.label} />
        {badge ? <Badge count={badge} /> : null}
      </View>
      <Text style={[type.nav, { color: active ? colors.heading : colors.label }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The artifact's `.navb`: 84dp on the panel colour, three tabs with a 64x32
 * pill indicator behind the active icon.
 */
export function TabBar({
  active,
  badges,
  onChange,
}: {
  active: HandheldTab;
  badges?: Partial<Record<HandheldTab, number>>;
  onChange: (tab: HandheldTab) => void;
}) {
  return (
    <View
      className="flex-row px-1.5 pt-3"
      style={{ minHeight: metrics.nav, backgroundColor: colors.panel }}
    >
      {TABS.map((t) => (
        <Tab
          key={t.key}
          label={t.label}
          Icon={t.Icon}
          active={t.key === active}
          badge={badges?.[t.key]}
          onPress={() => onChange(t.key)}
        />
      ))}
    </View>
  );
}
