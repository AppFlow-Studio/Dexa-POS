import { colors } from "@/lib/theme";
import { Lock, Percent, Printer, Receipt, StickyNote, Trash2, type LucideIcon } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import { BottomSheet } from "../../primitives";

/** `.mgr`: the small "Manager" pill shown before a gated action is tapped. */
function ManagerPill() {
  return (
    <View className="flex-row items-center gap-1 rounded-full px-2.5" style={{ minHeight: 26, backgroundColor: colors.card }}>
      <Lock size={13} color={colors.label} strokeWidth={2.2} />
      <Text style={[type.nav, { color: colors.label }]}>Manager</Text>
    </View>
  );
}

/** `.act`: a 60dp row with an icon, a label, and the Manager pill when gated. */
function ActionRow({
  icon: Icon,
  label,
  gated = false,
  danger = false,
  divider,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
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
      {gated ? <ManagerPill /> : null}
    </Pressable>
  );
}

/** S5: discount, note, printing and void in one sheet, the gated ones marked up front. */
export function MoreSheet({
  visible,
  title,
  subtitle,
  onClose,
  onDiscount,
  onNote,
  onPrintCheck,
  onPrintKitchen,
  onVoid,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  onDiscount: () => void;
  onNote: () => void;
  onPrintCheck: () => void;
  onPrintKitchen: () => void;
  onVoid: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View className="pb-6 pt-1">
        <ActionRow icon={Percent} label="Apply discount" gated divider={false} onPress={onDiscount} />
        <ActionRow icon={StickyNote} label="Add a note" divider onPress={onNote} />
        <ActionRow icon={Receipt} label="Print the check" divider onPress={onPrintCheck} />
        <ActionRow icon={Printer} label="Print a kitchen ticket" divider onPress={onPrintKitchen} />
        <ActionRow icon={Trash2} label="Void order" gated danger divider onPress={onVoid} />
      </View>
    </BottomSheet>
  );
}
