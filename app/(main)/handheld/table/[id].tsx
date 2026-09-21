import { useLocalSearchParams } from "expo-router";
import React, { Suspense } from "react";
import { View } from "react-native";

const TablePage = React.lazy(() => import("@/handheld/pages/TablePage"));

/** /handheld/table/[id] — a table's check, read-only (artifact screen 5). */
export default function HandheldTableRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <TablePage tableId={id ?? ""} />
    </Suspense>
  );
}
