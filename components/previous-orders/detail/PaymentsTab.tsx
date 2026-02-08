import PaymentCoverageSection from "@/components/previous-orders/PaymentCoverageSection";
import PaymentTimelineSection from "@/components/previous-orders/PaymentTimelineSection";
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
        <Text className="text-gray-500 text-lg">No payments recorded</Text>
        <Text className="text-gray-600 text-sm mt-1">
          This order has no payment history
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
      <View className="mb-6">
        <Text className="text-lg font-bold text-white mb-3">
          Payment Timeline
        </Text>
        <PaymentTimelineSection order={mappedOrder} />
      </View>

      <View>
        <Text className="text-lg font-bold text-white mb-3">
          Payment Coverage
        </Text>
        <PaymentCoverageSection order={mappedOrder} />
      </View>

      <View className="h-4" />
    </ScrollView>
  );
};

export default React.memo(PaymentsTab);
