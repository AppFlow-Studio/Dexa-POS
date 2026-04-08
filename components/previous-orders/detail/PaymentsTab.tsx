import PaymentCoverageSection from "@/components/previous-orders/PaymentCoverageSection";
import PaymentTimelineSection from "@/components/previous-orders/PaymentTimelineSection";
import { colors } from "@/lib/theme";
import { PreviousOrder } from "@/lib/types";
import { previousOrderToOrderProfile } from "@/utils/previousOrderMapper";
import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

interface PaymentsTabProps {
  order: PreviousOrder;
}

const PaymentsTab: React.FC<PaymentsTabProps> = ({ order }) => {
  const mappedOrder = useMemo(
    () => previousOrderToOrderProfile(order),
    [order],
  );

  const hasPayments = order.payments && order.payments.length > 0;

  if (!hasPayments) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <Text style={{ fontSize: 18, color: colors.muted }}>
          No payments recorded
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
          This order has no payment history
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="mb-6">
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            color: colors.heading,
            marginBottom: 12,
          }}
        >
          Payment Timeline
        </Text>
        <PaymentTimelineSection order={mappedOrder} />
      </View>

      <View>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            color: colors.heading,
            marginBottom: 12,
          }}
        >
          Payment Coverage
        </Text>
        <PaymentCoverageSection order={mappedOrder} />
      </View>

      <View className="h-4" />
    </ScrollView>
  );
};

export default React.memo(PaymentsTab);
