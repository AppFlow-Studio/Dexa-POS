import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const MergePage = React.lazy(() => import("@/handheld/pages/MergePage"));

/** /handheld/merge/[orderId] — merge other open checks into this one (Wave 4b, UI only). */
export default function HandheldMergeRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <MergePage orderId={orderId ?? ""} />
    </Suspense>
  );
}
