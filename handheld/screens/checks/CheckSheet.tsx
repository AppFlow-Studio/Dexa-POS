import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { CheckBody } from "../../components/check/CheckBody";
import { checkNumber, checkTitle, orderKind, orderKindLabel } from "../../lib/checks";
import { formatCurrency } from "../../lib/format";
import { BottomSheet } from "../../primitives";

/**
 * Screen S3 as a read-only sheet: "Order #1045" over "Takeout · Ben K. ·
 * $94.18", then the items card and totals. Actions land in Wave 2.
 */
export function CheckSheet({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const order = useOrderStore((s) => (orderId ? s.ordersById[orderId] : undefined));
  const who = order ? (checkTitle(order).split(" · ")[1] ?? "") : "";
  const subtitle = order
    ? [orderKindLabel(orderKind(order)), who, formatCurrency(order.total_amount ?? 0)]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <BottomSheet
      visible={orderId !== null}
      onClose={onClose}
      title={order ? `Order ${checkNumber(order)}` : undefined}
      subtitle={subtitle}
    >
      {orderId ? <CheckBody orderId={orderId} /> : null}
    </BottomSheet>
  );
}
