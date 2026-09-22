import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const ChargePage = React.lazy(() => import("@/handheld/pages/ChargePage"));

/** /handheld/pay/charge/[orderId] — tap to pay, then close (artifact screens 8, 9). */
export default function HandheldChargeRoute() {
  const { orderId, tip } = useLocalSearchParams<{ orderId: string; tip?: string }>();
  const parsed = Number(tip);
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <ChargePage
        orderId={orderId ?? ""}
        tip={Number.isFinite(parsed) && parsed > 0 ? parsed : 0}
      />
    </Suspense>
  );
}
