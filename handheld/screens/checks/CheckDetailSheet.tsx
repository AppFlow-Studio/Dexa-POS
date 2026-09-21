import { colors } from "@/lib/theme";
import type { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { DetailRow } from "../../components/DetailRow";
import { formatCurrency } from "../../lib/format";
import { checkNumber, checkPlace } from "../../lib/openChecks";
import { BottomSheet, StickyActionBar } from "../../primitives";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** One line item: "2 × Burger" left, line total right. No photos (ticket). */
function ItemLine({ item }: { item: CartItem }) {
  return (
    <View
      className="min-h-11 flex-row items-center px-4 py-2"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Text
        className="w-8 text-base"
        style={[{ color: colors.muted }, TABULAR]}
        numberOfLines={1}
      >
        {item.quantity}×
      </Text>
      <Text
        className="flex-1 text-base"
        style={{ color: colors.heading }}
        numberOfLines={2}
      >
        {item.name}
      </Text>
      <Text
        className="ml-3 text-base"
        style={[{ color: colors.heading }, TABULAR]}
      >
        {formatCurrency(item.price * item.quantity)}
      </Text>
    </View>
  );
}

/** Read-only body: items, then the totals the profile actually carries. */
function CheckDetailBody({ orderId }: { orderId: string }) {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  if (!order) return null;
  const items = order.items.filter((i) => !i.is_voided);
  const paid = order.amount_paid ?? 0;
  return (
    <>
      {items.map((item) => (
        <ItemLine key={item.id} item={item} />
      ))}
      {order.total_discount ? (
        <DetailRow label="Discount" value={`−${formatCurrency(order.total_discount)}`} />
      ) : null}
      {order.service_charge ? (
        <DetailRow
          label={order.service_charge_name ?? "Service charge"}
          value={formatCurrency(order.service_charge)}
        />
      ) : null}
      <DetailRow label="Tax" value={formatCurrency(order.total_tax ?? 0)} />
      <DetailRow label="Total" value={formatCurrency(order.total_amount ?? 0)} emphasis />
      {paid > 0 ? (
        <>
          <DetailRow label="Paid" value={formatCurrency(paid)} />
          <DetailRow label="Due" value={formatCurrency(order.amount_due ?? 0)} emphasis />
        </>
      ) : null}
    </>
  );
}

/**
 * Screen S1 tap target: a read-only look at one check. Adding, sending and
 * payment land in later waves; the only action here is Close.
 */
export function CheckDetailSheet({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const title = useOrderStore((s) => {
    const order = orderId ? s.ordersById[orderId] : undefined;
    if (!order) return "";
    const place = checkPlace(order);
    return place ? `${checkNumber(order)} · ${place}` : checkNumber(order);
  });

  return (
    <BottomSheet
      visible={orderId !== null}
      onClose={onClose}
      title={title}
      footer={
        <StickyActionBar
          actions={[{ label: "Close", onPress: onClose, variant: "secondary" }]}
        />
      }
    >
      {orderId ? <CheckDetailBody orderId={orderId} /> : null}
    </BottomSheet>
  );
}
