import { colors } from "@/lib/theme";
import { LayoutGrid, Receipt, User, type LucideIcon } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { metrics, tint } from "../lib/tokens";
import { type } from "../lib/type";
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      android_ripple={{ color: tint.accentSoft, borderless: true }}
      className="flex-1 items-center gap-1"
    >
      <View
        className="h-8 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: active ? tint.accentSoft : "transparent" }}
      >
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
