import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { formatCurrency } from "../../lib/format";
import { customTipBlockedReason } from "../../lib/payments";
import { type } from "../../lib/type";
import { BottomSheet, Keypad, type KeypadKey, StickyActionBar } from "../../primitives";

/** Digits with at most one point and two decimals — CustomDiscountSheet's rule, amounts only. */
function typeValue(current: string, key: KeypadKey): string {
  if (key === ".") return current.includes(".") ? current : current ? `${current}.` : "0.";
  const [whole, decimals] = current.split(".");
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (decimals === undefined && whole.length >= 7) return current;
  if (current === "0" && key !== "00") return key;
  return current + key;
}

/**
 * Screen 7's "Custom" button: a keypad for a typed tip. Same shape as
 * `CustomDiscountSheet` — no segment, since a tip is only ever an amount, so
 * `leftKey` is left at its default ".".
 */
export function CustomTipSheet({
  balance,
  onApply,
  onClose,
}: {
  balance: number;
  onApply: (amount: number) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const value = Number(raw) || 0;

  const apply = () => {
    const blocked = customTipBlockedReason(value);
    if (blocked) {
      toastService.show({ title: "Invalid tip", message: blocked, type: "error" });
      return;
    }
    onApply(value);
    onClose();
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Custom tip"
      subtitle={`Balance ${formatCurrency(balance)}`}
      footer={
        <StickyActionBar
          actions={[
            {
              label: `Add ${formatCurrency(value)} tip`,
              disabled: value <= 0,
              onPress: apply,
            },
          ]}
        />
      }
    >
      <View className="items-center px-5 pt-3.5" style={{ paddingBottom: 10 }}>
        <Text style={[type.detail, { color: colors.label }]}>Tip amount</Text>
        <Text
          style={{
            fontSize: 44,
            fontWeight: "700",
            lineHeight: 52,
            letterSpacing: -1.3,
            color: colors.heading,
          }}
        >
          {formatCurrency(value)}
        </Text>
      </View>
      <Keypad onKey={(k) => setRaw((r) => typeValue(r, k))} onBackspace={() => setRaw((r) => r.slice(0, -1))} />
      <View className="h-4" />
    </BottomSheet>
  );
}
