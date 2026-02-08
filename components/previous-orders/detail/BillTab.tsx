import { PreviousOrder } from "@/lib/types";
import { computeOrderTotals } from "@/utils/previousOrderMapper";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Switch, Text, View } from "react-native";
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

  const renderItem = useCallback(
    ({ item }: { item: (typeof order.items)[0] }) => (
      <View className="mb-2.5">
        <OrderDetailBillItem item={item} showCashPricing={showCashPricing} />
      </View>
    ),
    [showCashPricing],
  );

  const keyExtractor = useCallback(
    (item: (typeof order.items)[0]) => item.id,
    [],
  );

  return (
    <View className="flex-1">
      {/* Cash/Card pricing toggle */}
      {hasCashPricing && (
        <View className="flex-row items-center justify-between px-4 py-2.5 mb-2 bg-[#2a2a2a] rounded-lg mx-4 mt-2">
          <Text className="text-sm text-gray-400">
            Show Cash Pricing
          </Text>
          <Switch
            value={showCashPricing}
            onValueChange={setShowCashPricing}
            trackColor={{ false: "#525252", true: "#22C55E" }}
            thumbColor="#FFFFFF"
          />
        </View>
      )}

      {/* Items list */}
      <FlatList
        data={order.items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <View className="mt-3 pt-3 border-t border-gray-700">
            {/* Subtotal */}
            <TotalRow label="Subtotal" value={displaySubtotal} />

            {/* Discount */}
            {displayDiscount > 0 && (
              <TotalRow
                label="Discount"
                value={-displayDiscount}
                color="text-green-400"
              />
            )}

            {/* Tax */}
            <TotalRow label="Tax" value={displayTax} />

            {/* Voided items note */}
            {totals.voidedCount > 0 && (
              <Text className="text-xs text-gray-500 mt-1">
                {totals.voidedCount} voided item
                {totals.voidedCount > 1 ? "s" : ""} excluded
              </Text>
            )}

            {/* Total */}
            <View className="flex-row justify-between items-center pt-3 mt-2 border-t border-gray-600">
              <Text className="text-xl font-bold text-white">Total</Text>
              <Text className="text-xl font-bold text-white">
                ${totals.total.toFixed(2)}
              </Text>
            </View>

            {/* Amount Paid */}
            <TotalRow
              label="Amount Paid"
              value={totals.totalPaid}
              color="text-green-400"
            />

            {/* Refunded */}
            {totals.totalRefunded > 0 && (
              <TotalRow
                label="Refunded"
                value={totals.totalRefunded}
                color="text-red-400"
              />
            )}

            {/* Balance Due */}
            {totals.balanceDue > 0 && (
              <TotalRow
                label="Balance Due"
                value={totals.balanceDue}
                color="text-yellow-400"
                bold
              />
            )}

            <View className="h-4" />
          </View>
        }
      />
    </View>
  );
};

const TotalRow = ({
  label,
  value,
  color = "text-gray-300",
  bold = false,
}: {
  label: string;
  value: number;
  color?: string;
  bold?: boolean;
}) => (
  <View className="flex-row justify-between py-1">
    <Text className={`text-sm ${color} ${bold ? "font-bold" : ""}`}>
      {label}
    </Text>
    <Text className={`text-sm font-semibold ${color} ${bold ? "font-bold" : ""}`}>
      {value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}
    </Text>
  </View>
);

export default React.memo(BillTab);
