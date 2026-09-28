import React from "react";
import { formatCurrency } from "../../lib/format";
import { Button, ListRow } from "../../primitives";

/**
 * One share of an even split: a `.row` with the share's name, its amount
 * under it, and a tonal "Pay" pill on the right. At most 20 rows, so no memo.
 */
export function ShareRow({
  title,
  amount,
  divider,
  disabled,
  onPay,
}: {
  title: string;
  amount: number;
  divider: boolean;
  disabled: boolean;
  onPay: () => void;
}) {
  return (
    <ListRow
      title={title}
      detail={formatCurrency(amount)}
      divider={divider}
      right={<Button label="Pay" variant="tonal" fit disabled={disabled} onPress={onPay} />}
    />
  );
}
