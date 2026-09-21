import { colors } from "@/lib/theme";
import { Lock, type LucideIcon } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/** `.mgr`: the small "Manager" pill shown before a gated action is tapped. */
export function ManagerPill() {
  return (
    <View className="flex-row items-center gap-1 rounded-full px-2.5" style={{ minHeight: 26, backgroundColor: colors.card }}>
      <Lock size={13} color={colors.label} strokeWidth={2.2} />
      <Text style={[type.nav, { color: colors.label }]}>Manager</Text>
    </View>
  );
}

/** `.act`: a 60dp row with an icon, a label, an optional value, and the Manager pill when gated. */
export function ActionRow({
  icon: Icon,
  label,
  value,
  gated = false,
  danger = false,
  divider,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  /** "Seat 2" / "Course 1": the current value, right-aligned. */
  value?: string;
  gated?: boolean;
  danger?: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const fg = danger ? colors.danger : colors.heading;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-4 px-5" style={{ minHeight: 60 }}>
      {divider ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 58, right: 20, height: 1, backgroundColor: tint.divider }} />
      ) : null}
      <Icon size={22} color={danger ? colors.danger : colors.label} />
      <Text className="flex-1" style={[type.row, { fontWeight: "400", color: fg }]}>
        {label}
      </Text>
      {value ? <Text style={[type.detail, { color: colors.label }]}>{value}</Text> : null}
      {gated ? <ManagerPill /> : null}
    </Pressable>
  );
}
