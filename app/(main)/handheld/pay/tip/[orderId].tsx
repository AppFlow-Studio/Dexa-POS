import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const TipPage = React.lazy(() => import("@/handheld/pages/TipPage"));

/** /handheld/pay/tip/[orderId] — the guest adds a tip (artifact screen 7). */
export default function HandheldTipRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <TipPage orderId={orderId ?? ""} />
    </Suspense>
  );
}
