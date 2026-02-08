import { PreviousOrder } from "@/lib/types";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

interface SummaryCardsProps {
  order: PreviousOrder;
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ order }) => {
  const tipTotal = useMemo(() => {
    if (!order.payments) return 0;
    return order.payments
      .filter((p) => !p.isVoided)
      .reduce((sum, p) => sum + (p.tip_amount || 0), 0);
  }, [order.payments]);

  const balanceDue = order.amount_due || 0;

  return (
    <View>
      {/* 2-column grid */}
      <View className="flex-row flex-wrap gap-3">
        <SummaryCard
          label="Order Total"
          value={order.total}
          borderColor="#3B82F6"
        />
        <SummaryCard
          label="Amount Paid"
          value={order.amount_paid || 0}
          borderColor="#22C55E"
        />
        <SummaryCard
          label="Tips"
          value={tipTotal}
          borderColor="#8B5CF6"
        />
        <SummaryCard
          label="Refunded"
          value={order.refundedAmount || 0}
          borderColor="#EF4444"
        />
      </View>

      {/* Full-width balance due card (only if > 0) */}
      {balanceDue > 0 && (
        <View
          className="bg-[#303030] rounded-xl p-4 mt-3"
          style={{ borderWidth: 1, borderColor: "#EAB308" }}
        >
          <Text className="text-xs text-yellow-400 mb-1">Balance Due</Text>
          <Text className="text-xl font-bold text-yellow-400">
            ${balanceDue.toFixed(2)}
          </Text>
        </View>
      )}
    </View>
  );
};

const SummaryCard = ({
  label,
  value,
  borderColor,
}: {
  label: string;
  value: number;
  borderColor: string;
}) => (
  <View
    className="bg-[#303030] rounded-xl p-4"
    style={{
      borderWidth: 1,
      borderColor,
      width: "48%",
      flexGrow: 1,
    }}
  >
    <Text className="text-xs text-gray-400 mb-1">{label}</Text>
    <Text className="text-lg font-bold text-white">${value.toFixed(2)}</Text>
  </View>
);

export default React.memo(SummaryCards);
