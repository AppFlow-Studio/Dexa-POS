import { PreviousOrder } from "@/lib/types";
import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

interface RefundsTabProps {
  order: PreviousOrder;
}

const reversalTypeLabels: Record<string, { label: string; color: string; bg: string }> = {
  void: { label: "VOIDED", color: "text-red-400", bg: "bg-red-900/50" },
  refund: { label: "REFUNDED", color: "text-orange-400", bg: "bg-orange-900/50" },
  partial_refund: { label: "PARTIAL REFUND", color: "text-yellow-400", bg: "bg-yellow-900/50" },
  item_return: { label: "ITEM RETURN", color: "text-blue-400", bg: "bg-blue-900/50" },
};

const statusColors: Record<string, { text: string; bg: string }> = {
  pending: { text: "text-yellow-400", bg: "bg-yellow-900/40" },
  completed: { text: "text-green-400", bg: "bg-green-900/40" },
  failed: { text: "text-red-400", bg: "bg-red-900/40" },
};

const RefundsTab: React.FC<RefundsTabProps> = ({ order }) => {
  const reversals = order.reversals || [];
  const refundItems = order.order_refund_items || [];

  const refundSummary = useMemo(() => {
    const originalTotal = order.total;
    const totalRefunded = order.refundedAmount || 0;
    const remaining = Math.max(0, originalTotal - totalRefunded);
    return { originalTotal, totalRefunded, remaining };
  }, [order]);

  const hasNoRefunds = reversals.length === 0 && refundItems.length === 0;

  if (hasNoRefunds) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <Text className="text-gray-500 text-lg">No refunds</Text>
        <Text className="text-gray-600 text-sm mt-1">
          This order has no refund history
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Refund Summary Card */}
      <View className="bg-[#303030] rounded-xl p-4 mb-4 border border-gray-700">
        <Text className="text-base font-bold text-white mb-3">
          Refund Summary
        </Text>
        <SummaryRow label="Original Total" value={refundSummary.originalTotal} />
        <SummaryRow
          label="Total Refunded"
          value={refundSummary.totalRefunded}
          color="text-red-400"
        />
        <View className="border-t border-gray-700 mt-2 pt-2">
          <SummaryRow
            label="Remaining Refundable"
            value={refundSummary.remaining}
            color="text-green-400"
            bold
          />
        </View>
      </View>

      {/* Reversal History */}
      {reversals.length > 0 && (
        <View className="mb-4">
          <Text className="text-base font-bold text-white mb-3">
            Reversal History
          </Text>
          {reversals.map((reversal) => {
            const typeConfig =
              reversalTypeLabels[reversal.reversal_type] ||
              reversalTypeLabels.refund;
            const statusStyle =
              statusColors[reversal.status] || statusColors.pending;

            return (
              <View
                key={reversal.id}
                className="bg-[#303030] rounded-xl p-4 mb-2.5 border border-gray-700"
              >
                <View className="flex-row items-center justify-between mb-2">
                  {/* Type badge */}
                  <View className={`px-2 py-0.5 rounded ${typeConfig.bg}`}>
                    <Text
                      className={`text-xs font-bold ${typeConfig.color}`}
                    >
                      {typeConfig.label}
                    </Text>
                  </View>

                  {/* Amount */}
                  <Text className="text-base font-bold text-red-400">
                    -${reversal.amount.toFixed(2)}
                  </Text>
                </View>

                {/* Reason */}
                {reversal.reason_description && (
                  <Text className="text-sm text-gray-400 mb-2">
                    {reversal.reason_description}
                  </Text>
                )}

                {/* Timestamps */}
                <View className="flex-row items-center gap-3 mb-1.5">
                  <Text className="text-xs text-gray-500">
                    Requested:{" "}
                    {new Date(reversal.requested_at).toLocaleString()}
                  </Text>
                </View>
                {reversal.completed_at && (
                  <Text className="text-xs text-gray-500">
                    Completed:{" "}
                    {new Date(reversal.completed_at).toLocaleString()}
                  </Text>
                )}

                {/* Status badge */}
                <View className="flex-row justify-end mt-2">
                  <View
                    className={`px-2 py-0.5 rounded-full ${statusStyle.bg}`}
                  >
                    <Text
                      className={`text-xs font-semibold capitalize ${statusStyle.text}`}
                    >
                      {reversal.status}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Per-Item Refund Status */}
      {refundItems.length > 0 && (
        <View className="mb-4">
          <Text className="text-base font-bold text-white mb-3">
            Per-Item Refund Status
          </Text>
          {refundItems.map((refundItem) => {
            const matchedItem = order.items.find(
              (i) => i.db_order_item_id === refundItem.order_item_id,
            );
            return (
              <View
                key={refundItem.id}
                className="bg-[#303030] rounded-xl p-3 mb-2 border border-gray-700 flex-row items-center justify-between"
              >
                <View className="flex-1 mr-3">
                  <Text className="text-sm font-semibold text-white">
                    {matchedItem?.name || "Unknown Item"}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    Qty Refunded: {refundItem.quantity_refunded}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-red-400">
                  -${refundItem.total_refunded.toFixed(2)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View className="h-4" />
    </ScrollView>
  );
};

const SummaryRow = ({
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
    <Text
      className={`text-sm font-semibold ${color} ${bold ? "font-bold" : ""}`}
    >
      ${value.toFixed(2)}
    </Text>
  </View>
);

export default React.memo(RefundsTab);
