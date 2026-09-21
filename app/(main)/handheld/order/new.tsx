import React, { Suspense } from "react";
import { View } from "react-native";

const NewOrderPage = React.lazy(() => import("@/handheld/pages/NewOrderPage"));

/** /handheld/order/new — start a takeout or delivery order (artifact screen S2). */
export default function HandheldNewOrderRoute() {
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <NewOrderPage />
    </Suspense>
  );
}
