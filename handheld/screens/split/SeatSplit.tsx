import React, { useMemo } from "react";
import { ScrollView } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { Card, CardHeader } from "../../components/check/Card";
import { LineItem } from "../../components/check/LineItem";
import { formatCurrency } from "../../lib/format";
import { groupBySeat, linesDue, type OpenLine } from "../../lib/split";
import { Button } from "../../primitives";
import type { SplitShare } from "../pay/unwired";

function shareOf(label: string, lines: readonly OpenLine[], amount: number): SplitShare {
  return { label, amount, items: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity })) };
}

/**
 * "By seat": one card per seat with its unpaid lines and a "Pay $X" pill,
 * items with no seat last as "Shared". A check with no seats at all says so
 * rather than showing one card that is the whole check.
 */
export function SeatSplit({
  lines,
  taxRatesMap,
  busy,
  onPay,
}: {
  lines: readonly OpenLine[];
  taxRatesMap: Record<string, number>;
  busy: boolean;
  onPay: (share: SplitShare) => void;
}) {
  const groups = useMemo(
    () => groupBySeat(lines).map((g) => ({ ...g, amount: linesDue(g.lines, taxRatesMap) })),
    [lines, taxRatesMap],
  );

  if (groups.every((g) => g.seat === null)) {
    return <EmptyState title="No seats on this check" hint="Items were added without a seat. Split evenly or by item instead." />;
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
      {groups.map((g) => {
        const label = g.seat === null ? "Shared" : `Seat ${g.seat}`;
        const count = g.lines.reduce((n, l) => n + l.quantity, 0);
        return (
          <Card key={label}>
            <CardHeader
              title={label}
              detail={`${count} ${count === 1 ? "item" : "items"}`}
              trailing={
                <Button
                  label={`Pay ${formatCurrency(g.amount)}`}
                  variant="tonal"
                  fit
                  disabled={busy}
                  onPress={() => onPay(shareOf(label, g.lines, g.amount))}
                />
              }
            />
            {g.lines.map((l) => (
              <LineItem key={l.item.id} item={l.quantity === l.item.quantity ? l.item : { ...l.item, quantity: l.quantity }} />
            ))}
          </Card>
        );
      })}
    </ScrollView>
  );
}
