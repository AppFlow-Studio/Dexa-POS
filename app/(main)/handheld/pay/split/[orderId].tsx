import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const SplitPage = React.lazy(() => import("@/handheld/pages/SplitPage"));

/** /handheld/pay/split/[orderId] — split the check evenly, by seat or by item (Wave 4b, UI only). */
export default function HandheldSplitRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <SplitPage orderId={orderId ?? ""} />
    </Suspense>
  );
}
