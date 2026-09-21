import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const MenuPage = React.lazy(() => import("@/handheld/pages/MenuPage"));

/** /handheld/menu/[orderId] — add items to a check (artifact screens 3, 4, S4). */
export default function HandheldMenuRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <MenuPage orderId={orderId ?? ""} />
    </Suspense>
  );
}
