import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const RefundPage = React.lazy(() => import("@/handheld/pages/RefundPage"));

/** /handheld/refund/[orderId] — refund one payment after manager approval (Wave 4b, UI only). */
export default function HandheldRefundRoute() {
  const { orderId, paymentId, approvedBy } = useLocalSearchParams<{
    orderId: string;
    paymentId?: string;
    approvedBy?: string;
  }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <RefundPage orderId={orderId ?? ""} paymentId={paymentId ?? ""} approvedBy={approvedBy ?? ""} />
    </Suspense>
  );
}
