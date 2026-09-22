import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const PayPage = React.lazy(() => import("@/handheld/pages/PayPage"));

/** /handheld/pay/[orderId] — take payment (artifact screen 6). */
export default function HandheldPayRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <PayPage orderId={orderId ?? ""} />
    </Suspense>
  );
}
