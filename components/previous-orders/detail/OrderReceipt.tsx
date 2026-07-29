import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { BottomSheetScrollView } from "@/components/ui/bottomSheet";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

interface OrderReceiptProps {
  order: OrderProfile;
}

const OrderReceipt: React.FC<OrderReceiptProps> = ({ order }) => {
  const subtotal = useMemo(() => {
    return order.items.reduce(
      (sum, item) => sum + (item.subtotal ?? item.price * item.quantity),
      0,
    );
  }, [order.items]);

  const tax = order.total_tax ?? 0;
  const discount = order.total_discount ?? 0;
  const total = order.total_amount ?? 0;

  const tipTotal = useMemo(() => {
    return (order.payments || [])
      .filter((p) => !p.isVoided)
      .reduce((sum, p) => sum + (p.tip_amount || 0), 0);
  }, [order.payments]);

  const totalRefunded = useMemo(() => {
    return (order.payments || []).reduce(
      (sum, p) => sum + (p.refundedAmount ?? 0),
      0,
    );
  }, [order.payments]);

  const activePayments = useMemo(() => {
    return (order.payments || []).filter((p) => !p.isVoided);
  }, [order.payments]);

  return (
    <BottomSheetScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="bg-panel rounded-xl p-4 border border-gray-700">
        {/* Receipt Header */}
        <View className="items-center pb-3 border-b border-dashed border-gray-600">
          <Text className="text-lg font-bold text-white">Receipt</Text>
          <Text className="text-sm text-gray-400 mt-1">
            {order.display_number || order.order_number || order.id}
          </Text>
        </View>

        {/* Items */}
        <View className="py-3 border-b border-dashed border-gray-600">
          {order.items.map((item, idx) => (
            <View key={item.id || idx} className="mb-2">
              <View className="flex-row justify-between">
                <View className="flex-1 flex-row">
                  <Text className="text-sm text-gray-400 mr-2" style={{ width: 24 }}>
                    {item.quantity}x
                  </Text>
                  <Text className="text-sm text-white flex-1" numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <Text className="text-sm text-white ml-2">
                  ${(item.subtotal ?? item.price * item.quantity).toFixed(2)}
                </Text>
              </View>
              {/* Modifiers */}
              {item.customizations?.modifiers &&
                item.customizations.modifiers.length > 0 && (
                  <View className="ml-8">
                    {item.customizations.modifiers.map((modGroup) =>
                      modGroup.options.map((opt, oidx) => (
                        <Text
                          key={`${modGroup.categoryId}-${oidx}`}
                          className="text-xs text-gray-500"
                        >
                          + {opt.name}
                          {opt.price > 0 ? ` $${opt.price.toFixed(2)}` : ""}
                        </Text>
                      )),
                    )}
                  </View>
                )}
            </View>
          ))}
        </View>

        {/* Totals */}
        <View className="py-3 border-b border-dashed border-gray-600">
          <TotalLine label="Subtotal" amount={subtotal} />
          <TotalLine label="Tax" amount={tax} />
          {discount > 0 && (
            <TotalLine
              label="Discount"
              amount={-discount}
              color="text-green-400"
            />
          )}
          {tipTotal > 0 && (
            <TotalLine label="Tip" amount={tipTotal} color="text-green-400" />
          )}
          {totalRefunded > 0 && (
            <TotalLine
              label="Refund"
              amount={-totalRefunded}
              color="text-red-400"
            />
          )}
        </View>

        {/* Grand Total */}
        <View className="flex-row justify-between py-3 border-b border-dashed border-gray-600">
          <Text className="text-base font-bold text-white">Total</Text>
          <Text className="text-base font-bold text-white">
            ${total.toFixed(2)}
          </Text>
        </View>

        {/* Payments Summary */}
        {activePayments.length > 0 && (
          <View className="pt-3">
            <Text className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
              Payments
            </Text>
            {activePayments.map((payment, idx) => {
              const methodLabel =
                payment.method === "Cash"
                  ? "Cash"
                  : `${payment.cardBrand || "Card"} ${payment.last4 ? `••••${payment.last4}` : ""}`.trim();
              return (
                <View
                  key={payment.id || idx}
                  className="flex-row justify-between mb-1.5"
                >
                  <Text className="text-xs text-gray-400">{methodLabel}</Text>
                  <Text className="text-xs text-gray-300">
                    ${payment.amount.toFixed(2)}
                    {payment.tip_amount > 0
                      ? ` (+$${payment.tip_amount.toFixed(2)} tip)`
                      : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </BottomSheetScrollView>
  );
};

const TotalLine = ({
  label,
  amount,
  color,
}: {
  label: string;
  amount: number;
  color?: string;
}) => (
  <View className="flex-row justify-between mb-1">
    <Text className="text-sm text-gray-400">{label}</Text>
    <Text className={`text-sm ${color || "text-white"}`}>
      {amount < 0 ? "-" : ""}${Math.abs(amount).toFixed(2)}
    </Text>
  </View>
);

export default React.memo(OrderReceipt);
