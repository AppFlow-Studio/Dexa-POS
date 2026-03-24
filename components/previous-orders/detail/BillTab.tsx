import { colors } from "@/lib/theme";
import { PreviousOrder } from "@/lib/types";
import { computeOrderTotals } from "@/utils/previousOrderMapper";
import React, { useMemo, useState } from "react";
import { Switch, Text, View } from "react-native";
import OrderDetailBillItem from "./OrderDetailBillItem";

interface BillTabProps {
  order: PreviousOrder;
}

const BillTab: React.FC<BillTabProps> = ({ order }) => {
  const [showCashPricing, setShowCashPricing] = useState(false);

  const hasCashPricing = useMemo(
    () => order.items.some((item) => item.cashPrice !== item.price),
    [order.items],
  );

  const totals = useMemo(() => computeOrderTotals(order), [order]);

  const displaySubtotal = showCashPricing
    ? totals.cashSubtotal
    : totals.subtotal;
  const displayTax = showCashPricing ? totals.cashTaxAmount : totals.taxAmount;
  const displayDiscount = showCashPricing
    ? totals.cashDiscountAmount
    : totals.discountAmount;

  return (
    <View className="flex-1">
      {/* Cash/Card pricing toggle */}
      {hasCashPricing && (
        <View
          className="flex-row items-center justify-between px-4 py-2.5 mb-2 rounded-lg mx-4 mt-2"
          style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.teal + '30' }}
        >
          <Text style={{ fontSize: 14, color: colors.label }}>
            Show Cash Pricing
          </Text>
          <Switch
            value={showCashPricing}
            onValueChange={setShowCashPricing}
            trackColor={{ false: colors.muted, true: colors.teal }}
            thumbColor={colors.onSolid}
          />
        </View>
      )}

      {/* Items list */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        {order.items.map((item) => (
          <View key={item.id} className="mb-2.5">
            <OrderDetailBillItem item={item} showCashPricing={showCashPricing} />
          </View>
        ))}

        <View
          style={{
            marginTop: 10,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10
          }}
        >
          {/* Subtotal */}
          <TotalRow label="Subtotal" value={displaySubtotal} />

          {/* Discount */}
          {displayDiscount > 0 && (
            <TotalRow
              label="Discount"
              value={-displayDiscount}
              color={colors.teal}
            />
          )}

          {/* Tax */}
          <TotalRow label="Tax" value={displayTax} />

          {/* Voided items note */}
          {totals.voidedCount > 0 && (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
              {totals.voidedCount} voided item
              {totals.voidedCount > 1 ? "s" : ""} excluded
            </Text>
          )}

          {/* Total */}
          <View className="flex-row justify-between items-center pt-2 mt-2 border-t border-border">
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}>
              Total
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.teal }}>
              ${totals.total.toFixed(2)}
            </Text>
          </View>

          {/* Amount Paid */}
          <TotalRow
            label="Amount Paid"
            value={totals.totalPaid}
            color={colors.teal}
          />

          {/* Refunded */}
          {totals.totalRefunded > 0 && (
            <TotalRow
              label="Refunded"
              value={totals.totalRefunded}
              color={colors.danger}
            />
          )}

          {/* Balance Due */}
          {totals.balanceDue > 0 && (
            <TotalRow
              label="Balance Due"
              value={totals.balanceDue}
              color={colors.teal}
              bold
            />
          )}

          <View className="h-1" />
        </View>
      </View>
    </View>
  );
};

const TotalRow = ({
  label,
  value,
  color = colors.label,
  bold = false,
}: {
  label: string;
  value: number;
  color?: string;
  bold?: boolean;
}) => (
  <View className="flex-row justify-between py-1">
    <Text style={{ fontSize: 14, color, fontWeight: bold ? "700" : "400" }}>
      {label}
    </Text>
    <Text style={{ fontSize: 14, color, fontWeight: bold ? "700" : "600" }}>
      {value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}
    </Text>
  </View>
);

export default React.memo(BillTab);
