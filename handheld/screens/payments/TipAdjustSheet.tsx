import type { OrderProfilePayment } from "@/lib/types";
import { round2 } from "@/utils/money";
import React, { useState } from "react";
import { View } from "react-native";
import { AmountDisplay } from "../../components/AmountDisplay";
import { amountOf, typeAmount } from "../../lib/amountInput";
import { formatCurrency } from "../../lib/format";
import { paymentTitle } from "../../lib/paymentRecords";
import { BottomSheet, Keypad, StickyActionBar } from "../../primitives";
import { adjustTip } from "../pay/unwired";

/**
 * Change the tip on a card payment — the guest wrote a different tip on the
 * signed slip. Starts from the current tip; the line under the figure keeps
 * the new card total in view.
 *
 * Not wired: `adjustTip` is a Wave 4b seam (`screens/pay/unwired.ts`).
 */
export function TipAdjustSheet({
  orderId,
  payment,
  onClose,
}: {
  orderId: string;
  payment: OrderProfilePayment;
  onClose: () => void;
}) {
  const current = payment.tip_amount ?? 0;
  const [raw, setRaw] = useState(current > 0 ? current.toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const tip = amountOf(raw);
  const changed = Math.abs(tip - current) >= 0.005;

  const save = async () => {
    setBusy(true);
    const ok = await adjustTip(orderId, payment.id, tip);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Adjust tip"
      subtitle={`${paymentTitle(payment)} · was ${formatCurrency(current)}`}
      footer={
        <StickyActionBar
          actions={[{ label: busy ? "Saving…" : `Save ${formatCurrency(tip)} tip`, disabled: !changed || busy, onPress: () => void save() }]}
        />
      }
    >
      <AmountDisplay
        label="New tip"
        value={formatCurrency(tip)}
        note={`Card total ${formatCurrency(round2(payment.amount + tip))}`}
      />
      <Keypad onKey={(k) => setRaw((r) => typeAmount(r, k))} onBackspace={() => setRaw((r) => r.slice(0, -1))} />
      <View className="h-4" />
    </BottomSheet>
  );
}
