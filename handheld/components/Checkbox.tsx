import { colors } from "@/lib/theme";
import { Check } from "@/lib/icons";
import React from "react";
import { View } from "react-native";

/**
 * The artifact's `.ckb`: a 22dp rounded square, accent-filled with a check
 * when on, an outlined empty square when off. Display only — the row it sits
 * in owns the press and the accessibility state.
 */
export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View
      className="items-center justify-center"
      style={{
        width: 22,
        height: 22,
        borderRadius: 7,
        backgroundColor: checked ? colors.teal : "transparent",
        borderWidth: checked ? 0 : 2,
        borderColor: colors.label,
      }}
    >
      {checked ? <Check size={15} color={colors.onSolid} strokeWidth={3} /> : null}
    </View>
  );
}
