import { colors } from "@/lib/theme";
import type { OrderProfile } from "@/lib/types";
import React from "react";
import { Text, View } from "react-native";
import { formatCurrency } from "../../lib/format";
import { type } from "../../lib/type";

function Line({ label, value, total = false }: { label: string; value: string; total?: boolean }) {
  const style = total ? type.sumTotal : type.sum;
  const color = total ? colors.heading : colors.label;
  return (
    <View className={total ? "flex-row justify-between pt-2" : "flex-row justify-between py-1"}>
      <Text style={[style, { color }]}>{label}</Text>
      <Text style={[style, { color }]}>{value}</Text>
    </View>
  );
}

/**
 * The artifact's `.sum`: subtotal, tax and total (plus discount, service
 * charge, paid and due when they apply). Subtotal is derived from the
 * profile's own totals so it never disagrees with the register.
 */
export function Totals({ order }: { order: OrderProfile }) {
  const total = order.total_amount ?? 0;
  const tax = order.total_tax ?? 0;
  const discount = order.total_discount ?? 0;
  const service = order.service_charge ?? 0;
  const paid = order.amount_paid ?? 0;
  const subtotal = Math.max(0, total - tax - service + discount);
  return (
    <View className="px-8 pt-1">
      <Line label="Subtotal" value={formatCurrency(subtotal)} />
      {discount > 0 ? <Line label="Discount" value={`−${formatCurrency(discount)}`} /> : null}
      {service > 0 ? (
        <Line label={order.service_charge_name ?? "Service charge"} value={formatCurrency(service)} />
      ) : null}
      <Line label="Tax" value={formatCurrency(tax)} />
      <Line label="Total" value={formatCurrency(total)} total />
      {paid > 0 ? (
        <>
          <Line label="Paid" value={formatCurrency(paid)} />
          <Line label="Due" value={formatCurrency(order.amount_due ?? Math.max(0, total - paid))} total />
        </>
      ) : null}
    </View>
  );
}
