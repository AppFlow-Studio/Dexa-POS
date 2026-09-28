import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const PaymentsPage = React.lazy(() => import("@/handheld/pages/PaymentsPage"));

/** /handheld/payments/[orderId] — payments on a check, with tip adjust and refund (Wave 4b, UI only). */
export default function HandheldPaymentsRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <PaymentsPage orderId={orderId ?? ""} />
    </Suspense>
  );
}
