import { toastService } from "@/lib/toastService";
import React, { useState } from "react";
import { View } from "react-native";
import { AmountDisplay } from "../../components/AmountDisplay";
import { amountOf, typeAmount } from "../../lib/amountInput";
import { formatCurrency } from "../../lib/format";
import { customTipBlockedReason } from "../../lib/payments";
import { BottomSheet, Keypad, StickyActionBar } from "../../primitives";

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
  const value = amountOf(raw);

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
      <AmountDisplay label="Tip amount" value={formatCurrency(value)} />
      <Keypad onKey={(k) => setRaw((r) => typeAmount(r, k))} onBackspace={() => setRaw((r) => r.slice(0, -1))} />
      <View className="h-4" />
    </BottomSheet>
  );
}
