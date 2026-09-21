import { colors } from "@/lib/theme";
import type { ModifierOption } from "@/lib/types";
import { Check } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { formatCurrency } from "../../lib/format";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/** `.rd`: a 22dp radio ring; `multiple` draws a rounded square with a check. */
function Mark({ on, multiple }: { on: boolean; multiple: boolean }) {
  return (
    <View
      className="items-center justify-center"
      style={{
        width: 22,
        height: 22,
        borderRadius: multiple ? 6 : 11,
        borderWidth: 2,
        borderColor: on ? colors.teal : colors.label,
        backgroundColor: on && multiple ? colors.teal : "transparent",
      }}
    >
      {on ? (
        multiple ? (
          <Check size={14} color={colors.onSolid} strokeWidth={3} />
        ) : (
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.teal }} />
        )
      ) : null}
    </View>
  );
}

/** The artifact's `.opt`: 56dp, mark, name, "+$3.00" when priced; inset divider. */
export function OptionRow({
  option,
  selected,
  multiple,
  divider,
  onPress,
}: {
  option: ModifierOption;
  selected: boolean;
  multiple: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const unavailable = option.isAvailable === false || !!option.snoozedUntil;
  return (
    <Pressable
      onPress={onPress}
      disabled={unavailable}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, disabled: unavailable }}
      className="flex-row items-center gap-4 px-5"
      style={{ minHeight: 56, opacity: unavailable ? 0.4 : 1 }}
    >
      {divider ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, left: 58, right: 20, height: 1, backgroundColor: tint.divider }}
        />
      ) : null}
      <Mark on={selected} multiple={multiple} />
      <Text className="flex-1" style={[type.row, { fontWeight: "400", color: colors.heading }]} numberOfLines={2}>
        {option.name}
      </Text>
      {option.price > 0 ? (
        <Text style={[type.sum, { color: colors.label }]}>+{formatCurrency(option.price)}</Text>
      ) : null}
    </Pressable>
  );
}
