import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const CashPage = React.lazy(() => import("@/handheld/pages/CashPage"));

/** /handheld/pay/cash/[orderId] — take cash at the table (Wave 4b, UI only). */
export default function HandheldCashRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <CashPage orderId={orderId ?? ""} />
    </Suspense>
  );
}
