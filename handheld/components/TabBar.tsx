import { colors } from "@/lib/theme";
import { Armchair, Receipt, User, type LucideIcon } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { HandheldTab } from "../types";

const TABS: readonly { key: HandheldTab; label: string; Icon: LucideIcon }[] = [
  { key: "tables", label: "Tables", Icon: Armchair },
  { key: "checks", label: "Checks", Icon: Receipt },
  { key: "me", label: "Me", Icon: User },
];

function Tab({
  label,
  Icon,
  active,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  active: boolean;
  onPress: () => void;
}) {
  const tint = active ? colors.teal : colors.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      android_ripple={{ color: colors.tealMuted }}
      className="min-h-14 flex-1 items-center justify-center py-1"
    >
      <Icon size={22} color={tint} />
      <Text className="mt-0.5 text-xs font-semibold" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Bottom tab bar: Tables, Checks, Me. */
export function TabBar({
  active,
  onChange,
}: {
  active: HandheldTab;
  onChange: (tab: HandheldTab) => void;
}) {
  return (
    <View
      className="flex-row"
      style={{
        backgroundColor: colors.panel,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
      }}
    >
      {TABS.map((t) => (
        <Tab
          key={t.key}
          label={t.label}
          Icon={t.Icon}
          active={t.key === active}
          onPress={() => onChange(t.key)}
        />
      ))}
    </View>
  );
}
