import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const SeatPage = React.lazy(() => import("@/handheld/pages/SeatPage"));

/** /handheld/seat/[tableId] — seat a free table (artifact screen 2). */
export default function HandheldSeatRoute() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <SeatPage tableId={tableId ?? ""} />
    </Suspense>
  );
}
