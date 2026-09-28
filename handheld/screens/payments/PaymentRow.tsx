import { colors } from "@/lib/theme";
import type { OrderProfilePayment } from "@/lib/types";
import { Banknote, CreditCard } from "@/lib/icons";
import React, { useCallback } from "react";
import { formatCurrency } from "../../lib/format";
import { isSettledOut, paymentDetail, paymentTitle } from "../../lib/paymentRecords";
import { tint } from "../../lib/tokens";
import { ListRow } from "../../primitives";

/**
 * One payment on the check: method tile, "Visa ending 4412", "8:14 · $37.93
 * tip", and what was collected. A voided or fully refunded payment dims its
 * tile and is not tappable — there is nothing left to do with it.
 */
export const PaymentRow = React.memo(function PaymentRow({
  payment,
  divider,
  onPress,
}: {
  payment: OrderProfilePayment;
  divider: boolean;
  onPress: (paymentId: string) => void;
}) {
  const press = useCallback(() => onPress(payment.id), [onPress, payment.id]);
  const out = isSettledOut(payment);
  const Icon = payment.method === "Cash" ? Banknote : CreditCard;
  const fg = out ? colors.muted : colors.teal;
  return (
    <ListRow
      tile={{ bg: out ? colors.panel : tint.accentSoft, fg, icon: <Icon size={24} color={fg} /> }}
      title={paymentTitle(payment)}
      detail={paymentDetail(payment)}
      value={formatCurrency(payment.total_collected ?? payment.amount)}
      divider={divider}
      onPress={out ? undefined : press}
    />
  );
});
