import { colors } from "@/lib/theme";
import type { OrderProfilePayment } from "@/lib/types";
import { Coins, Undo2 } from "@/lib/icons";
import React from "react";
import { Text, View } from "react-native";
import { ActionRow } from "../../components/check/ActionRow";
import { formatClock, formatCurrency } from "../../lib/format";
import { canAdjustTip, paymentTitle, refundable } from "../../lib/paymentRecords";
import { type } from "../../lib/type";
import { BottomSheet } from "../../primitives";

/**
 * What can be done to one payment: adjust the tip (card only, nothing
 * refunded yet) and refund (behind a manager, as the register gates it).
 */
export function PaymentSheet({
  payment,
  onClose,
  onAdjustTip,
  onRefund,
}: {
  payment: OrderProfilePayment;
  onClose: () => void;
  onAdjustTip: () => void;
  onRefund: () => void;
}) {
  const tip = canAdjustTip(payment);
  const left = refundable(payment);
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={paymentTitle(payment)}
      subtitle={`${formatCurrency(payment.total_collected ?? payment.amount)} · ${formatClock(payment.timestamp)}`}
    >
      <View className="pb-6 pt-1">
        {tip ? <ActionRow icon={Coins} label="Adjust tip" value={formatCurrency(payment.tip_amount ?? 0)} divider={false} onPress={onAdjustTip} /> : null}
        {left > 0 ? <ActionRow icon={Undo2} label="Refund" value={formatCurrency(left)} gated danger divider={tip} onPress={onRefund} /> : null}
        {!tip && left <= 0 ? (
          <Text className="px-5 py-3" style={[type.sheetDesc, { color: colors.label }]}>
            Nothing left to change on this payment.
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
