import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const OrderPage = React.lazy(() => import("@/handheld/pages/OrderPage"));

/** /handheld/order/[id] — an order's check, read-only (artifact screen S3). */
export default function HandheldOrderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <OrderPage orderId={id ?? ""} />
    </Suspense>
  );
}
